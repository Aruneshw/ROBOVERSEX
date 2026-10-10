#!/usr/bin/env python3
"""INSTRUCTOR ONLY — Task 5 · Challenge A — Heighway dragon, order 12 (4096 segments).

Path generation: regular paper-folding turn sequence (turn k is LEFT iff ((k & -k) << 1) & k == 0),
unit grid walk, uniform scale so the larger bbox side is 9.0, bbox centred on the canvas centre.
Motion: closed loop on /turtle1/pose — every pose message steers to the next waypoint
(waypoints ≤ 0.0595 apart, so linear speed stays ≤ 5.95 units/s at the 100 Hz pose rate).
"""
import math

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose
from turtlesim.srv import SetPen

CENTER = 5.544445
ORDER = 12
SIZE = 9.0
DT = 0.01
MAX_STEP = 0.0595


def dragon_vertices():
    dirs = [(1, 0), (0, 1), (-1, 0), (0, -1)]
    x, y, d = 1, 0, 0
    pts = [(0, 0), (1, 0)]
    for k in range(1, 2 ** ORDER):
        d = (d + (1 if (((k & -k) << 1) & k) == 0 else -1)) % 4
        x, y = x + dirs[d][0], y + dirs[d][1]
        pts.append((x, y))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    s = SIZE / max(max(xs) - min(xs), max(ys) - min(ys))
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return [(CENTER + (px - mx) * s, CENTER + (py - my) * s) for px, py in pts]


def densify(vertices, step=MAX_STEP):
    """Split every edge into equal sub-steps ≤ step; corners are kept exactly."""
    out = [vertices[0]]
    for (x0, y0), (x1, y1) in zip(vertices, vertices[1:]):
        n = max(1, math.ceil(math.hypot(x1 - x0, y1 - y0) / step))
        out += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(1, n + 1)]
    return out


class DragonDrawer(Node):
    def __init__(self):
        super().__init__('dragon_drawer')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.create_client(SetPen, '/turtle1/set_pen').call(SetPen.Request(r=255, g=120, b=90, width=3, off=0))
        verts = dragon_vertices()
        self.path = densify(verts)[1:]
        self.i = 0
        self.done = False
        self.get_logger().info(f'dragon order {ORDER}: {len(verts) - 1} segments, {len(self.path)} waypoints')
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 1)

    def on_pose(self, pose):
        if self.done:
            return
        msg = Twist()
        if self.i >= len(self.path):
            self.done = True
            self.cmd.publish(msg)
            self.get_logger().info(f'Dragon complete at ({pose.x:.4f}, {pose.y:.4f})')
            rclpy.shutdown()
            return
        tx, ty = self.path[self.i]
        dx, dy = tx - pose.x, ty - pose.y
        err = math.atan2(dy, dx) - pose.theta
        msg.angular.z = math.atan2(math.sin(err), math.cos(err)) / DT
        msg.linear.x = math.hypot(dx, dy) / DT
        self.cmd.publish(msg)
        self.i += 1
        if self.i % 2048 == 0:
            self.get_logger().info(f'{self.i}/{len(self.path)} waypoints')


def main():
    rclpy.init()
    rclpy.spin(DragonDrawer())


if __name__ == '__main__':
    main()
