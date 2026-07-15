"""Train a PPO agent on the pursuit-evasion arena.

Default trains the *pursuer* against the scripted potential-field evader.
With --agent evader it instead trains the *evader* against a frozen PPO
pursuer checkpoint (one alternation of self-play).

Usage:
    python train.py --timesteps 2_000_000
    python train.py --timesteps 20_000 --run-name smoke_test
    python train.py --agent evader --pursuer-checkpoint checkpoints/ppo_pursuer_latest.zip

Produces:
    checkpoints/<run-name>/ppo_pursuer_final.zip   (final policy)
    checkpoints/<run-name>/ppo_pursuer_<n>_steps.zip (periodic checkpoints)
    logs/<run-name>/                                (TensorBoard event files)
"""

from __future__ import annotations

import argparse
import os
import time

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.monitor import Monitor

from pursuit_evasion.env.evader_env import EvaderSelfPlayEnv, PursuerSelfPlayEnv
from pursuit_evasion.env.pursuit_evasion_env import EnvConfig, PursuitEvasionEnv

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT_DIR = os.path.join(BACKEND_DIR, "checkpoints")
LOG_DIR = os.path.join(BACKEND_DIR, "logs")


def make_env(agent: str, pursuer_checkpoint: str | None, evader_checkpoint: str | None):
    def _init():
        if agent == "evader":
            env = EvaderSelfPlayEnv(pursuer_checkpoint, EnvConfig())
        elif evader_checkpoint:
            # round 2+ of alternating self-play: pursuer vs a frozen learned evader
            env = PursuerSelfPlayEnv(evader_checkpoint, EnvConfig())
        else:
            env = PursuitEvasionEnv(EnvConfig())
        return Monitor(env)

    return _init


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train PPO on PursuitEvasionEnv")
    parser.add_argument("--timesteps", type=int, default=2_000_000, help="total training timesteps")
    parser.add_argument("--run-name", type=str, default="ppo_pursuer", help="subfolder name for logs/checkpoints")
    parser.add_argument("--n-envs", type=int, default=8, help="number of parallel envs")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--checkpoint-every", type=int, default=50_000, help="timesteps between checkpoints")
    parser.add_argument("--resume-from", type=str, default=None, help="path to a .zip to resume training from")
    parser.add_argument("--agent", choices=["pursuer", "evader"], default="pursuer",
                        help="which side to train; evader trains against a frozen pursuer")
    parser.add_argument("--pursuer-checkpoint", type=str,
                        default=os.path.join(CHECKPOINT_DIR, "ppo_pursuer_latest.zip"),
                        help="frozen pursuer policy used when --agent evader")
    parser.add_argument("--evader-checkpoint", type=str, default=None,
                        help="frozen evader policy; when training the pursuer, replaces the scripted evader")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    run_ckpt_dir = os.path.join(CHECKPOINT_DIR, args.run_name)
    run_log_dir = os.path.join(LOG_DIR, args.run_name)
    os.makedirs(run_ckpt_dir, exist_ok=True)
    os.makedirs(run_log_dir, exist_ok=True)

    vec_env = make_vec_env(
        make_env(args.agent, args.pursuer_checkpoint, args.evader_checkpoint),
        n_envs=args.n_envs,
        seed=args.seed,
    )

    if args.resume_from:
        model = PPO.load(args.resume_from, env=vec_env, tensorboard_log=run_log_dir)
        print(f"Resumed PPO model from {args.resume_from}")
    else:
        model = PPO(
            policy="MlpPolicy",
            env=vec_env,
            learning_rate=3e-4,
            n_steps=1024,
            batch_size=1024,
            n_epochs=10,
            gamma=0.99,
            gae_lambda=0.95,
            clip_range=0.2,
            ent_coef=0.005,
            vf_coef=0.5,
            max_grad_norm=0.5,
            policy_kwargs=dict(net_arch=dict(pi=[256, 256], vf=[256, 256])),
            tensorboard_log=run_log_dir,
            seed=args.seed,
            verbose=1,
        )

    checkpoint_callback = CheckpointCallback(
        save_freq=max(args.checkpoint_every // args.n_envs, 1),
        save_path=run_ckpt_dir,
        name_prefix=f"ppo_{args.agent}",
    )

    start = time.time()
    model.learn(
        total_timesteps=args.timesteps,
        callback=checkpoint_callback,
        tb_log_name=args.run_name,
        reset_num_timesteps=args.resume_from is None,
        progress_bar=False,
    )
    elapsed = time.time() - start
    print(f"Training finished in {elapsed:.1f}s ({args.timesteps} timesteps)")

    final_path = os.path.join(run_ckpt_dir, f"ppo_{args.agent}_final")
    model.save(final_path)
    print(f"Saved final model to {final_path}.zip")

    # Also drop a copy at the top level of checkpoints/ so the server's default
    # path always finds the most recently completed run.
    latest_path = os.path.join(CHECKPOINT_DIR, f"ppo_{args.agent}_latest")
    model.save(latest_path)
    print(f"Saved latest-alias model to {latest_path}.zip")


if __name__ == "__main__":
    main()
