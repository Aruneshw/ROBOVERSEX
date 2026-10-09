"""
RVX-Sim arena extensions (Level 2 problem statements).

Adds to the rclpy shim, without changing engine.py / shim.py / runner.py:
  * /spawn  (turtlesim/srv/Spawn) — spawns a static named turtle ("guard"), max 10
  * /kill   (turtlesim/srv/Kill)
  * /<name>/pose topics for spawned turtles (published every tick, like turtlesim)
Spawn/kill are recorded in world.events so playback and evaluation can see them:
  {"tick", "type": "spawn", "name", "x", "y", "theta"}   {"tick", "type": "kill", "name"}

Usage: `import rvx_sim.arena` once (before rvx_sim.runner.run_program / judge).
"""
from __future__ import annotations

import re

from . import shim
from .engine import WORLD_SIZE, TurtleWorld, clamp, wrap_angle

MAX_SPAWNED = 10
_POSE_TOPIC = re.compile(r"^/([A-Za-z_][A-Za-z0-9_]*)/pose$")
_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _extra(world: TurtleWorld) -> dict:
    ext = getattr(world, "extra_turtles", None)
    if ext is None:
        ext = {}
        world.extra_turtles = ext
    return ext


def _svc_spawn(rt, r, t):
    w = rt.world
    ext = _extra(w)
    name = str(getattr(r, "name", "") or "")
    if not name:
        n = 2
        while f"turtle{n}" in ext:
            n += 1
        name = f"turtle{n}"
    if not _NAME.match(name):
        raise RuntimeError(f"Invalid turtle name [{name}]")
    if name == "turtle1" or name in ext:
        raise RuntimeError(f"A turtle named [{name}] already exists")
    if len(ext) >= MAX_SPAWNED:
        raise RuntimeError(f"Too many turtles (max {MAX_SPAWNED} spawned turtles)")
    x = clamp(float(r.x), 0.0, WORLD_SIZE)
    y = clamp(float(r.y), 0.0, WORLD_SIZE)
    th = wrap_angle(float(r.theta))
    ext[name] = {"x": x, "y": y, "theta": th}
    w.events.append({"tick": w.tick, "type": "spawn", "name": name, "x": round(x, 6), "y": round(y, 6), "theta": round(th, 6)})
    w.activity_tick = w.tick
    rt.log("INFO", "turtlesim", f"Spawning turtle [{name}] at x=[{x:.6f}], y=[{y:.6f}], theta=[{th:.6f}]")
    return shim.Spawn.Response(name=name)


def _svc_kill(rt, r, t):
    w = rt.world
    ext = _extra(w)
    name = str(getattr(r, "name", "") or "")
    if name == "turtle1":
        raise RuntimeError("turtle1 cannot be killed in the Roboverse X arena")
    if name not in ext:
        raise RuntimeError(f"Tried to kill turtle [{name}], which does not exist")
    del ext[name]
    w.events.append({"tick": w.tick, "type": "kill", "name": name})
    return shim.Kill.Response()


shim._SERVICES["/spawn"] = _svc_spawn
shim._SERVICES["/kill"] = _svc_kill

# ---- /<name>/pose subscriptions for spawned turtles
_orig_sub_init = shim.Subscription.__init__


def _sub_init(self, topic, callback, depth):
    _orig_sub_init(self, topic, callback, depth)
    m = _POSE_TOPIC.match(self.topic)
    if self.kind == "none" and m and m.group(1) != "turtle1":
        self.kind = "ext"
        self.ext_name = m.group(1)


shim.Subscription.__init__ = _sub_init

# ---- publish spawned-turtle poses every tick (the runtime is attached in install())
_orig_step = TurtleWorld.step


def _step(self):
    _orig_step(self)
    rt = getattr(self, "_rvx_rt", None)
    ext = getattr(self, "extra_turtles", None)
    if rt is None or not ext:
        return
    for node in rt.nodes:
        for sub in node._subs:
            if sub.kind == "ext":
                p = ext.get(sub.ext_name)
                if p is not None:
                    sub.queue.append({"x": p["x"], "y": p["y"], "theta": p["theta"],
                                      "linear_velocity": 0.0, "angular_velocity": 0.0})
                    if len(sub.queue) > sub.depth:
                        del sub.queue[0]


TurtleWorld.step = _step

_orig_install = shim.install


def _install(rt):
    _orig_install(rt)
    rt.world._rvx_rt = rt
    _extra(rt.world)


shim.install = _install
