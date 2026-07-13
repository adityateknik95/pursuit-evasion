"""Evader-side self-play environment.

The RL agent controls the *evader*; the pursuer is driven by a frozen PPO
checkpoint (the strong pursuer trained first). This turns evader training into
a plain single-agent problem against a fixed learned opponent — one alternation
of self-play.

The evader's observation mirrors the pursuer's 16-dim layout but self-first:
[e_pos(3), e_vel(3), p_pos(3), p_vel(3), rel_to_pursuer(3), dist(1)].
"""

from __future__ import annotations

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .pursuit_evasion_env import EnvConfig, PursuitEvasionEnv


def evader_obs(env: PursuitEvasionEnv) -> np.ndarray:
    """Evader-centric observation (self first), matching training layout.
    Also used by the live server when running a learned evader."""
    half = env.cfg.arena_size / 2.0
    rel = env.pursuer_pos - env.evader_pos
    dist = np.linalg.norm(rel)
    return np.concatenate(
        [
            env.evader_pos / half,
            env.evader_vel / env.cfg.evader_max_speed,
            env.pursuer_pos / half,
            env.pursuer_vel / env.cfg.pursuer_max_speed,
            rel / half,
            [dist / env.cfg.arena_size],
        ]
    ).astype(np.float32)


class EvaderSelfPlayEnv(gym.Env):
    """Evader (agent) vs. a frozen PPO pursuer in the shared arena dynamics."""

    metadata = {"render_modes": []}

    def __init__(self, pursuer_checkpoint: str, config: EnvConfig | None = None):
        super().__init__()
        from stable_baselines3 import PPO  # deferred: heavy import

        self.inner = PursuitEvasionEnv(config)
        self.pursuer_model = PPO.load(pursuer_checkpoint, device="cpu")

        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(3,), dtype=np.float32)
        obs_high = np.full(16, 4.0, dtype=np.float32)
        self.observation_space = spaces.Box(low=-obs_high, high=obs_high, dtype=np.float32)

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        _, info = self.inner.reset(seed=seed, options=options)
        return evader_obs(self.inner), info

    def step(self, action: np.ndarray):
        pursuer_action, _ = self.pursuer_model.predict(self.inner._get_obs(), deterministic=True)
        _, _, terminated, truncated, info = self.inner.step(pursuer_action, evader_action=action)
        return evader_obs(self.inner), info["evader_step_reward"], terminated, truncated, info
