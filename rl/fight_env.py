"""Python client for the fight-rl environment server (`npm run rl-server`).

    from fight_env import FightEnv
    env = FightEnv(opponent="cpu", cpu_level=3, frame_skip=4)
    obs, info = env.reset(seed=0)
    obs, reward, terminated, truncated, info = env.step(env.action_space.sample())

Follows the gymnasium API. If gymnasium is installed the class subclasses gymnasium.Env and
exposes Box / Discrete spaces; otherwise minimal stand-ins with .n / .shape / .sample() are used.

Actions: int in [0, 72) = (numpad - 1) + 9 * button_mask, J=1 K=2 L=4, directions relative to facing
(6 = forward, 4 = back/guard). encode_action(5) is the neutral action.
For self-play pass opponent="agent" and call step(action, action2); the opponent's view is info["obs2"].
"""
import json
import socket

import numpy as np

try:
    import gymnasium as gym
    from gymnasium import spaces

    _Base = gym.Env
except ImportError:
    gym = None
    spaces = None
    _Base = object


def encode_action(numpad=5, j=False, k=False, l=False):
    return (numpad - 1) + 9 * ((1 if j else 0) | (2 if k else 0) | (4 if l else 0))


class _Discrete:
    def __init__(self, n, rng):
        self.n = n
        self._rng = rng

    def sample(self):
        return int(self._rng.integers(self.n))


class _Box:
    def __init__(self, shape):
        self.shape = shape
        self.dtype = np.float32


_CONFIG_KEYS = {
    "p1": "p1",
    "p2": "p2",
    "agent_player": "agentPlayer",
    "opponent": "opponent",
    "cpu_level": "cpuLevel",
    "frame_skip": "frameSkip",
    "max_steps": "maxSteps",
    "relative_actions": "relativeActions",
    "button_pulse": "buttonPulse",
    "round_time": "roundTime",
    "reward_damage": "rewardDamage",
    "reward_win": "rewardWin",
}


class FightEnv(_Base):
    metadata = {"render_modes": []}

    def __init__(self, host="127.0.0.1", port=5555, timeout=30.0, **config):
        unknown = set(config) - set(_CONFIG_KEYS)
        if unknown:
            raise TypeError(f"unknown config keys: {sorted(unknown)}")
        self._config = {_CONFIG_KEYS[k]: v for k, v in config.items()}
        self._sock = socket.create_connection((host, port), timeout=timeout)
        self._sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._file = self._sock.makefile("rb")
        self._rng = np.random.default_rng()

        spec = self._call({"cmd": "spec"})
        self.spec_info = spec
        self.neutral_action = spec["neutralAction"]
        self.moves = spec["moves"]
        n, d = spec["actionCount"], spec["observationSize"]
        if spaces is not None:
            self.action_space = spaces.Discrete(n)
            self.observation_space = spaces.Box(-np.inf, np.inf, shape=(d,), dtype=np.float32)
        else:
            self.action_space = _Discrete(n, self._rng)
            self.observation_space = _Box((d,))

    def _call(self, msg):
        self._sock.sendall((json.dumps(msg) + "\n").encode("utf-8"))
        line = self._file.readline()
        if not line:
            raise ConnectionError("fight-rl server closed the connection")
        reply = json.loads(line)
        if not reply.pop("ok"):
            raise RuntimeError(reply.get("error"))
        return reply

    def reset(self, seed=None, options=None):
        if seed is not None:
            self._rng = np.random.default_rng(seed)
            if spaces is None:
                self.action_space._rng = self._rng
        msg = {"cmd": "reset", "seed": int(seed) if seed is not None else int(self._rng.integers(2**31))}
        config = {**self._config, **(options or {})}
        if config:
            msg["config"] = config
        r = self._call(msg)
        info = r["info"]
        info["obs2"] = np.asarray(r["obs2"], dtype=np.float32)
        return np.asarray(r["obs"], dtype=np.float32), info

    def step(self, action, action2=None):
        msg = {"cmd": "step", "action": int(action)}
        if action2 is not None:
            msg["action2"] = int(action2)
        r = self._call(msg)
        info = r["info"]
        info["obs2"] = np.asarray(r["obs2"], dtype=np.float32)
        info["reward2"] = r["reward2"]
        return np.asarray(r["obs"], dtype=np.float32), float(r["reward"]), r["terminated"], r["truncated"], info

    def close(self):
        if self._sock is None:
            return
        try:
            self._call({"cmd": "close"})
        except (OSError, ConnectionError, RuntimeError):
            pass
        self._file.close()
        self._sock.close()
        self._sock = None


if __name__ == "__main__":
    import argparse
    import time

    ap = argparse.ArgumentParser(description="Random agent smoke test against the CPU")
    ap.add_argument("--port", type=int, default=5555)
    ap.add_argument("--episodes", type=int, default=3)
    ap.add_argument("--level", type=int, default=3)
    args = ap.parse_args()

    env = FightEnv(port=args.port, opponent="cpu", cpu_level=args.level)
    print("obs dim", env.observation_space.shape, "actions", env.action_space.n)
    t0, steps = time.time(), 0
    for ep in range(args.episodes):
        obs, info = env.reset(seed=ep)
        ret, done = 0.0, False
        while not done:
            obs, r, term, trunc, info = env.step(env.action_space.sample())
            ret += r
            steps += 1
            done = term or trunc
        print(f"episode {ep}: return {ret:+.3f}  winner {info['winner']}  hp {info['hp']}  steps {info['step']}")
    print(f"{steps / (time.time() - t0):.0f} steps/s")
    env.close()
