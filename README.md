# Pursuit // Evasion — RL Simulation with Live 3D Visualization

A PPO agent learns pursuit-evasion dynamics in a bounded 3D arena, then runs
**live** on a Python backend while every simulation step streams over
WebSockets into a Three.js scene in your browser — an interactive sandbox for
watching learned strategies emerge and probing how the policy reacts to
different starting states.

The pursuer (red) is trained with PPO; the evader (cyan) is a scripted
potential-field controller that flees intelligently and avoids walls. The
evader has a higher top speed; the pursuer is more agile — so the pursuer has
to *learn* to predict and cut corners. After 2M training steps the PPO pursuer
captures **20/20** held-out episodes (mean 4.4s) where a naive pure-pursuit
heuristic manages 3/20 (mean 26.4s) — and you can toggle between the two live,
with a tactical overlay drawing the interception geometry so the difference in
strategy is visible on screen.

## Architecture

```
┌─────────────────────────────── backend (Python) ───────────────────────────────┐
│                                                                                 │
│  PursuitEvasionEnv (Gymnasium)          train.py (stable-baselines3 PPO)        │
│  ┌──────────────────────────┐   train   ┌──────────────────────────────┐        │
│  │ 3D positions+velocities  │──────────▶│ MlpPolicy 256×256            │        │
│  │ accel actions, walls,    │           │ TensorBoard + checkpoints    │        │
│  │ scripted fleeing evader  │           └──────────────┬───────────────┘        │
│  └────────────▲─────────────┘                          │ ppo_pursuer_latest.zip │
│               │ step(action) @ 30 Hz                   ▼                        │
│  server.py (FastAPI)                    ┌──────────────────────────────┐        │
│  ┌──────────────────────────┐  predict  │ loaded PPO policy            │        │
│  │ asyncio inference loop   │◀─────────▶│ (or naive heuristic, live-   │        │
│  │ pause/speed/reset state  │           │  switchable per message)     │        │
│  └────────────┬─────────────┘           └──────────────────────────────┘        │
│               │ JSON frames over WebSocket /ws       ▲                          │
└───────────────┼──────────────────────────────────────┼──────────────────────────┘
                ▼                                      │ control messages
┌─────────────────────────────── frontend (browser) ──┴──────────────────────────┐
│  wsClient.ts        simStore.ts              Three.js scene (R3F)              │
│  ┌────────────┐    ┌──────────────────┐     ┌────────────────────────────┐     │
│  │ auto-      │───▶│ liveBuffer (raw, │────▶│ interpolated agents, glow, │     │
│  │ reconnect  │    │  lerped per rAF) │     │ trails, bloom, capture FX  │     │
│  │ WebSocket  │───▶│ React snapshot   │────▶│ HUD: stats, sparkline,     │     │
│  └────────────┘    └──────────────────┘     │ controls, camera modes     │     │
│                                             └────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Pipeline**: the Gymnasium env defines the physics and rewards → PPO trains
against the scripted evader and saves a checkpoint → the FastAPI server loads
the checkpoint and steps the env at ~30 Hz in an asyncio loop, broadcasting
each frame as JSON → the browser interpolates between frames for fluid 60 fps
motion and renders both agents with Three.js, while the HUD sends control
messages (pause, reset, speed, policy mode) back up the same socket.

## Quick start

Two terminals.

**1 — backend** (a demo checkpoint is already included at
`backend/checkpoints/ppo_pursuer_latest.zip`):

```powershell
cd backend
py -3.14 -m venv .venv          # any Python 3.10+; skip if .venv exists
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn server:app --port 8000
```

**2 — frontend**:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — you should immediately see the pursuit running.

## Using the sandbox

- **Orbit** with the mouse; switch between **FREE / PURSUER / EVADER** cams, or
  **DIRECTOR** — an auto-director that holds a slow long-lens wide orbit and
  smash-cuts to a low handheld chase cam whenever the gap closes under 5 m.
- The look is a cinematic dusk grade: gradient sky with a low warm sun,
  reflective floor, haze, anamorphic streaks, film grain and letterbox — and
  it reacts to the chase: a red rim-light rises and the fog heats toward
  ember as the pursuer closes in, cooling back when the evader escapes.
- **⏸ PAUSE / ▶ RESUME**, **↺ RESET**, and a **speed slider** (0.25×–4×).
- **POLICY toggle**: flip between the trained PPO pursuer and the naive
  pure-pursuit heuristic mid-run and compare capture rates.
- **EVADER toggle**: swap the scripted potential-field evader for a PPO evader
  trained via self-play against the frozen pursuer.

## The arms race (alternating self-play)

Each generation trains against the previous one, frozen. 20 held-out episodes
per matchup:

| Matchup | Captures | Mean episode |
| --- | --- | --- |
| naive heuristic vs scripted evader | 3/20 | 26.4s |
| pursuer v1 (2M) vs scripted evader | **20/20** | 4.1s |
| pursuer v1 vs **evader v1** (1.5M self-play) | 2/20 | 27.5s |
| **pursuer v2** (2M vs evader v1) vs evader v1 | **20/20** | 6.1s |
| pursuer v2 vs scripted evader | 6/20 | 25.5s |
| **pursuer v3** (2M vs 50/50 opponent pool) vs scripted | **20/20** | 4.5s |
| pursuer v3 vs evader v1 | **20/20** | 5.9s |

The arc is the classic self-play story in miniature:

1. **v1 (specialist)** masters the scripted evader, but the self-play evader
   then exploits it (2/20).
2. **v2 (counter-specialist)** solves the learned evader — and exhibits
   **catastrophic forgetting**, dropping to 6/20 against the *scripted* one.
3. **v3 (generalist)** retrains against a 50/50 **opponent pool**
   (`--scripted-mix 0.5`) and holds 20/20 against both — the same reason
   production systems (AlphaStar's league, OpenAI Five) train against pools
   rather than only the latest adversary.

The server defaults to pursuer v3 (`checkpoints/ppo_pursuer_latest.zip`);
v1 and v2 ship alongside for comparison:

```powershell
$env:PURSUIT_CHECKPOINT = "checkpoints\ppo_pursuer_v1.zip"   # or _v2
uvicorn server:app --port 8000
```
- **⌖ PLACE**: click the arena floor twice — first click sets the pursuer's
  start, second sets the evader's — then hit RESET to run your scenario.
- **◎ TACT**: tactical overlay — dashed ghost trajectories for both agents,
  an amber interception line to the predicted meet point, and a green→red
  engagement line with a live gap readout. Flip PPO↔NAIVE with this on: the
  naive pursuer flies at the target, the learned one flies at where the
  target will be.
- The HUD shows live distance, episode timer, step count, captures, reward,
  connection status, and a distance-over-time sparkline (the dashed red line
  is the capture radius).
- On capture: white flash, shockwave ring across the floor, particle burst,
  "CAPTURE" title stamp, camera punch-in, brief pause, auto-reset.

## Training your own policy

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python train.py --timesteps 2000000        # stronger policy (~20 min CPU)
tensorboard --logdir logs                  # watch ep_len_mean fall = more captures
```

The server picks up `checkpoints/ppo_pursuer_latest.zip` on next start, or
point it elsewhere: `$env:PURSUIT_CHECKPOINT = "checkpoints\myrun\ppo_pursuer_final.zip"`.

See [backend/README.md](backend/README.md) for the full WebSocket protocol,
environment/reward details, and all training flags.

## Repo layout

```
backend/
  pursuit_evasion/env/pursuit_evasion_env.py   # Gymnasium env (physics, rewards, scripted evader)
  pursuit_evasion/policies.py                  # naive pursuit heuristic
  train.py                                     # PPO training, TensorBoard, checkpointing
  server.py                                    # FastAPI + WebSocket inference loop
  checkpoints/ppo_pursuer_latest.zip           # pre-trained demo policy
frontend/
  src/ws/wsClient.ts                           # WebSocket client, auto-reconnect
  src/store/simStore.ts                        # reactive snapshot + raw frame buffer
  src/scene/                                   # R3F scene: agents, trails, FX, cameras
  src/hud/                                     # glassmorphism HUD, controls, sparkline
```

## Tech

Python · Gymnasium · stable-baselines3 (PPO) · FastAPI · uvicorn — TypeScript ·
Vite · React · Three.js (@react-three/fiber, drei, postprocessing)
