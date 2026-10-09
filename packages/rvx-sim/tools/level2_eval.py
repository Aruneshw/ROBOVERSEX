"""
Level 2 auto-evaluation (Python mirror of apps/web/src/rvx-runtime/tasks.ts).

    evaluate(task, trace, code) -> {"passed": bool, "score": float|None, "checks": [{"id","label","ok","detail"}]}

`trace` is rvx_sim.runner.run_program(...) output; `task` an entry of tasks.data.json.
"""
from __future__ import annotations

import math

from rvx_sim.score import score_trace


def _visible(trace):
    first = trace["clears"][-1][1] if trace.get("clears") else 0
    return trace["segments"][first:]


def _final(trace):
    p = trace["poses"]
    return p[-3], p[-2], p[-1]


def evaluate(task: dict, trace: dict, code: str = "") -> dict:
    checks = []
    add = lambda cid, label, ok, detail="": checks.append({"id": cid, "label": label, "ok": bool(ok), "detail": detail})
    score = None
    events = trace.get("events", [])
    finished = trace.get("status") == "finished"
    poses = trace["poses"]
    for c in task["checks"]:
        name, _, arg = c.partition(":")
        if name == "goal_reached":
            g = task["goal"]
            x, y, _ = _final(trace)
            d = math.hypot(x - g["x"], y - g["y"])
            add(c, f"Target reached (≤ {g['tolerance']})", finished and d <= g["tolerance"], f"final distance {d:.3f}")
        elif name == "stopped":
            # a finished run only ends once turtle1 is at rest (the last Twist is drained), so the
            # final pose is the rest pose; time_limit means it never settled
            add(c, "Stopped at the end", finished, "" if finished else trace.get("error") or trace["status"])
        elif name == "goal_log":
            ok = any("goal reached" in (l.get("msg") or "").lower() for l in trace.get("logs", []))
            add(c, 'Logged "Goal reached"', ok)
        elif name == "closed_loop":
            add(c, "Closed loop (/turtle1/pose → /turtle1/cmd_vel)", "turtle1/pose" in code and "cmd_vel" in code)
        elif name == "no_teleport":
            n = sum(1 for e in events if e["type"] == "teleport")
            add(c, "No teleport", n == 0, f"{n} teleport call(s)" if n else "")
        elif name == "guards_spawned":
            spawned = {e["name"]: e for e in events if e["type"] == "spawn"}
            missing = [g["name"] for g in task["guards"]["spawn"]
                       if g["name"] not in spawned or math.hypot(spawned[g["name"]]["x"] - g["x"], spawned[g["name"]]["y"] - g["y"]) > 0.05]
            add(c, "Spawned obstacle1–3 at the given positions", not missing, ("missing/misplaced: " + ", ".join(missing)) if missing else "")
        elif name == "guard_clearance":
            r = task["guards"]["safeRadius"]
            alive: dict = {}
            ev = sorted((e for e in events if e["type"] in ("spawn", "kill")), key=lambda e: e["tick"])
            k, best, where = 0, math.inf, None
            for t in range(len(poses) // 3):
                while k < len(ev) and ev[k]["tick"] <= t:
                    e = ev[k]
                    if e["type"] == "spawn":
                        alive[e["name"]] = (e["x"], e["y"])
                    else:
                        alive.pop(e["name"], None)
                    k += 1
                x, y = poses[3 * t], poses[3 * t + 1]
                for n, (ox, oy) in alive.items():
                    d = math.hypot(x - ox, y - oy)
                    if d < best:
                        best, where = d, n
            ok = best >= r and len(alive) >= len(task["guards"]["spawn"])
            add(c, f"Never within {r} of a guard", ok, f"closest {best:.3f} ({where})" if where else "no guards spawned")
        elif name == "shape_match":
            res = score_trace(trace, task)
            score = res["score"]
            add(c, f"Shape match ≥ {task['passThreshold']}%", finished and score >= task["passThreshold"],
                f"{score:.2f}% (recall {res['recall']:.3f}, precision {res['precision']:.3f})")
        elif name == "distinct_colours":
            need = int(arg or 1)
            cols = {(s[5], s[6], s[7]) for s in _visible(trace)}
            add(c, f"At least {need} different colours", len(cols) >= need, f"{len(cols)} colour(s)")
        elif name == "one_stroke":
            segs = _visible(trace)
            strokes = 0
            for i, s in enumerate(segs):
                if i == 0 or abs(segs[i - 1][3] - s[1]) > 1e-4 or abs(segs[i - 1][4] - s[2]) > 1e-4:
                    strokes += 1
            add(c, "One continuous stroke", strokes == 1, f"{strokes} stroke(s)")
        elif name == "pen_up_teleport":
            tp = {e["tick"] for e in events if e["type"] == "teleport"}
            bad = sum(1 for s in _visible(trace) if s[0] in tp and math.hypot(s[3] - s[1], s[4] - s[2]) > 0.2)
            add(c, "Pen up between shapes (no pen-down teleport)", bad == 0, f"{bad} pen-down jump(s)" if bad else "")
        else:
            add(c, c, False, "unknown check")
    return {"passed": all(x["ok"] for x in checks), "score": score, "checks": checks}
