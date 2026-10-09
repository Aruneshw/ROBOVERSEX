"""
Roboverse X Live ROS Lab — tiny PTY-over-WebSocket bridge (runs INSIDE the lab container).
Protocol (client -> server):  "0<data>"  keystrokes      "1{"cols":120,"rows":30}"  resize
Server -> client: raw terminal output (text frames).
Only reachable on the internal docker network; the API proxies it after checking the team session.
"""
import asyncio
import fcntl
import json
import os
import pty
import signal
import struct
import termios

import websockets

PORT = int(os.environ.get("PTY_PORT", "7681"))
SHELL = os.environ.get("LAB_SHELL", "/bin/bash")


async def session(ws):
    pid, fd = pty.fork()
    if pid == 0:  # child: login-like interactive shell with ROS sourced
        os.environ.update(TERM="xterm-256color", HOME="/home/rvx", PS1=r"\[\e[1;36m\]rvx@ros-lab\[\e[0m\]:\w$ ")
        os.chdir("/home/rvx")
        os.execvp(SHELL, [SHELL, "--rcfile", "/opt/rvx/bashrc", "-i"])

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes] = asyncio.Queue()
    loop.add_reader(fd, lambda: queue.put_nowait(_read(fd)))

    async def pump_out():
        while True:
            data = await queue.get()
            if not data:
                await ws.close()
                return
            await ws.send(data.decode(errors="replace"))

    async def pump_in():
        async for msg in ws:
            if isinstance(msg, bytes):
                msg = msg.decode(errors="replace")
            if msg[:1] == "0":
                os.write(fd, msg[1:].encode())
            elif msg[:1] == "1":
                size = json.loads(msg[1:])
                fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", int(size["rows"]), int(size["cols"]), 0, 0))

    try:
        await asyncio.gather(pump_out(), pump_in())
    except websockets.ConnectionClosed:
        pass
    finally:
        loop.remove_reader(fd)
        try:
            os.kill(pid, signal.SIGHUP)
            os.waitpid(pid, 0)
        except (ProcessLookupError, ChildProcessError):
            pass
        os.close(fd)


def _read(fd: int) -> bytes:
    try:
        return os.read(fd, 65536)
    except OSError:
        return b""


async def main():
    async with websockets.serve(session, "0.0.0.0", PORT, max_size=2**20, ping_interval=20):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
