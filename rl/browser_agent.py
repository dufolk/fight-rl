"""Drive a fighter in the live browser game from Python.

    pip install websockets
    python rl/browser_agent.py              # listens on ws://localhost:8765
    open http://localhost:8080/?mode=cpu&agent=ws://localhost:8765&agentPlayer=2

The page sends {"type": "obs", "obs": [...], "player", "frame", "hp"} every `skip` frames and plays
the most recent {"action": n} it received. Replace `policy` with your trained model.
"""
import asyncio
import json
import random

import websockets

from fight_env import encode_action

NEUTRAL = encode_action(5)


def policy(obs, info):
    if random.random() < 0.5:
        return NEUTRAL
    return random.randrange(72)


async def serve(ws):
    print("browser connected")
    async for raw in ws:
        msg = json.loads(raw)
        if msg.get("type") == "obs":
            await ws.send(json.dumps({"action": int(policy(msg["obs"], msg))}))
    print("browser disconnected")


async def main(port=8765):
    async with websockets.serve(serve, "localhost", port):
        print(f"agent bridge on ws://localhost:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
