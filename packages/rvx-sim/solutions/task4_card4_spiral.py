#!/usr/bin/env python3
"""PS2 · Task 4 · Card 4 — Archimedean spiral, 3 turns, outer radius 2.3 (r = b·φ, b = 2.3 / 6π).

Start pose (given by the task): the centre, facing east. One stroke, no teleport.
Closed loop: on every /turtle1/pose message steer to the next point on the spiral
(angular = heading error / dt, linear = distance / dt), so the turtle lands on each point.
"""
import math

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose
from turtlesim.srv import SetPen

CX, CY = 5.544445, 5.544445
TURNS, R_OUT = 3, 2.3
B = R_OUT / (2 * math.pi * TURNS)
STEP = 0.03                      # arc length between spiral points
DT = 0.01


def spiral():
    pts, phi, end = [], 0.0, 2 * math.pi * TURNS
    while phi < end:
        r = B * phi
        pts.append((CX + r * math.cos(phi), CY + r * math.sin(phi)))
        phi += STEP / math.hypot(r, B)
    pts.append((CX + R_OUT, CY))
    return pts


class SpiralArtist(Node):
    def __init__(self):
        super().__init__('spiral_artist')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.create_client(SetPen, '/turtle1/set_pen').call(SetPen.Request(r=64, g=210, b=255, width=3, off=0))
        self.points = spiral()[1:]
        self.i = 0
        self.done = False
        self.get_logger().info(f'spiral: {len(self.points)} points, b = {B:.4f}')
        # steer on every pose message: each command is computed from the newest pose
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 1)

    def on_pose(self, pose):
        if self.done:
            return
        msg = Twist()
        if self.i >= len(self.points):
            self.done = True
            self.cmd.publish(msg)
            self.get_logger().info(f'Spiral complete at ({pose.x:.3f}, {pose.y:.3f})')
            rclpy.shutdown()
            return
        tx, ty = self.points[self.i]
        dx, dy = tx - pose.x, ty - pose.y
        heading = math.atan2(dy, dx)
        msg.angular.z = math.atan2(math.sin(heading - pose.theta), math.cos(heading - pose.theta)) / DT
        msg.linear.x = math.hypot(dx, dy) / DT
        self.cmd.publish(msg)
        self.i += 1
        if self.i % 200 == 0:
            self.get_logger().info(f'{self.i}/{len(self.points)} points, radius {math.hypot(tx - CX, ty - CY):.2f}')


def main():
    rclpy.init()
    node = SpiralArtist()
    rclpy.spin(node)


if __name__ == '__main__':
    main()
