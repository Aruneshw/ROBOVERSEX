"""
Roboverse X — Task 5 · Extreme Geometry (cards A, B, C).

Single source of truth for the three extreme challenges. Writes:
  apps/web/src/rvx-runtime/tasks.extreme.json    (participant-facing task data + target geometry)
  docs/challenges/extreme_*.svg                  (clean reference images: final geometry only)

  python packages/rvx-sim/tools/extreme_tasks.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

C = 5.544445                      # canvas centre (turtlesim spawn point)
MAX_SPEED = 6.0                   # units/s  →  ≤ 0.06 units per 10 ms tick
TOL = 0.03                        # scoring tolerance band (≈ 1.35 px)
CODE_LIMIT = 12000                # characters — too small to paste the target coordinates
ROOT = Path(__file__).resolve().parents[3]


def r5(v: float) -> float:
    return round(v, 5)


# ============================================================================ A · Heighway dragon
DRAGON_ORDER = 12
DRAGON_SIZE = 9.0


def dragon_turns(order: int = DRAGON_ORDER) -> list[int]:
    """+1 = left, -1 = right, for k = 1 .. 2^order - 1 (regular paper-folding sequence)."""
    return [1 if (((k & -k) << 1) & k) == 0 else -1 for k in range(1, 2 ** order)]


def dragon_points() -> list[tuple[float, float]]:
    dirs = [(1, 0), (0, 1), (-1, 0), (0, -1)]
    x = y = d = 0
    pts = [(0, 0)]
    x += 1
    pts.append((x, y))
    for t in dragon_turns():
        d = (d + t) % 4
        x, y = x + dirs[d][0], y + dirs[d][1]
        pts.append((x, y))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    s = DRAGON_SIZE / max(max(xs) - min(xs), max(ys) - min(ys))
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return [(C + (px - mx) * s, C + (py - my) * s) for px, py in pts]


# ============================================================================ B · Sierpinski
SIER_DEPTH = 6
SIER_SIDE = 9.0
SIER_H = SIER_SIDE * math.sqrt(3) / 2
SIER_A = (C - SIER_SIDE / 2, C - SIER_H / 2)      # bottom-left
SIER_B = (C + SIER_SIDE / 2, C - SIER_H / 2)      # bottom-right
SIER_C = (C, C + SIER_H / 2)                      # apex


def lattice_to_xy(i: int, j: int) -> tuple[float, float]:
    """Point A + i·u + j·v with u = (B-A)/2^depth, v = (C-A)/2^depth."""
    n = 2 ** SIER_DEPTH
    ux, uy = (SIER_B[0] - SIER_A[0]) / n, (SIER_B[1] - SIER_A[1]) / n
    vx, vy = (SIER_C[0] - SIER_A[0]) / n, (SIER_C[1] - SIER_A[1]) / n
    return (SIER_A[0] + i * ux + j * vx, SIER_A[1] + i * uy + j * vy)


def sier_triangles():
    """The 3^depth smallest upward triangles, as lattice corner triples."""
    out = []

    def rec(d, a, b, c):
        if d == 0:
            out.append((a, b, c))
            return
        ab = ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)
        bc = ((b[0] + c[0]) // 2, (b[1] + c[1]) // 2)
        ca = ((c[0] + a[0]) // 2, (c[1] + a[1]) // 2)
        rec(d - 1, a, ab, ca)
        rec(d - 1, ab, b, bc)
        rec(d - 1, ca, bc, c)

    n = 2 ** SIER_DEPTH
    rec(SIER_DEPTH, (0, 0), (n, 0), (0, n))
    return out


# ============================================================================ C · torus-knot projection
KNOT_P, KNOT_Q, KNOT_R, KNOT_r = 3, 7, 2.0, 1.0
KNOT_SAMPLES = 2400
KNOT_W, KNOT_H = 9.0, 7.0
OVER = (255, 214, 64)       # z >= 0  (strand in front)
UNDER = (25, 32, 105)       # z <  0  (strand behind: dark shadow)


def knot_raw(t: float) -> tuple[float, float, float]:
    rr = KNOT_R + KNOT_r * math.cos(KNOT_Q * t)
    return rr * math.cos(KNOT_P * t), rr * math.sin(KNOT_P * t), KNOT_r * math.sin(KNOT_Q * t)


def knot_points() -> list[tuple[float, float]]:
    raw = [knot_raw(2 * math.pi * k / KNOT_SAMPLES) for k in range(KNOT_SAMPLES + 1)]
    xs, ys = [p[0] for p in raw], [p[1] for p in raw]
    kx, ky = KNOT_W / (max(xs) - min(xs)), KNOT_H / (max(ys) - min(ys))
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return [(C + (x - mx) * kx, C + (y - my) * ky) for x, y, _ in raw]


def knot_segment_colour(k: int):
    """Colour of segment k (sample k → k+1): depth z at the segment's mid-parameter."""
    t_mid = 2 * math.pi * (k + 0.5) / KNOT_SAMPLES
    return OVER if knot_raw(t_mid)[2] >= 0 else UNDER


def knot_strokes():
    pts = knot_points()
    strokes, cur, col = [], [pts[0]], knot_segment_colour(0)
    for k in range(KNOT_SAMPLES):
        c = knot_segment_colour(k)
        if c != col:
            strokes.append({"points": [[r5(x), r5(y)] for x, y in cur], "color": list(col)})
            cur, col = [pts[k]], c
        cur.append(pts[k + 1])
    strokes.append({"points": [[r5(x), r5(y)] for x, y in cur], "color": list(col)})
    return strokes


# ============================================================================ task data
STARTER = '''#!/usr/bin/env python3
import math
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose
from turtlesim.srv import SetPen


class Challenge(Node):
    def __init__(self):
        super().__init__('extreme_challenge')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.pen = self.create_client(SetPen, '/turtle1/set_pen')
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 10)
        self.pose = None
        # TODO: generate the path mathematically, then drive /turtle1/cmd_vel along it
        #       (≤ 6.0 units/s, pen down the whole time, stop when done).

    def on_pose(self, msg):
        self.pose = msg


def main():
    rclpy.init()
    rclpy.spin(Challenge())


if __name__ == '__main__':
    main()
'''

COMMON_RULES = (
    "\n\n**Rules (all checked automatically)**\n"
    "- ROS 2 Python (`rclpy`), motion only through **`/turtle1/cmd_vel`** (`geometry_msgs/Twist`).\n"
    f"- **No teleport** at all. **Pen down for the whole drawing** — one continuous stroke (`set_pen` may change colour, never `off`).\n"
    f"- Linear speed **≤ {MAX_SPEED} units/s** at every 10 ms simulation step. Never touch a wall.\n"
    "- Generate the path in your code. Hard-coded coordinate lists, screenshots or image tracing are not allowed "
    f"(source limit **{CODE_LIMIT:,} characters**).\n"
    "- Stop the turtle when the drawing is complete (the program must end; the turtle must be at rest).\n"
    f"- Scoring tolerance: **±{TOL} units**. Order and direction of drawing do not matter, missing or extra ink does."
)


def tasks():
    d = dragon_points()
    dx, dy = [p[0] for p in d], [p[1] for p in d]
    seg = math.dist(d[0], d[1])
    k = knot_points()
    tri = sier_triangles()
    sier_strokes = []
    for a, b, c in tri:
        pa, pb, pc = lattice_to_xy(*a), lattice_to_xy(*b), lattice_to_xy(*c)
        sier_strokes.append({"points": [[r5(x), r5(y)] for x, y in (pa, pb, pc, pa)], "color": [179, 184, 255]})

    def task(card, letter, title, summary, md, start, strokes, max_sim, extra_checks, check_color=False):
        bbox = _bbox([p for s in strokes for p in s["points"]])
        return {
            "id": f"ps3-t5-{letter.lower()}-{title.split()[0].lower()}", "ps": 3, "task": 5, "card": card,
            "title": f"Challenge {letter} · {title}", "summary": summary,
            "descriptionMd": md + COMMON_RULES,
            "start": {"x": r5(start[0]), "y": r5(start[1]), "theta": 0.0}, "goal": None, "guards": None,
            "target": {"version": 1, "start_pose": {"x": r5(start[0]), "y": r5(start[1]), "theta": 0.0},
                       "strokes": strokes, "tolerance": TOL},
            "tolerance": TOL, "passThreshold": 95, "checkColor": check_color,
            "rules": {"allow_teleport": False}, "maxSimSec": max_sim,
            "limits": {"maxSpeed": MAX_SPEED, "maxCodeChars": CODE_LIMIT, "bbox": bbox, "bboxTol": 0.05},
            "rubric": "extreme",
            "checks": ["shape_match", "bbox", "one_stroke", "no_teleport", f"max_speed:{MAX_SPEED:g}", "no_wall_hits",
                       f"within_time:{max_sim}", "stopped", f"code_size:{CODE_LIMIT}"] + extra_checks,
            "starterCode": STARTER,
        }

    return [
        task(1, "A", "Heighway Dragon (order 12)",
             "Draw the order-12 Heighway dragon curve: 4096 segments, larger side exactly 9.0, centred.",
             "Draw the **Heighway dragon curve of order 12** — **4096** equal segments joined by **4095** right-angle turns.\n\n"
             "**Construction (exact):**\n"
             "1. Segment 1 points **east (+x)**.\n"
             "2. Before segment *k + 1* (k = 1 … 4095) turn **90°**: **left** if `((k & -k) << 1) & k == 0`, otherwise **right**.\n"
             f"3. Scale uniformly so the **larger side of the bounding box is 9.0** (→ {max(dx) - min(dx):.3f} × {max(dy) - min(dy):.3f}), "
             f"and centre the bounding box on **({C}, {C})**.\n\n"
             f"| Value | |\n|---|---|\n| Segment length | {seg:.6f} |\n| Start (first vertex) | ({d[0][0]:.6f}, {d[0][1]:.6f}) |\n"
             f"| Start heading | east (θ = 0) — the turtle starts here |\n| Bounding box | x {min(dx):.4f} … {max(dx):.4f}, y {min(dy):.4f} … {max(dy):.4f} |\n"
             "| Time limit | 110 s simulated |",
             d[0], [{"points": [[r5(x), r5(y)] for x, y in d], "color": [255, 120, 90]}], 110, []),
        task(2, "B", "Sierpinski Triangle (depth 6)",
             "Draw every edge of the depth-6 Sierpinski triangle (side 9.0) in one continuous stroke within 90 s.",
             "Draw the **Sierpinski triangle of recursion depth 6**: an equilateral triangle of side **9.0** "
             f"(bounding box **9.0 × {SIER_H:.3f}**, base horizontal, apex up), centred on ({C}, {C}).\n\n"
             "Depth 6 = **729** smallest upward triangles of side **9/64 = 0.140625**. Draw **every edge of every smallest triangle** "
             "and nothing inside the gaps.\n\n"
             f"| Corner | Position |\n|---|---|\n| A (bottom-left, start) | ({SIER_A[0]:.6f}, {SIER_A[1]:.6f}) |\n"
             f"| B (bottom-right) | ({SIER_B[0]:.6f}, {SIER_B[1]:.6f}) |\n| C (apex) | ({SIER_C[0]:.6f}, {SIER_C[1]:.6f}) |\n\n"
             "- Start pose: corner A, facing east.\n- **Time limit 90 s simulated** — plan the path; you may retrace edges, but time is tight.",
             SIER_A, sier_strokes, 90, []),
        task(3, "C", "Torus-Knot Projection (3D-style)",
             "Draw a depth-shaded projection of the (3,7) torus knot: 2400 samples, 9.0 × 7.0, gold over / navy under.",
             "Draw the planar projection of the **(3, 7) torus knot** with depth shading.\n\n"
             "**Curve, 0 ≤ t ≤ 2π:**\n\n"
             "`x(t) = (2 + cos 7t)·cos 3t`   `y(t) = (2 + cos 7t)·sin 3t`   `z(t) = sin 7t` (depth)\n\n"
             f"- Sample **{KNOT_SAMPLES}** equal steps: tₖ = 2πk/{KNOT_SAMPLES}, k = 0 … {KNOT_SAMPLES} (closed polyline of {KNOT_SAMPLES} segments).\n"
             f"- Normalise the sampled points **independently in x and y** to a **{KNOT_W} × {KNOT_H}** bounding box centred on ({C}, {C}).\n"
             f"- **3D illusion (colour is scored):** segment k → k+1 uses **gold RGB {OVER}** when z at its mid-parameter "
             f"t = 2π(k+½)/{KNOT_SAMPLES} is ≥ 0, else **navy RGB {UNDER}**.\n"
             f"- Start pose: the point at t = 0 = ({k[0][0]:.6f}, {k[0][1]:.6f}), facing east.\n- **Time limit 40 s simulated.**",
             k[0], knot_strokes(), 40, [], check_color=True),
    ]


def _bbox(points):
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return {"minX": r5(min(xs)), "maxX": r5(max(xs)), "minY": r5(min(ys)), "maxY": r5(max(ys))}


def svg(task, px=500):
    k = px / 11.088889
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {px} {px}" width="{px}" height="{px}">',
           f'<rect width="{px}" height="{px}" fill="#4556FF"/>']
    for s in task["target"]["strokes"]:
        pts = " ".join(f"{x * k:.2f},{(11.088889 - y) * k:.2f}" for x, y in s["points"])
        r, g, b = s["color"]
        out.append(f'<polyline points="{pts}" fill="none" stroke="rgb({r},{g},{b})" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>')
    out.append("</svg>")
    return "\n".join(out)


if __name__ == "__main__":
    ts = tasks()
    out = ROOT / "apps" / "web" / "src" / "rvx-runtime" / "tasks.extreme.json"
    out.write_text(json.dumps(ts, separators=(",", ":")) + "\n")
    docs = ROOT / "docs" / "challenges"
    docs.mkdir(parents=True, exist_ok=True)
    for t, name in zip(ts, ["extreme_a_dragon", "extreme_b_sierpinski", "extreme_c_knot"]):
        (docs / f"{name}.svg").write_text(svg(t))
    md = ["# Roboverse X · Task 5 — Extreme Geometry (participant brief)\n",
          "You are handed **one** of the three challenge cards below. Write a ROS 2 Python node that reproduces the "
          "reference drawing in TurtleSim. The arena checks your run automatically; a judge reviews your code.\n",
          "Canvas: 11.088889 × 11.088889 units, origin bottom-left, θ counter-clockwise from +x. "
          "A `Twist` acts for exactly 1.0 s unless replaced; `/turtle1/pose` is published every 10 ms.\n"]
    for t, name in zip(ts, ["extreme_a_dragon", "extreme_b_sierpinski", "extreme_c_knot"]):
        md += [f"\n---\n\n## {t['title']}\n", f"![reference](./{name}.svg)\n", t["descriptionMd"] + "\n"]
    md += ["\n---\n\n## Scoring (100 points)\n",
           "| Area | Points |\n|---|---|\n| Geometric similarity | 35 |\n| Correct dimensions and proportions | 20 |\n"
           "| Path continuity and completeness | 15 |\n| Turtle movement precision | 15 |\n| Correct completion and stopping | 10 |\n"
           "| Code organisation and reliability (judge) | 5 |\n\n"
           "SUBMIT unlocks only when every automatic check passes for the exact code you ran.\n"]
    (docs / "EXTREME_PARTICIPANT.md").write_text("\n".join(md))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB), {docs}/extreme_*.svg and EXTREME_PARTICIPANT.md")
