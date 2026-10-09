"""
Roboverse X — Level 2 problem statements (poster "LEVEL 2 · TURTLESIM PROBLEM STATEMENTS").

Single source of truth for task geometry. Coordinates were measured from the poster panels
(500 px turtlesim canvas = 11.088889 units, origin bottom-left).

  python packages/rvx-sim/tools/level2_tasks.py      # writes apps/web/src/rvx-runtime/tasks.data.json
"""
from __future__ import annotations

import json
import math
from pathlib import Path

C = 5.544445
PEN = [179, 184, 255]


def r6(v: float) -> float:
    return round(v, 6)


def poly(points, color=PEN):
    return {"points": [[r6(x), r6(y)] for x, y in points], "color": list(color)}


def circle(cx, cy, r, n=120, color=PEN):
    return poly([(cx + r * math.cos(2 * math.pi * i / n - math.pi / 2), cy + r * math.sin(2 * math.pi * i / n - math.pi / 2)) for i in range(n + 1)], color)


def regular(x0, y0, side, sides, turn_sign=1):
    """Polygon traced by a turtle: start (x0, y0) heading east, `side` per edge, turn 360/sides (CCW)."""
    pts, x, y, th = [(x0, y0)], x0, y0, 0.0
    for _ in range(sides):
        x, y = x + side * math.cos(th), y + side * math.sin(th)
        pts.append((x, y))
        th += turn_sign * 2 * math.pi / sides
    return pts


# ----------------------------------------------------------------------------- geometry
T1_GOAL = (9.0, 9.0)
GUARDS = [("obstacle1", 7.0, 7.0), ("obstacle2", 3.5, 8.0), ("obstacle3", 8.5, 4.0)]
SAFE_RADIUS = 1.0

SQUARE = {"x": 1.0, "y": 7.25, "side": 2.5}
RECT = {"x": 4.25, "y": 7.75, "w": 3.0, "h": 1.5}
TRIANGLE = {"x": 8.0, "y": 7.5, "side": 2.5}
CIRCLE = {"cx": 3.0, "cy": 3.5, "r": 1.0}
HEXAGON = {"cx": 7.0, "cy": 3.5, "side": 1.2}

STAR = {"side": 3.5}
STAR_R = STAR["side"] / (2 * math.sin(math.radians(72)))           # circumradius of the pentagram points
STAR_START = (C - STAR["side"] / 2, C + STAR_R * math.sin(math.radians(18)))  # left arm tip, heading east
HOUSE = {"x": C - 1.25, "y": 2.5, "side": 2.5, "door": (C + 0.25, 2.5, 0.6, 1.2), "window": (C - 0.85, 4.0, 0.5)}
FLOWER = {"cx": C, "cy": 6.5, "r": 1.0, "stem_bottom": 1.5}
SPIRAL = {"cx": C, "cy": C, "turns": 3, "r": 2.3}


def spiral_points(step=0.03):
    b = SPIRAL["r"] / (2 * math.pi * SPIRAL["turns"])
    phi_end = 2 * math.pi * SPIRAL["turns"]
    pts, phi = [], 0.0
    while phi < phi_end:
        r = b * phi
        pts.append((SPIRAL["cx"] + r * math.cos(phi), SPIRAL["cy"] + r * math.sin(phi)))
        phi += step / math.hypot(r, b)          # constant arc length per point
    pts.append((SPIRAL["cx"] + SPIRAL["r"], SPIRAL["cy"]))
    return pts


def target(start, strokes, tol=0.12):
    return {"version": 1, "start_pose": {"x": r6(start[0]), "y": r6(start[1]), "theta": r6(start[2])}, "strokes": strokes, "tolerance": tol}


def t3_strokes():
    s, rc, tr, ci, hx = SQUARE, RECT, TRIANGLE, CIRCLE, HEXAGON
    hx_start = (hx["cx"] - hx["side"] / 2, hx["cy"] - hx["side"] * math.sqrt(3) / 2)
    return [
        poly(regular(s["x"], s["y"], s["side"], 4), (255, 80, 80)),
        poly([(rc["x"], rc["y"]), (rc["x"] + rc["w"], rc["y"]), (rc["x"] + rc["w"], rc["y"] + rc["h"]), (rc["x"], rc["y"] + rc["h"]), (rc["x"], rc["y"])], (80, 220, 120)),
        poly(regular(tr["x"], tr["y"], tr["side"], 3), (255, 255, 255)),
        circle(ci["cx"], ci["cy"], ci["r"], color=(255, 214, 64)),
        poly(regular(hx_start[0], hx_start[1], hx["side"], 6), (255, 150, 50)),
    ]


def star_strokes():
    pts, x, y, th = [STAR_START], *STAR_START, 0.0
    for _ in range(5):
        x, y = x + STAR["side"] * math.cos(th), y + STAR["side"] * math.sin(th)
        pts.append((x, y))
        th -= 4 * math.pi / 5
    return [poly(pts, (255, 220, 60))]


def house_strokes():
    h = HOUSE
    x, y, s = h["x"], h["y"], h["side"]
    dx, dy, dw, dh = h["door"]
    wx, wy, ws = h["window"]
    return [
        poly([(x, y), (x + s, y), (x + s, y + s), (x, y + s), (x, y)], (255, 150, 50)),
        poly([(x, y + s), (x + s, y + s), (x + s / 2, y + s + s * math.sqrt(3) / 2), (x, y + s)], (240, 60, 70)),
        poly([(dx, dy), (dx + dw, dy), (dx + dw, dy + dh), (dx, dy + dh), (dx, dy)], (255, 200, 60)),
        poly([(wx, wy), (wx + ws, wy), (wx + ws, wy + ws), (wx, wy + ws), (wx, wy)], (255, 200, 60)),
    ]


def flower_strokes():
    f = FLOWER
    strokes = [poly([(f["cx"], f["stem_bottom"]), (f["cx"], f["cy"] - 2 * f["r"])], (60, 220, 100))]
    for k in range(6):
        a = math.radians(90 + 60 * k)
        strokes.append(circle(f["cx"] + f["r"] * math.cos(a), f["cy"] + f["r"] * math.sin(a), f["r"], color=(255, 120, 220)))
    return strokes


# ----------------------------------------------------------------------------- starter code
STARTER_HEAD = '''#!/usr/bin/env python3
import math
import time
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose
'''

STARTER_T1 = STARTER_HEAD + '''
GOAL_X, GOAL_Y = 9.0, 9.0      # stop within 0.1 units of this point


class GoalReacher(Node):
    def __init__(self):
        super().__init__('goal_reacher')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 10)
        self.pose = None
        self.timer = self.create_timer(0.05, self.control)

    def on_pose(self, msg):
        self.pose = msg

    def control(self):
        if self.pose is None:
            return
        # TODO: closed loop — compute distance/heading error from self.pose,
        # publish a Twist, and when within 0.1 units: publish a zero Twist,
        # log "Goal reached" and shut down.
        pass


def main():
    rclpy.init()
    rclpy.spin(GoalReacher())


if __name__ == '__main__':
    main()
'''

STARTER_T2 = STARTER_HEAD + '''from turtlesim.srv import Spawn

GOAL_X, GOAL_Y = 9.0, 9.0
GUARDS = {'obstacle1': (7.0, 7.0), 'obstacle2': (3.5, 8.0), 'obstacle3': (8.5, 4.0)}
SAFE_RADIUS = 1.0               # never get closer than this to any obstacle


class GuardDodger(Node):
    def __init__(self):
        super().__init__('guard_dodger')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 10)
        self.spawn = self.create_client(Spawn, '/spawn')
        self.pose = None
        self.obstacles = {}
        # TODO 1: call /spawn for each guard (name, x, y)
        # TODO 2: subscribe to /<name>/pose for each guard and store it in self.obstacles
        self.timer = self.create_timer(0.05, self.control)

    def on_pose(self, msg):
        self.pose = msg

    def control(self):
        # TODO 3: plan a path around the guards and drive to the goal, stop within 0.1
        pass


def main():
    rclpy.init()
    rclpy.spin(GuardDodger())


if __name__ == '__main__':
    main()
'''

STARTER_DRAW = STARTER_HEAD + '''from turtlesim.srv import SetPen, TeleportAbsolute


class Artist(Node):
    def __init__(self):
        super().__init__('artist')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.pen = self.create_client(SetPen, '/turtle1/set_pen')
        self.tp = self.create_client(TeleportAbsolute, '/turtle1/teleport_absolute')

    def drive(self, linear, angular):
        """One Twist moves the turtle for exactly 1.0 s."""
        msg = Twist()
        msg.linear.x = float(linear)
        msg.angular.z = float(angular)
        self.cmd.publish(msg)
        time.sleep(1.0)

    def set_pen(self, r, g, b, width=3, off=0):
        self.pen.call(SetPen.Request(r=r, g=g, b=b, width=width, off=off))

    def jump(self, x, y, theta=0.0):
        """Move with the pen UP (teleport is only allowed with the pen up)."""
        self.set_pen(0, 0, 0, 3, 1)
        self.tp.call(TeleportAbsolute.Request(x=float(x), y=float(y), theta=float(theta)))

    def run(self):
        # TODO: draw the shapes. Example: a 1-unit square
        # self.jump(1.0, 1.0); self.set_pen(255, 80, 80)
        # for _ in range(4): self.drive(1.0, 0); self.drive(0, math.pi / 2)
        pass


def main():
    rclpy.init()
    Artist().run()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
'''


# ----------------------------------------------------------------------------- tasks
def tasks():
    start = (C, C, 0.0)
    shapes_md = (
        "| Shape | Size | Position |\n|---|---|---|\n"
        f"| Square | side **2.5** | bottom-left ({SQUARE['x']}, {SQUARE['y']}) |\n"
        f"| Rectangle | **3.0 × 1.5** | bottom-left ({RECT['x']}, {RECT['y']}) |\n"
        f"| Triangle (equilateral, apex up) | side **2.5** | bottom-left ({TRIANGLE['x']}, {TRIANGLE['y']}) |\n"
        f"| Circle | radius **1.0** | centre ({CIRCLE['cx']}, {CIRCLE['cy']}) |\n"
        f"| Hexagon (flat top) | side **1.2** | centre ({HEXAGON['cx']}, {HEXAGON['cy']}) |\n"
    )
    draw_rules = ("- Each shape closed, **own colour** (`/turtle1/set_pen`).\n- **Pen up between shapes** — "
                  "`teleport_absolute` is allowed only with the pen up.\n- No overlaps, no teleop.")
    return [
        {
            "id": "ps1-t1-reach-goal", "ps": 1, "task": 1, "card": None,
            "title": "Reach the Goal",
            "summary": f"Drive turtle1 to the goal ({T1_GOAL[0]}, {T1_GOAL[1]}) and stop within 0.1 units.",
            "descriptionMd": (f"Drive **turtle1** from the centre to the goal **({T1_GOAL[0]}, {T1_GOAL[1]})** and **stop within 0.1 units**.\n\n"
                              "- Closed loop: read `/turtle1/pose`, publish `/turtle1/cmd_vel`.\n"
                              "- When you arrive, stop and log **\"Goal reached\"**.\n- Teleport is not allowed.\n\n"
                              "Passing Task 1 unlocks Task 2."),
            "start": {"x": C, "y": C, "theta": 0.0},
            "goal": {"x": T1_GOAL[0], "y": T1_GOAL[1], "tolerance": 0.1},
            "guards": None, "target": None, "tolerance": 0.12, "passThreshold": 100,
            "rules": {"allow_teleport": False}, "maxSimSec": 120,
            "checks": ["goal_reached", "stopped", "goal_log", "closed_loop", "no_teleport"],
            "starterCode": STARTER_T1,
        },
        {
            "id": "ps1-t2-dodge-guards", "ps": 1, "task": 2, "card": None,
            "title": "Dodge the Guards",
            "summary": "Spawn obstacle1, obstacle2 and obstacle3, then reach the goal without coming within 1.0 unit of any of them.",
            "descriptionMd": ("Spawn three obstacle turtles with **`/spawn`**, then reach the goal **(9.0, 9.0)** "
                              "(stop within 0.1) **without ever coming within 1.0 unit** of any of them.\n\n"
                              "| Name | x | y |\n|---|---|---|\n" + "".join(f"| `{n}` | {x} | {y} |\n" for n, x, y in GUARDS) +
                              "\n- Read each guard's position from **`/obstacleN/pose`**.\n"
                              "- The straight path is blocked by `obstacle1` — plan around it.\n- Teleport is not allowed."),
            "start": {"x": C, "y": C, "theta": 0.0},
            "goal": {"x": T1_GOAL[0], "y": T1_GOAL[1], "tolerance": 0.1},
            "guards": {"safeRadius": SAFE_RADIUS, "spawn": [{"name": n, "x": x, "y": y} for n, x, y in GUARDS]},
            "target": None, "tolerance": 0.12, "passThreshold": 100,
            "rules": {"allow_teleport": False}, "maxSimSec": 180,
            "checks": ["guards_spawned", "guard_clearance", "goal_reached", "stopped", "no_teleport"],
            "starterCode": STARTER_T2,
        },
        {
            "id": "ps2-t3-basic-shapes", "ps": 2, "task": 3, "card": None,
            "title": "Basic Shapes",
            "summary": "Draw a square, rectangle, triangle, circle and hexagon to the given sizes, each in its own colour.",
            "descriptionMd": "Draw all five shapes at these sizes and positions:\n\n" + shapes_md + "\n" + draw_rules,
            "start": {"x": C, "y": C, "theta": 0.0}, "goal": None, "guards": None,
            "target": target(start, t3_strokes()), "tolerance": 0.12, "passThreshold": 98,
            "rules": {"allow_teleport": True, "teleport_pen_up_only": True}, "maxSimSec": 240,
            "checks": ["shape_match", "distinct_colours:5", "pen_up_teleport"],
            "starterCode": STARTER_DRAW,
        },
        {
            "id": "ps2-t4-star", "ps": 2, "task": 4, "card": 1, "title": "Card 1 · Star (one stroke)",
            "summary": "Draw a five-point star in a single continuous stroke.",
            "descriptionMd": (f"Draw a **five-point star** with edge **{STAR['side']}**, centred in the arena, in **one stroke** "
                              f"(the pen never lifts).\n\n- Start pose: ({STAR_START[0]:.3f}, {STAR_START[1]:.3f}), facing east — that is the left arm tip.\n"
                              "- Every vertex turns −144°.\n- Own colour. No teleport."),
            "start": {"x": r6(STAR_START[0]), "y": r6(STAR_START[1]), "theta": 0.0}, "goal": None, "guards": None,
            "target": target((STAR_START[0], STAR_START[1], 0.0), star_strokes()), "tolerance": 0.12, "passThreshold": 98,
            "rules": {"allow_teleport": False}, "maxSimSec": 120,
            "checks": ["shape_match", "one_stroke", "no_teleport"],
            "starterCode": STARTER_DRAW,
        },
        {
            "id": "ps2-t4-house", "ps": 2, "task": 4, "card": 2, "title": "Card 2 · House",
            "summary": "Draw a house: square body, triangular roof, door and window.",
            "descriptionMd": ("Draw the **house**:\n\n| Part | Size | Position |\n|---|---|---|\n"
                              f"| Body (square) | side 2.5 | bottom-left ({HOUSE['x']:.3f}, {HOUSE['y']}) |\n"
                              "| Roof (equilateral triangle) | side 2.5 | on top of the body |\n"
                              f"| Door | 0.6 × 1.2 | bottom-left ({HOUSE['door'][0]:.3f}, {HOUSE['door'][1]}) |\n"
                              f"| Window (square) | side 0.5 | bottom-left ({HOUSE['window'][0]:.3f}, {HOUSE['window'][1]}) |\n\n"
                              "- Start pose: body bottom-left corner, facing east.\n- Own colours; pen up (teleport allowed with the pen up) between parts."),
            "start": {"x": r6(HOUSE["x"]), "y": HOUSE["y"], "theta": 0.0}, "goal": None, "guards": None,
            "target": target((HOUSE["x"], HOUSE["y"], 0.0), house_strokes()), "tolerance": 0.12, "passThreshold": 98,
            "rules": {"allow_teleport": True, "teleport_pen_up_only": True}, "maxSimSec": 180,
            "checks": ["shape_match", "distinct_colours:2", "pen_up_teleport"],
            "starterCode": STARTER_DRAW,
        },
        {
            "id": "ps2-t4-flower", "ps": 2, "task": 4, "card": 3, "title": "Card 3 · Flower",
            "summary": "Draw a flower: 6 circular petals and a stem.",
            "descriptionMd": (f"Draw a **flower**: **6 petals** — circles of radius **{FLOWER['r']}** whose centres sit {FLOWER['r']} away from "
                              f"the flower centre ({FLOWER['cx']:.3f}, {FLOWER['cy']}) at 90°, 150°, 210°, 270°, 330°, 30° — and a "
                              f"**stem** straight down from ({FLOWER['cx']:.3f}, {FLOWER['cy'] - 2 * FLOWER['r']}) to ({FLOWER['cx']:.3f}, {FLOWER['stem_bottom']}).\n\n"
                              "- Start pose: bottom of the stem, facing north.\n- Own colours; teleport allowed only with the pen up."),
            "start": {"x": r6(FLOWER["cx"]), "y": FLOWER["stem_bottom"], "theta": r6(math.pi / 2)}, "goal": None, "guards": None,
            "target": target((FLOWER["cx"], FLOWER["stem_bottom"], math.pi / 2), flower_strokes()), "tolerance": 0.12, "passThreshold": 98,
            "rules": {"allow_teleport": True, "teleport_pen_up_only": True}, "maxSimSec": 180,
            "checks": ["shape_match", "distinct_colours:2", "pen_up_teleport"],
            "starterCode": STARTER_DRAW,
        },
        {
            "id": "ps2-t4-spiral", "ps": 2, "task": 4, "card": 4, "title": "Card 4 · Spiral",
            "summary": "Draw an Archimedean spiral: 3 turns, outer radius 2.3.",
            "descriptionMd": ("Draw an **Archimedean spiral** r = b·φ centred in the arena: **3 turns** (φ from 0 to 6π), "
                              "counter-clockwise, outer radius **R = 2.3** (so b = 2.3 / 6π).\n\n"
                              "- Start pose: the centre, facing east. The spiral ends at (7.844, 5.544).\n- One stroke, own colour, no teleport."),
            "start": {"x": C, "y": C, "theta": 0.0}, "goal": None, "guards": None,
            "target": target(start, [poly(spiral_points(), (64, 210, 255))]), "tolerance": 0.12, "passThreshold": 97,
            "rules": {"allow_teleport": False}, "maxSimSec": 120,
            "checks": ["shape_match", "one_stroke", "no_teleport"],
            "starterCode": STARTER_DRAW,
        },
    ]


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "rvx-runtime" / "tasks.data.json"
    out.write_text(json.dumps(tasks(), indent=1) + "\n")
    print(f"wrote {out} ({len(tasks())} tasks)")
