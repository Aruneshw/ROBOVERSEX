"""
RVX-Sim scorer — tolerance-band path matching (pure Python, no numpy,
so it runs unchanged in Pyodide and on the server).

  recall    = share of the TARGET path that the participant's ink covers (within tolerance)
  precision = share of the participant's INK that lies on the target path (within tolerance)
  score     = 100 * min(recall, precision), floored to 2 decimals

"100% match" therefore means: every part of the target is drawn AND nothing
extra is drawn, allowing a tolerance band (default 0.12 world units ~ 5.4 px)
for floating-point drift. Drawing order, direction and speed do not matter.
"""
from __future__ import annotations

import math

DEFAULT_TOLERANCE = 0.12
COLOR_TOL = 12


def _target_segments(target: dict) -> list[tuple]:
    segs = []
    for stroke in target.get("strokes", []):
        pts = stroke.get("points", [])
        col = tuple(stroke.get("color", (179, 184, 255)))
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if (x0, y0) != (x1, y1):
                segs.append((float(x0), float(y0), float(x1), float(y1), col))
    return segs


def _merge_collinear(segs: list[tuple], eps: float = 1e-6) -> list[tuple]:
    """Merge consecutive, touching, collinear, same-colour segments (per-tick ink -> long lines)."""
    out: list[tuple] = []
    for s in segs:
        if out:
            px0, py0, px1, py1, pc = out[-1]
            x0, y0, x1, y1, c = s
            if c == pc and abs(px1 - x0) < 1e-9 and abs(py1 - y0) < 1e-9:
                ax, ay, bx, by = px1 - px0, py1 - py0, x1 - x0, y1 - y0
                la, lb = math.hypot(ax, ay), math.hypot(bx, by)
                if la > 0 and lb > 0 and abs(ax * by - ay * bx) <= eps * la * lb and (ax * bx + ay * by) > 0:
                    out[-1] = (px0, py0, x1, y1, c)
                    continue
        out.append(s)
    return out


def _sample(segs: list[tuple], step: float) -> list[tuple]:
    pts = []
    for (x0, y0, x1, y1, c) in segs:
        n = max(1, int(math.ceil(math.hypot(x1 - x0, y1 - y0) / step)))
        for i in range(n + 1):
            t = i / n
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c))
    return pts


class _Grid:
    def __init__(self, segs: list[tuple], cell: float):
        self.cell, self.segs, self.cells = cell, segs, {}
        for i, (x0, y0, x1, y1, _c) in enumerate(segs):
            gx0, gx1 = int(math.floor((min(x0, x1) - cell) / cell)), int(math.floor((max(x0, x1) + cell) / cell))
            gy0, gy1 = int(math.floor((min(y0, y1) - cell) / cell)), int(math.floor((max(y0, y1) + cell) / cell))
            for gx in range(gx0, gx1 + 1):
                for gy in range(gy0, gy1 + 1):
                    self.cells.setdefault((gx, gy), []).append(i)

    def near(self, x: float, y: float, tol: float, color=None) -> bool:
        key = (int(math.floor(x / self.cell)), int(math.floor(y / self.cell)))
        tol2 = tol * tol
        for i in self.cells.get(key, ()):
            x0, y0, x1, y1, c = self.segs[i]
            if color is not None and any(abs(a - b) > COLOR_TOL for a, b in zip(color, c)):
                continue
            dx, dy = x1 - x0, y1 - y0
            L2 = dx * dx + dy * dy
            t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / L2))
            ex, ey = x0 + t * dx - x, y0 + t * dy - y
            if ex * ex + ey * ey <= tol2:
                return True
        return False


def _downsample(points: list, limit: int = 400) -> list:
    if len(points) <= limit:
        return points
    k = len(points) / limit
    return [points[int(i * k)] for i in range(limit)]


def score_trace(trace: dict, task: dict) -> dict:
    target = task["target"]
    tol = float(task.get("tolerance", target.get("tolerance", DEFAULT_TOLERANCE)))
    check_color = bool(task.get("check_color", False))

    tsegs = _target_segments(target)
    # visible ink = segments after the last clear/reset (index-based: same-tick draws stay correct)
    clears = trace.get("clears", [])
    first = clears[-1][1] if clears else 0
    dsegs = [(s[1], s[2], s[3], s[4], (s[5], s[6], s[7])) for s in trace.get("segments", [])[first:]]
    dsegs = _merge_collinear(dsegs)

    if not tsegs:
        return {"score": 0.0, "recall": 0.0, "precision": 0.0, "diff": {"missed": [], "extra": []}}
    if not dsegs:
        return {"score": 0.0, "recall": 0.0, "precision": 0.0,
                "diff": {"missed": _downsample([(round(x, 3), round(y, 3)) for x, y, _ in _sample(tsegs, tol / 2)]),
                         "extra": []}}

    step = tol / 3.0
    t_pts, d_pts = _sample(tsegs, step), _sample(dsegs, step)
    d_grid, t_grid = _Grid(dsegs, tol), _Grid(tsegs, tol)

    missed = [(x, y) for (x, y, c) in t_pts if not d_grid.near(x, y, tol, c if check_color else None)]
    extra = [(x, y) for (x, y, c) in d_pts if not t_grid.near(x, y, tol, c if check_color else None)]

    recall = 1.0 - len(missed) / len(t_pts)
    precision = 1.0 - len(extra) / len(d_pts)
    score = math.floor(100.0 * min(recall, precision) * 100) / 100.0
    return {
        "score": score,
        "recall": round(recall, 4),
        "precision": round(precision, 4),
        "diff": {
            "missed": _downsample([(round(x, 3), round(y, 3)) for x, y in missed]),
            "extra": _downsample([(round(x, 3), round(y, 3)) for x, y in extra]),
        },
    }
