"""Non-learned pursuer controller, used as the "naive" policy_mode so the
trained PPO behavior can be compared side-by-side against a simple heuristic."""

from __future__ import annotations

import numpy as np

from pursuit_evasion.env.pursuit_evasion_env import EnvConfig, _clip_norm


def naive_pursuit_action(
    pursuer_pos: np.ndarray,
    pursuer_vel: np.ndarray,
    evader_pos: np.ndarray,
    evader_vel: np.ndarray,
    cfg: EnvConfig,
) -> np.ndarray:
    """Simple proportional-navigation-style pure pursuit: accelerate toward
    a short lead on the evader's current heading, normalized to the same
    [-1, 1]^3 action space the PPO policy outputs."""
    lead_time = 0.35
    predicted = evader_pos + evader_vel * lead_time
    to_target = predicted - pursuer_pos
    dist = np.linalg.norm(to_target)
    direction = to_target / dist if dist > 1e-6 else np.zeros(3, dtype=np.float32)
    accel = _clip_norm(direction, 1.0)
    return accel.astype(np.float32)
