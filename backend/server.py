"""FastAPI WebSocket server that runs the pursuit-evasion simulation live.

Loads the trained PPO policy, steps the environment at ~30Hz (scaled by a
client-controlled speed multiplier), and broadcasts every frame as JSON to all
connected WebSocket clients on /ws.

Incoming client messages (JSON):
    {"type": "reset", "pursuer_pos": [x,y,z]?, "evader_pos": [x,y,z]?}
    {"type": "pause"}
    {"type": "resume"}
    {"type": "set_speed", "value": 0.25..4.0}
    {"type": "set_policy_mode", "value": "ppo" | "naive"}
    {"type": "set_evader_mode", "value": "scripted" | "ppo"}

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pursuit_evasion.env.evader_env import evader_obs
from pursuit_evasion.env.pursuit_evasion_env import EnvConfig, PursuitEvasionEnv
from pursuit_evasion.policies import naive_pursuit_action

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("pursuit-server")

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CHECKPOINT = os.path.join(BACKEND_DIR, "checkpoints", "ppo_pursuer_latest.zip")
CHECKPOINT_PATH = os.environ.get("PURSUIT_CHECKPOINT", DEFAULT_CHECKPOINT)
DEFAULT_EVADER_CHECKPOINT = os.path.join(BACKEND_DIR, "checkpoints", "ppo_evader_latest.zip")
EVADER_CHECKPOINT_PATH = os.environ.get("EVADER_CHECKPOINT", DEFAULT_EVADER_CHECKPOINT)

BASE_HZ = 30.0
CAPTURE_PAUSE_S = 1.2  # linger after a capture before auto-reset


class SimulationManager:
    """Owns the environment, the policy, the sim loop, and connected clients."""

    def __init__(self) -> None:
        self.env = PursuitEvasionEnv(EnvConfig())
        self.model = None  # loaded lazily in lifespan (torch import is slow)
        self.evader_model = None
        self.obs: np.ndarray | None = None

        self.paused = False
        self.speed = 1.0
        self.policy_mode = "ppo"
        self.evader_mode = "scripted"
        self.episode = 0
        self.capture_count = 0
        self.pending_reset_options: dict | None = None
        self._reset_requested = False

        self.clients: set[WebSocket] = set()
        self.lock = asyncio.Lock()

    # ---------------------------------------------------------------- #
    def load_model(self) -> None:
        from stable_baselines3 import PPO  # deferred: heavy import

        if os.path.exists(CHECKPOINT_PATH):
            self.model = PPO.load(CHECKPOINT_PATH, device="cpu")
            logger.info("Loaded PPO checkpoint: %s", CHECKPOINT_PATH)
        else:
            logger.warning(
                "No checkpoint found at %s — falling back to naive policy. "
                "Run train.py to create one.",
                CHECKPOINT_PATH,
            )
            self.policy_mode = "naive"

        if os.path.exists(EVADER_CHECKPOINT_PATH):
            self.evader_model = PPO.load(EVADER_CHECKPOINT_PATH, device="cpu")
            logger.info("Loaded evader checkpoint: %s", EVADER_CHECKPOINT_PATH)
        else:
            logger.info(
                "No evader checkpoint at %s — evader runs scripted only. "
                "Train one with: python train.py --agent evader",
                EVADER_CHECKPOINT_PATH,
            )

    def reset_env(self, options: dict | None = None) -> None:
        self.obs, _ = self.env.reset(options=options)
        self.episode += 1

    def compute_action(self) -> np.ndarray:
        if self.policy_mode == "ppo" and self.model is not None:
            action, _ = self.model.predict(self.obs, deterministic=True)
            return action
        return naive_pursuit_action(
            self.env.pursuer_pos,
            self.env.pursuer_vel,
            self.env.evader_pos,
            self.env.evader_vel,
            self.env.cfg,
        )

    def compute_evader_action(self) -> np.ndarray | None:
        """None → env falls back to the scripted potential-field evader."""
        if self.evader_mode == "ppo" and self.evader_model is not None:
            action, _ = self.evader_model.predict(evader_obs(self.env), deterministic=True)
            return action
        return None

    def make_frame(self, captured: bool, terminated: bool, truncated: bool) -> dict:
        env = self.env
        return {
            "type": "frame",
            "episode": self.episode,
            "step": env.step_count,
            "time": round(env.step_count * env.cfg.dt, 3),
            "pursuer": {
                "pos": [round(float(v), 4) for v in env.pursuer_pos],
                "vel": [round(float(v), 4) for v in env.pursuer_vel],
            },
            "evader": {
                "pos": [round(float(v), 4) for v in env.evader_pos],
                "vel": [round(float(v), 4) for v in env.evader_vel],
            },
            "distance": round(float(np.linalg.norm(env.evader_pos - env.pursuer_pos)), 4),
            "captured": captured,
            "episode_over": terminated or truncated,
            "capture_count": self.capture_count,
            "pursuer_reward": round(env.cumulative_pursuer_reward, 3),
            "evader_reward": round(env.cumulative_evader_reward, 3),
            "paused": self.paused,
            "speed": self.speed,
            "policy_mode": self.policy_mode,
            "evader_mode": self.evader_mode,
            "arena_size": env.cfg.arena_size,
            "capture_radius": env.cfg.capture_radius,
        }

    def make_status(self) -> dict:
        return {
            "type": "status",
            "paused": self.paused,
            "speed": self.speed,
            "policy_mode": self.policy_mode,
            "evader_mode": self.evader_mode,
            "episode": self.episode,
            "capture_count": self.capture_count,
            "arena_size": self.env.cfg.arena_size,
            "capture_radius": self.env.cfg.capture_radius,
            "model_loaded": self.model is not None,
            "evader_model_loaded": self.evader_model is not None,
        }

    # ---------------------------------------------------------------- #
    async def broadcast(self, payload: dict) -> None:
        if not self.clients:
            return
        message = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in self.clients:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def handle_message(self, ws: WebSocket, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await ws.send_text(json.dumps({"type": "error", "message": "invalid JSON"}))
            return

        msg_type = msg.get("type")
        async with self.lock:
            if msg_type == "reset":
                options: dict = {}
                for key in ("pursuer_pos", "evader_pos"):
                    val = msg.get(key)
                    if isinstance(val, (list, tuple)) and len(val) == 3:
                        half = self.env.cfg.arena_size / 2.0
                        options[key] = [float(np.clip(float(v), -half, half)) for v in val]
                self.pending_reset_options = options or None
                self._reset_requested = True
            elif msg_type == "pause":
                self.paused = True
            elif msg_type == "resume":
                self.paused = False
            elif msg_type == "set_speed":
                try:
                    self.speed = float(np.clip(float(msg.get("value", 1.0)), 0.25, 4.0))
                except (TypeError, ValueError):
                    pass
            elif msg_type == "set_policy_mode":
                value = msg.get("value")
                if value in ("ppo", "naive"):
                    if value == "ppo" and self.model is None:
                        await ws.send_text(
                            json.dumps({"type": "error", "message": "no PPO checkpoint loaded"})
                        )
                    else:
                        self.policy_mode = value
            elif msg_type == "set_evader_mode":
                value = msg.get("value")
                if value in ("scripted", "ppo"):
                    if value == "ppo" and self.evader_model is None:
                        await ws.send_text(
                            json.dumps({"type": "error", "message": "no evader checkpoint loaded"})
                        )
                    else:
                        self.evader_mode = value
            else:
                await ws.send_text(
                    json.dumps({"type": "error", "message": f"unknown message type: {msg_type}"})
                )
        await self.broadcast(self.make_status())

    # ---------------------------------------------------------------- #
    async def run_loop(self) -> None:
        """Main simulation loop. Steps the env at BASE_HZ * speed and
        broadcasts each frame. Runs forever as a background task."""
        self.reset_env()
        logger.info("Simulation loop started")

        while True:
            frame_start = time.perf_counter()

            async with self.lock:
                if self._reset_requested:
                    self.reset_env(self.pending_reset_options)
                    self.pending_reset_options = None
                    self._reset_requested = False
                    await self.broadcast(self.make_frame(False, False, False))

                if not self.paused and self.clients:
                    action = self.compute_action()
                    evader_action = self.compute_evader_action()
                    self.obs, _reward, terminated, truncated, info = self.env.step(
                        action, evader_action=evader_action
                    )
                    captured = bool(info["captured"])
                    if captured:
                        self.capture_count += 1

                    await self.broadcast(self.make_frame(captured, terminated, truncated))

                    if terminated or truncated:
                        # let the capture moment breathe on the client,
                        # then start a fresh episode
                        await self.broadcast(
                            {
                                "type": "episode_end",
                                "episode": self.episode,
                                "captured": captured,
                                "steps": self.env.step_count,
                                "capture_count": self.capture_count,
                            }
                        )
                        await asyncio.sleep(CAPTURE_PAUSE_S if captured else 0.4)
                        self.reset_env()

            target_dt = 1.0 / (BASE_HZ * self.speed)
            elapsed = time.perf_counter() - frame_start
            await asyncio.sleep(max(0.0, target_dt - elapsed))


manager = SimulationManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    manager.load_model()
    loop_task = asyncio.create_task(manager.run_loop())
    yield
    loop_task.cancel()


app = FastAPI(title="Pursuit-Evasion RL Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": manager.model is not None,
        "policy_mode": manager.policy_mode,
        "clients": len(manager.clients),
        "episode": manager.episode,
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    manager.clients.add(ws)
    logger.info("Client connected (%d total)", len(manager.clients))
    try:
        await ws.send_text(json.dumps(manager.make_status()))
        while True:
            raw = await ws.receive_text()
            await manager.handle_message(ws, raw)
    except WebSocketDisconnect:
        pass
    finally:
        manager.clients.discard(ws)
        logger.info("Client disconnected (%d total)", len(manager.clients))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
