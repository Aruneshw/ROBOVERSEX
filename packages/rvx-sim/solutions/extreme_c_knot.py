#!/usr/bin/env python3
"""INSTRUCTOR ONLY — Task 5 · Challenge C — (3,7) torus-knot projection with depth shading.

x = (2 + cos 7t) cos 3t, y = (2 + cos 7t) sin 3t, z = sin 7t; 2400 samples; x/y normalised
independently to 9.0 × 7.0 centred on the canvas. Segment k is gold if z(t_mid) ≥ 0 else navy.
Motion: closed loop on /turtle1/pose — one sample per 10 ms tick (all segments < 0.06), pen colour
switched with /turtle1/set_pen (pen stays down) exactly before the first segment of each run.
"""
import math

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose
from turtlesim.srv import SetPen

CENTER = 5.544445
P, Q, R, r = 3, 7, 2.0, 1.0
N = 2400
W, H = 9.0, 7.0
OVER, UNDER = (255, 214, 64), (25, 32, 105)
DT = 0.01


def raw(t):
    rr = R + r * math.cos(Q * t)
    return rr * math.cos(P * t), rr * math.sin(P * t), r * math.sin(Q * t)


def knot():
    pts = [raw(2 * math.pi * k / N) for k in range(N + 1)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    kx, ky = W / (max(xs) - min(xs)), H / (max(ys) - min(ys))
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    xy = [(CENTER + (x - mx) * kx, CENTER + (y - my) * ky) for x, y, _ in pts]
    colours = [OVER if raw(2 * math.pi * (k + 0.5) / N)[2] >= 0 else UNDER for k in range(N)]
    return xy, colours


class KnotDrawer(Node):
    def __init__(self):
        super().__init__('knot_drawer')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.pen = self.create_client(SetPen, '/turtle1/set_pen')
        self.points, self.colours = knot()
        self.i = 0                       # next segment: points[i] -> points[i + 1]
        self.colour = None
        self.done = False
        self.get_logger().info(f'(3,7) torus knot: {N} segments')
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 1)

    def on_pose(self, pose):
        if self.done:
            return
        msg = Twist()
        if self.i >= N:
            self.done = True
            self.cmd.publish(msg)
            self.get_logger().info(f'Knot complete at ({pose.x:.4f}, {pose.y:.4f})')
            rclpy.shutdown()
            return
        c = self.colours[self.i]
        if c != self.colour:             # over/under switch: same stroke, new colour
            self.pen.call(SetPen.Request(r=c[0], g=c[1], b=c[2], width=3, off=0))
            self.colour = c
        tx, ty = self.points[self.i + 1]
        dx, dy = tx - pose.x, ty - pose.y
        err = math.atan2(dy, dx) - pose.theta
        msg.angular.z = math.atan2(math.sin(err), math.cos(err)) / DT
        msg.linear.x = math.hypot(dx, dy) / DT
        self.cmd.publish(msg)
        self.i += 1


def main():
    rclpy.init()
    rclpy.spin(KnotDrawer())


if __name__ == '__main__':
    main()
