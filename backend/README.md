# Pursuit-Evasion Backend

Python backend: custom Gymnasium environment, PPO training (stable-baselines3),
and a FastAPI WebSocket server that streams the live simulation at ~30 Hz.

## Setup

```powershell
cd backend
py -3.14 -m venv .venv          # any Python 3.10+ works
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

(macOS/Linux: `python3 -m venv .venv && source .venv/bin/activate`)

## Train

```powershell
# Full training run (~2M steps, produces a strong pursuer)
python train.py --timesteps 2000000

# Quick demo checkpoint (a few minutes on CPU)
python train.py --timesteps 150000 --run-name demo

# Self-play: train the evader against the frozen pursuer checkpoint
python train.py --agent evader --timesteps 1500000 --run-name evader_v1
```

- Checkpoints are written to `checkpoints/<run-name>/`, and the final model is
  also copied to `checkpoints/ppo_pursuer_latest.zip` — this is the path the
  server loads by default.
- TensorBoard logs go to `logs/<run-name>/`:

```powershell
tensorboard --logdir logs
```

Useful flags: `--timesteps`, `--run-name`, `--n-envs`, `--seed`,
`--checkpoint-every`, `--resume-from path/to/model.zip`.

## Serve

```powershell
uvicorn server:app --host 0.0.0.0 --port 8000
```

- WebSocket endpoint: `ws://localhost:8000/ws`
- Health check: `http://localhost:8000/health`
- Override the checkpoint with the `PURSUIT_CHECKPOINT` env var:

```powershell
$env:PURSUIT_CHECKPOINT = "checkpoints\demo\ppo_pursuer_final.zip"
uvicorn server:app --port 8000
```

If no checkpoint exists, the server still runs using the naive pursuit
heuristic so the frontend always has something to show.

## WebSocket protocol

Server → client, every frame (~30 Hz × speed multiplier):

```json
{
  "type": "frame",
  "episode": 3, "step": 214, "time": 7.13,
  "pursuer": {"pos": [x,y,z], "vel": [x,y,z]},
  "evader":  {"pos": [x,y,z], "vel": [x,y,z]},
  "distance": 4.02,
  "captured": false, "episode_over": false, "capture_count": 2,
  "pursuer_reward": 12.4, "evader_reward": -11.9,
  "paused": false, "speed": 1.0, "policy_mode": "ppo",
  "arena_size": 20.0, "capture_radius": 0.9
}
```

Client → server:

| Message | Payload |
| --- | --- |
| Reset | `{"type": "reset", "pursuer_pos": [x,y,z]?, "evader_pos": [x,y,z]?}` |
| Pause / resume | `{"type": "pause"}` / `{"type": "resume"}` |
| Sim speed | `{"type": "set_speed", "value": 0.25–4.0}` |
| Policy mode | `{"type": "set_policy_mode", "value": "ppo" \| "naive"}` |
| Evader mode | `{"type": "set_evader_mode", "value": "scripted" \| "ppo"}` |

## Environment

- **State**: pursuer + evader positions and velocities in a bounded 20×20×20
  arena (16-dim normalized observation).
- **Action**: pursuer acceleration vector in `[-1, 1]³`.
- **Evader**: scripted potential-field controller — flees the pursuer with
  urgency scaled by proximity, steers away from walls, small Gaussian noise.
  Slightly faster top speed than the pursuer; the pursuer is more agile
  (higher acceleration), so it must learn to cut corners and predict.
- **Reward (pursuer)**: dense closing-distance shaping + capture bonus
  − small time/effort/wall penalties. Episodes end on capture
  (distance < 0.9) or after 900 steps (30 s).
