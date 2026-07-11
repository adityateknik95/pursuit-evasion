"""Continuous 3D pursuit-evasion Gymnasium environment.

The RL agent controls the *pursuer*. The *evader* is a scripted, potential-field
"smart fleeing" controller that runs away from the pursuer while avoiding the
arena walls. This keeps training a plain single-agent PPO problem while still
producing rich, reactive multi-agent dynamics.

State (observation) is the concatenation of both agents' positions and
velocities plus a few derived features (relative vector, distance), all
normalized to roughly [-1, 1] to make PPO's job easier.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import gymnasium as gym
import numpy as np
from gymnasium import spaces


@dataclass
class EnvConfig:
    arena_size: float = 20.0          # cube side length, centered at origin
    dt: float = 1.0 / 30.0            # physics step, matches the 30Hz live loop
    max_steps: int = 900              # 30s of simulated time per episode

    capture_radius: float = 0.9

    pursuer_max_speed: float = 4.6
    pursuer_max_accel: float = 9.0    # "more agile"

    evader_max_speed: float = 5.3     # "slightly faster"
    evader_max_accel: float = 6.5

    wall_margin: float = 2.5          # evader wall-avoidance sensing distance
    wall_bounce_damping: float = 0.35 # velocity retained after a wall bounce

    closing_reward_coef: float = 6.0
    capture_bonus: float = 60.0
    time_penalty: float = 0.01
    effort_penalty_coef: float = 0.002
    out_of_bounds_penalty: float = 0.05

    evader_noise_std: float = 0.15    # small stochasticity so runs aren't identical


def _clip_norm(vec: np.ndarray, max_norm: float) -> np.ndarray:
    n = np.linalg.norm(vec)
    if n > max_norm and n > 1e-8:
        return vec * (max_norm / n)
    return vec


class PursuitEvasionEnv(gym.Env):
    """Pursuer (agent) vs. scripted evader in a bounded 3D arena."""

    metadata = {"render_modes": []}

    def __init__(self, config: EnvConfig | None = None):
        super().__init__()
        self.cfg = config or EnvConfig()
        half = self.cfg.arena_size / 2.0
        self.low = np.array([-half, -half, -half], dtype=np.float32)
        self.high = np.array([half, half, half], dtype=np.float32)

        # action: pursuer acceleration command in [-1, 1]^3, scaled by max_accel
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(3,), dtype=np.float32)

        # observation: [p_pos(3), p_vel(3), e_pos(3), e_vel(3), rel(3), dist(1)] = 16
        obs_high = np.full(16, 4.0, dtype=np.float32)
        self.observation_space = spaces.Box(low=-obs_high, high=obs_high, dtype=np.float32)

        self.pursuer_pos = np.zeros(3, dtype=np.float32)
        self.pursuer_vel = np.zeros(3, dtype=np.float32)
        self.evader_pos = np.zeros(3, dtype=np.float32)
        self.evader_vel = np.zeros(3, dtype=np.float32)

        self.step_count = 0
        self.cumulative_pursuer_reward = 0.0
        self.cumulative_evader_reward = 0.0
        self._rng = np.random.default_rng()

    # ------------------------------------------------------------------ #
    # Gym API
    # ------------------------------------------------------------------ #
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        if seed is not None:
            self._rng = np.random.default_rng(seed)

        options = options or {}
        half = self.cfg.arena_size / 2.0
        spawn_margin = half * 0.7

        pursuer_start = options.get("pursuer_pos")
        evader_start = options.get("evader_pos")

        if pursuer_start is not None:
            self.pursuer_pos = np.array(pursuer_start, dtype=np.float32)
        else:
            self.pursuer_pos = self._rng.uniform(-spawn_margin, spawn_margin, size=3).astype(np.float32)

        if evader_start is not None:
            self.evader_pos = np.array(evader_start, dtype=np.float32)
        else:
            # keep the evader from spawning right on top of the pursuer
            for _ in range(20):
                candidate = self._rng.uniform(-spawn_margin, spawn_margin, size=3).astype(np.float32)
                if np.linalg.norm(candidate - self.pursuer_pos) > self.cfg.arena_size * 0.25:
                    self.evader_pos = candidate
                    break
            else:
                self.evader_pos = candidate

        self.pursuer_vel = np.zeros(3, dtype=np.float32)
        self.evader_vel = np.zeros(3, dtype=np.float32)

        self.step_count = 0
        self.cumulative_pursuer_reward = 0.0
        self.cumulative_evader_reward = 0.0

        return self._get_obs(), self._get_info(captured=False)

    def step(self, action: np.ndarray):
        action = np.clip(np.asarray(action, dtype=np.float32), -1.0, 1.0)
        pursuer_accel = action * self.cfg.pursuer_max_accel

        evader_accel = self.scripted_evader_action(self.evader_pos, self.evader_vel, self.pursuer_pos)

        prev_dist = float(np.linalg.norm(self.evader_pos - self.pursuer_pos))

        self.pursuer_pos, self.pursuer_vel, p_hit_wall = self._integrate(
            self.pursuer_pos, self.pursuer_vel, pursuer_accel, self.cfg.pursuer_max_speed
        )
        self.evader_pos, self.evader_vel, e_hit_wall = self._integrate(
            self.evader_pos, self.evader_vel, evader_accel, self.cfg.evader_max_speed
        )

        dist = float(np.linalg.norm(self.evader_pos - self.pursuer_pos))
        captured = dist < self.cfg.capture_radius

        pursuer_reward = self.cfg.closing_reward_coef * (prev_dist - dist)
        pursuer_reward -= self.cfg.time_penalty
        pursuer_reward -= self.cfg.effort_penalty_coef * float(np.dot(action, action))
        if p_hit_wall:
            pursuer_reward -= self.cfg.out_of_bounds_penalty
        if captured:
            pursuer_reward += self.cfg.capture_bonus

        evader_reward = -self.cfg.closing_reward_coef * (prev_dist - dist)
        evader_reward += self.cfg.time_penalty * 2.0
        if e_hit_wall:
            evader_reward -= self.cfg.out_of_bounds_penalty
        if captured:
            evader_reward -= self.cfg.capture_bonus

        self.cumulative_pursuer_reward += pursuer_reward
        self.cumulative_evader_reward += evader_reward

        self.step_count += 1
        terminated = bool(captured)
        truncated = self.step_count >= self.cfg.max_steps

        return self._get_obs(), pursuer_reward, terminated, truncated, self._get_info(captured=captured)

    # ------------------------------------------------------------------ #
    # Dynamics helpers
    # ------------------------------------------------------------------ #
    def _integrate(self, pos: np.ndarray, vel: np.ndarray, accel: np.ndarray, max_speed: float):
        dt = self.cfg.dt
        new_vel = vel + accel * dt
        new_vel = _clip_norm(new_vel, max_speed)
        new_pos = pos + new_vel * dt

        hit_wall = False
        half = self.cfg.arena_size / 2.0
        for axis in range(3):
            if new_pos[axis] > half:
                new_pos[axis] = half
                new_vel[axis] = -abs(new_vel[axis]) * self.cfg.wall_bounce_damping
                hit_wall = True
            elif new_pos[axis] < -half:
                new_pos[axis] = -half
                new_vel[axis] = abs(new_vel[axis]) * self.cfg.wall_bounce_damping
                hit_wall = True

        return new_pos.astype(np.float32), new_vel.astype(np.float32), hit_wall

    def scripted_evader_action(self, evader_pos: np.ndarray, evader_vel: np.ndarray, pursuer_pos: np.ndarray) -> np.ndarray:
        """Potential-field fleeing controller: run away from the pursuer,
        steer away from walls, blended into a single acceleration command."""
        away = evader_pos - pursuer_pos
        dist = np.linalg.norm(away)
        if dist < 1e-6:
            flee_dir = self._rng.uniform(-1, 1, size=3)
        else:
            flee_dir = away / dist
        # stronger urgency the closer the pursuer gets
        urgency = np.clip(6.0 / (dist + 0.5), 0.4, 3.0)
        flee_force = flee_dir * urgency

        half = self.cfg.arena_size / 2.0
        wall_force = np.zeros(3, dtype=np.float32)
        for axis in range(3):
            dist_to_pos_wall = half - evader_pos[axis]
            dist_to_neg_wall = evader_pos[axis] + half
            if dist_to_pos_wall < self.cfg.wall_margin:
                wall_force[axis] -= (self.cfg.wall_margin - dist_to_pos_wall) / self.cfg.wall_margin
            if dist_to_neg_wall < self.cfg.wall_margin:
                wall_force[axis] += (self.cfg.wall_margin - dist_to_neg_wall) / self.cfg.wall_margin

        noise = self._rng.normal(0, self.cfg.evader_noise_std, size=3)
        combined = flee_force + wall_force * 4.0 + noise
        combined = _clip_norm(combined, 1.0)
        return (combined * self.cfg.evader_max_accel).astype(np.float32)

    # ------------------------------------------------------------------ #
    # Observation / info
    # ------------------------------------------------------------------ #
    def _get_obs(self) -> np.ndarray:
        half = self.cfg.arena_size / 2.0
        rel = self.evader_pos - self.pursuer_pos
        dist = np.linalg.norm(rel)
        obs = np.concatenate(
            [
                self.pursuer_pos / half,
                self.pursuer_vel / self.cfg.pursuer_max_speed,
                self.evader_pos / half,
                self.evader_vel / self.cfg.evader_max_speed,
                rel / half,
                [dist / self.cfg.arena_size],
            ]
        ).astype(np.float32)
        return obs

    def _get_info(self, captured: bool) -> dict:
        dist = float(np.linalg.norm(self.evader_pos - self.pursuer_pos))
        return {
            "distance": dist,
            "captured": captured,
            "step": self.step_count,
            "pursuer_reward": self.cumulative_pursuer_reward,
            "evader_reward": self.cumulative_evader_reward,
        }
