#!/usr/bin/env python3
"""INSTRUCTOR ONLY — Task 5 · Challenge B — Sierpinski triangle, depth 6, side 9.0, one stroke.

Key insight: in the depth-d Sierpinski graph every vertex has even degree (4, corners 2), so an
Euler circuit exists — every one of the 3·3^6 = 2187 edges is drawn exactly once (307.5 units).
The circuit is built recursively on an integer lattice by splicing closed walks (Hierholzer):
    T(P,Q,R) = T(P, mPQ, mPR)  ⊕ at mPQ: T(mPQ, Q, mQR)  ⊕ at mQR: T(mQR, R, mPR)
Retracing instead of an Euler circuit costs ≈ 1.5–2× the length and breaks the 90 s limit.
Motion: closed loop on /turtle1/pose, waypoints ≤ 0.0595 apart (≤ 5.95 units/s) → 65.6 s.
"""
import math

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose
from turtlesim.srv import SetPen

CENTER = 5.544445
DEPTH = 6
SIDE = 9.0
DT = 0.01
MAX_STEP = 0.0595
H = SIDE * math.sqrt(3) / 2
A = (CENTER - SIDE / 2, CENTER - H / 2)
B = (CENTER + SIDE / 2, CENTER - H / 2)
C = (CENTER, CENTER + H / 2)


def euler_walk(depth, p, q, r):
    """Closed walk starting and ending at lattice point p that covers every edge of gasket(p, q, r) once."""
    if depth == 0:
        return [p, q, r, p]
    mid = lambda a, b: ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)
    mpq, mqr, mpr = mid(p, q), mid(q, r), mid(p, r)
    walk_q = euler_walk(depth - 1, mpq, q, mqr)
    walk_r = euler_walk(depth - 1, mqr, r, mpr)
    i = walk_q.index(mqr)
    walk_q = walk_q[:i] + walk_r + walk_q[i + 1:]           # splice the R corner into the Q corner
    walk_p = euler_walk(depth - 1, p, mpq, mpr)
    j = walk_p.index(mpq)
    return walk_p[:j] + walk_q + walk_p[j + 1:]             # splice Q (+R) into the P corner


def to_xy(pt):
    n = 2 ** DEPTH
    i, j = pt
    return (A[0] + (B[0] - A[0]) * i / n + (C[0] - A[0]) * j / n,
            A[1] + (B[1] - A[1]) * i / n + (C[1] - A[1]) * j / n)


def densify(vertices, step=MAX_STEP):
    out = [vertices[0]]
    for (x0, y0), (x1, y1) in zip(vertices, vertices[1:]):
        n = max(1, math.ceil(math.hypot(x1 - x0, y1 - y0) / step))
        out += [(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(1, n + 1)]
    return out


class SierpinskiDrawer(Node):
    def __init__(self):
        super().__init__('sierpinski_drawer')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        n = 2 ** DEPTH
        walk = euler_walk(DEPTH, (0, 0), (n, 0), (0, n))
        edges = {frozenset(e) for e in zip(walk, walk[1:])}
        self.path = densify([to_xy(p) for p in walk])[1:]
        self.i = 0
        self.done = False
        self.get_logger().info(f'Euler circuit: {len(walk) - 1} edges ({len(edges)} distinct), {len(self.path)} waypoints')
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 1)

    def on_pose(self, pose):
        if self.done:
            return
        msg = Twist()
        if self.i >= len(self.path):
            self.done = True
            self.cmd.publish(msg)
            self.get_logger().info(f'Sierpinski complete at ({pose.x:.4f}, {pose.y:.4f})')
            rclpy.shutdown()
            return
        tx, ty = self.path[self.i]
        dx, dy = tx - pose.x, ty - pose.y
        err = math.atan2(dy, dx) - pose.theta
        msg.angular.z = math.atan2(math.sin(err), math.cos(err)) / DT
        msg.linear.x = math.hypot(dx, dy) / DT
        self.cmd.publish(msg)
        self.i += 1
        if self.i % 2000 == 0:
            self.get_logger().info(f'{self.i}/{len(self.path)} waypoints')


def main():
    rclpy.init()
    rclpy.spin(SierpinskiDrawer())


if __name__ == '__main__':
    main()
