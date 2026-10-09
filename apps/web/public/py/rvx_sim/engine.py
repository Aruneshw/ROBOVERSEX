"""
RVX-Sim engine — deterministic, turtlesim-faithful 2D turtle world.

Single source of truth for physics. The SAME file runs:
  * in the browser (Pyodide Web Worker) for live preview, and
  * on the server judge for official scoring.
A line-for-line TypeScript port (engine.ts) drives Level-1 live teleop.
If you change a constant here, change it in engine.ts too.
"""
from __future__ import annotations

import math

# ---- World constants (match ROS turtlesim: 500 px canvas, 45 px per metre) ----
WORLD_SIZE = 11.088889            # (500 - 1) / 45
CENTER = 5.544445                 # turtlesim spawn point
DT = 0.01                         # fixed 100 Hz step -> fully deterministic
CMD_TIMEOUT_TICKS = 100           # a Twist acts for exactly 1.0 s (like turtlesim)
ROTATE_ABS_SPEED = 1.0            # rad/s used by rotate_absolute (teleop G/B/V/C/D/E/R/T)
DEFAULT_PEN = (179, 184, 255, 3)  # r, g, b, width_px  (turtlesim default)
BG_COLOR = (69, 86, 255)          # turtlesim default background


def wrap_angle(a: float) -> float:
    """Wrap to [-pi, pi) exactly like turtlesim."""
    return a - 2.0 * math.pi * math.floor((a + math.pi) / (2.0 * math.pi))


def clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


class TurtleWorld:
    """One turtle ('turtle1') on an 11.09 x 11.09 world. Origin bottom-left, theta CCW from +x."""

    def __init__(self, start=(CENTER, CENTER, 0.0), record_poses: bool = True):
        self._start = (float(start[0]), float(start[1]), float(start[2]))
        self.record_poses = record_poses
        self.logs: list[dict] = []
        self.reset_world()

    # ------------------------------------------------------------------ state
    def reset_world(self) -> None:
        x, y, th = self._start
        self.x, self.y, self.theta = x, y, wrap_angle(th)
        self.vx = self.vy = self.wz = 0.0
        self.tick = 0
        self.last_cmd_tick = -(10 ** 9)
        self.rot_target: float | None = None
        self.pen_on = True
        self.pen = DEFAULT_PEN
        # segments: (tick, x0, y0, x1, y1, r, g, b, w)
        self.segments: list[tuple] = []
        # poses[i] = (x, y, theta) AFTER tick i  (poses[0] = start)
        self.poses: list[tuple] = [(self.x, self.y, self.theta)]
        # events used by playback: {"tick", "type", ...}
        self.events: list[dict] = []
        self.wall_contact = False
        self.wall_hits = 0
        self.activity_tick = 0   # last tick something visible happened

    def log(self, level: str, msg: str) -> None:
        self.logs.append({"tick": self.tick, "level": level, "msg": msg})

    @property
    def sim_time(self) -> float:
        return self.tick * DT

    @property
    def moving(self) -> bool:
        active = (self.tick - self.last_cmd_tick) < CMD_TIMEOUT_TICKS
        return (active and (self.vx != 0.0 or self.vy != 0.0 or self.wz != 0.0)) or self.rot_target is not None

    # --------------------------------------------------------------- commands
    def cmd_vel(self, lx: float, ly: float, az: float) -> None:
        """Equivalent of a Twist on /turtle1/cmd_vel (linear.x, linear.y, angular.z)."""
        self.vx, self.vy, self.wz = float(lx), float(ly), float(az)
        self.last_cmd_tick = self.tick
        self.rot_target = None          # a new twist cancels rotate_absolute (turtlesim behaviour)

    def _draw_to(self, nx: float, ny: float) -> None:
        if self.pen_on and (nx != self.x or ny != self.y):
            r, g, b, w = self.pen
            self.segments.append((self.tick, self.x, self.y, nx, ny, r, g, b, w))
            self.activity_tick = self.tick
        self.x, self.y = nx, ny

    def teleport_absolute(self, x: float, y: float, theta: float) -> None:
        nx, ny = clamp(float(x), 0.0, WORLD_SIZE), clamp(float(y), 0.0, WORLD_SIZE)
        self._draw_to(nx, ny)
        self.theta = wrap_angle(float(theta))
        self._snap_pose()
        self.events.append({"tick": self.tick, "type": "teleport"})
        self.activity_tick = self.tick

    def teleport_relative(self, linear: float, angular: float) -> None:
        th = wrap_angle(self.theta + float(angular))
        nx = clamp(self.x + math.cos(th) * float(linear), 0.0, WORLD_SIZE)
        ny = clamp(self.y + math.sin(th) * float(linear), 0.0, WORLD_SIZE)
        self.theta = th
        self._draw_to(nx, ny)
        self._snap_pose()
        self.events.append({"tick": self.tick, "type": "teleport"})
        self.activity_tick = self.tick

    def set_pen(self, r: int, g: int, b: int, width: int, off: int) -> None:
        self.pen = (int(clamp(r, 0, 255)), int(clamp(g, 0, 255)), int(clamp(b, 0, 255)), max(1, int(width)))
        self.pen_on = not bool(off)
        self.events.append({"tick": self.tick, "type": "pen", "on": self.pen_on, "pen": list(self.pen)})
        self.activity_tick = self.tick

    def clear(self) -> None:
        """/clear : erase drawing, keep turtle where it is."""
        self.segments.append(("CLEAR", self.tick))
        self.events.append({"tick": self.tick, "type": "clear"})
        self.activity_tick = self.tick

    def reset(self) -> None:
        """/reset : erase drawing, turtle back to start, pen back to default."""
        x, y, th = self._start
        self.x, self.y, self.theta = x, y, wrap_angle(th)
        self.vx = self.vy = self.wz = 0.0
        self.last_cmd_tick = -(10 ** 9)
        self.rot_target = None
        self.pen_on, self.pen = True, DEFAULT_PEN
        self.segments.append(("CLEAR", self.tick))
        self._snap_pose()
        self.events.append({"tick": self.tick, "type": "reset"})
        self.activity_tick = self.tick

    def rotate_absolute(self, theta: float) -> None:
        """Action /turtle1/rotate_absolute — rotate in place to an absolute heading."""
        self.vx = self.vy = self.wz = 0.0
        self.last_cmd_tick = -(10 ** 9)
        self.rot_target = wrap_angle(float(theta))

    def _snap_pose(self) -> None:
        if self.record_poses:
            self.poses[-1] = (self.x, self.y, self.theta)

    # ------------------------------------------------------------------- step
    def step(self) -> None:
        """Advance exactly one 10 ms tick."""
        if self.rot_target is not None:
            err = wrap_angle(self.rot_target - self.theta)
            step = ROTATE_ABS_SPEED * DT
            if abs(err) <= step:
                self.theta = self.rot_target
                self.rot_target = None
            else:
                self.theta = wrap_angle(self.theta + (step if err > 0 else -step))
            self.tick += 1
            self.activity_tick = self.tick
            if self.record_poses:
                self.poses.append((self.x, self.y, self.theta))
            return

        if self.tick - self.last_cmd_tick >= CMD_TIMEOUT_TICKS:
            self.vx = self.vy = self.wz = 0.0

        # orientation first, then position (same order as turtlesim)
        self.theta = wrap_angle(self.theta + self.wz * DT)
        c, s = math.cos(self.theta), math.sin(self.theta)
        nx = self.x + (c * self.vx - s * self.vy) * DT
        ny = self.y + (s * self.vx + c * self.vy) * DT

        hit = nx < 0.0 or nx > WORLD_SIZE or ny < 0.0 or ny > WORLD_SIZE
        if hit and not self.wall_contact:
            self.wall_hits += 1
            self.log("WARN", f"Oh no! I hit the wall! (Clamping from [x={nx:.6f}, y={ny:.6f}])")
        self.wall_contact = hit
        nx, ny = clamp(nx, 0.0, WORLD_SIZE), clamp(ny, 0.0, WORLD_SIZE)

        self.tick += 1
        if self.vx != 0.0 or self.vy != 0.0 or self.wz != 0.0:
            self.activity_tick = self.tick
        self._draw_to(nx, ny)
        if self.record_poses:
            self.poses.append((self.x, self.y, self.theta))

    def advance_to(self, tick: int) -> None:
        """Step until `tick`. Idle stretches are fast-forwarded (only valid when record_poses=False)."""
        while self.tick < tick:
            if not self.record_poses and not self.moving:
                self.tick = tick
                return
            self.step()

    def pose_msg(self) -> dict:
        active = (self.tick - self.last_cmd_tick) < CMD_TIMEOUT_TICKS
        return {
            "x": self.x, "y": self.y, "theta": self.theta,
            "linear_velocity": self.vx if active else 0.0,
            "angular_velocity": self.wz if active else 0.0,
        }

    # ----------------------------------------------------------------- export
    def visible_segments(self) -> list[tuple]:
        """Segments drawn after the last /clear or /reset — what the judge scores."""
        out: list[tuple] = []
        for s in self.segments:
            if s[0] == "CLEAR":
                out = []
            else:
                out.append(s)
        return out

    def export_trace(self) -> dict:
        """Compact JSON-safe trace for playback (browser) and storage (server)."""
        segs, clears = [], []
        for s in self.segments:
            if s[0] == "CLEAR":
                clears.append([s[1], len(segs)])   # [tick, index of first segment after the clear]
            else:
                segs.append([s[0], round(s[1], 5), round(s[2], 5), round(s[3], 5), round(s[4], 5), s[5], s[6], s[7], s[8]])
        flat = []
        for (x, y, th) in self.poses:
            flat.extend((round(x, 5), round(y, 5), round(th, 5)))
        return {
            "dt": DT,
            "ticks": self.tick,
            "poses": flat,              # [x0,y0,th0, x1,y1,th1, ...] one triple per tick
            "segments": segs,           # [tick,x0,y0,x1,y1,r,g,b,w]
            "clears": clears,           # [[tick, first_visible_segment_index], ...]
            "events": self.events,
            "logs": self.logs,
            "wall_hits": self.wall_hits,
        }
