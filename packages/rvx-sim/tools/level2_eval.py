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


def _bbox(segs):
    if not segs:
        return None
    xs = [v for sg in segs for v in (sg[1], sg[3])]
    ys = [v for sg in segs for v in (sg[2], sg[4])]
    return min(xs), max(xs), min(ys), max(ys)


def _strokes(segs):
    n = 0
    for i, sg in enumerate(segs):
        if i == 0 or abs(segs[i - 1][3] - sg[1]) > 1e-4 or abs(segs[i - 1][4] - sg[2]) > 1e-4:
            n += 1
    return n


def _peak_speed(poses, dt=0.01):
    best = 0.0
    for i in range(3, len(poses), 3):
        best = max(best, math.hypot(poses[i] - poses[i - 3], poses[i + 1] - poses[i - 2]) / dt)
    return best


def _score(task, trace):
    return score_trace(trace, {**task, "check_color": bool(task.get("checkColor", False))})


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
            res = _score(task, trace)
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
        elif name == "bbox":
            want, tol = task["limits"]["bbox"], task["limits"]["bboxTol"]
            got = _bbox(_visible(trace))
            if got is None:
                add(c, "Dimensions & centre", False, "no ink")
            else:
                W, H = want["maxX"] - want["minX"], want["maxY"] - want["minY"]
                w, h = got[1] - got[0], got[3] - got[2]
                e = max(abs(w - W), abs(h - H), abs((got[0] + got[1]) / 2 - (want["minX"] + want["maxX"]) / 2),
                        abs((got[2] + got[3]) / 2 - (want["minY"] + want["maxY"]) / 2))
                add(c, f"Dimensions {W:.3f} × {H:.3f}, centred (±{tol})", e <= tol, f"drawn {w:.3f} × {h:.3f}, error {e:.3f}")
        elif name == "max_speed":
            vmax = float(arg)
            peak = _peak_speed(poses)
            add(c, f"Linear speed ≤ {vmax:g} units/s", peak <= vmax + 0.005, f"peak {peak:.2f} units/s")
        elif name == "no_wall_hits":
            n = trace.get("wall_hits", 0)
            add(c, "No wall contact", n == 0, f"{n} wall hit(s)" if n else "")
        elif name == "within_time":
            t = trace["ticks"] * 0.01
            add(c, f"Completed within {arg} s", finished and t <= float(arg) + 1e-9,
                f"{t:.2f} s" + ("" if finished else f" ({trace.get('error') or trace['status']})"))
        elif name == "code_size":
            add(c, f"Source ≤ {int(arg):,} characters", len(code) <= int(arg), f"{len(code):,} characters")
        else:
            add(c, c, False, "unknown check")
    out = {"passed": all(x["ok"] for x in checks), "score": score, "checks": checks}
    if task.get("rubric") == "extreme":
        out["rubric"] = rubric(task, trace, code, checks)
    return out


def rubric(task: dict, trace: dict, code: str, checks: list) -> dict:
    """100-point rubric (95 automatic + 5 judged by a human: code organisation)."""
    ok = {c["id"].split(":")[0]: c["ok"] for c in checks}
    res = _score(task, trace)
    finished = trace.get("status") == "finished"
    want = task["limits"]["bbox"]
    got = _bbox(_visible(trace))
    if got:
        W, H = want["maxX"] - want["minX"], want["maxY"] - want["minY"]
        e = max(abs((got[1] - got[0]) - W), abs((got[3] - got[2]) - H),
                abs((got[0] + got[1]) / 2 - (want["minX"] + want["maxX"]) / 2), abs((got[2] + got[3]) / 2 - (want["minY"] + want["maxY"]) / 2))
        dims = 20 * max(0.0, 1 - e / 0.5)
    else:
        dims = 0.0
    items = [
        {"label": "Geometric similarity", "max": 35, "points": round(35 * res["score"] / 100, 2)},
        {"label": "Dimensions & proportions", "max": 20, "points": round(dims, 2)},
        {"label": "Path continuity & completeness", "max": 15, "points": round(10 * res["recall"] + 5 * (_strokes(_visible(trace)) == 1), 2)},
        {"label": "Movement precision", "max": 15, "points": round(5 * ok.get("max_speed", False) + 5 * ok.get("no_wall_hits", False) + 5 * res["precision"], 2)},
        {"label": "Completion & stopping", "max": 10, "points": round(5 * (res["recall"] >= 0.99) + 5 * (finished and ok.get("within_time", False)), 2)},
        {"label": "Code organisation & reliability (judge)", "max": 5, "points": None},
    ]
    auto = round(sum(i["points"] for i in items if i["points"] is not None), 2)
    return {"auto": auto, "autoMax": 95, "max": 100, "items": items}
