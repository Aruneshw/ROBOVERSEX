#!/usr/bin/env python3
"""PS1 · Task 1 — Reach the Goal.

Closed loop: read /turtle1/pose, publish /turtle1/cmd_vel, stop within 0.1 of (9.0, 9.0),
log "Goal reached". Runs unchanged on a real ROS 2 turtlesim.
"""
import math

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose

GOAL_X, GOAL_Y = 9.0, 9.0
STOP_TOL = 0.03          # stop well inside the 0.1 tolerance
K_LIN, K_ANG = 1.5, 6.0
MAX_LIN, MAX_ANG = 2.0, 3.0


def wrap(a):
    return math.atan2(math.sin(a), math.cos(a))


class GoalReacher(Node):
    def __init__(self):
        super().__init__('goal_reacher')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 10)
        self.pose = None
        self.last_log = -1.0
        self.timer = self.create_timer(0.02, self.control)
        self.get_logger().info(f'Node started — goal ({GOAL_X}, {GOAL_Y})')

    def on_pose(self, msg):
        self.pose = msg

    def control(self):
        if self.pose is None:
            return
        dx, dy = GOAL_X - self.pose.x, GOAL_Y - self.pose.y
        dist = math.hypot(dx, dy)
        msg = Twist()
        if dist < STOP_TOL:
            self.cmd.publish(msg)                       # zero Twist = stop
            self.get_logger().info(f'Goal reached at ({self.pose.x:.3f}, {self.pose.y:.3f}), error {dist:.3f}')
            self.timer.cancel()
            rclpy.shutdown()
            return
        err = wrap(math.atan2(dy, dx) - self.pose.theta)
        msg.angular.z = max(-MAX_ANG, min(MAX_ANG, K_ANG * err))
        # rotate in place first, then drive (keeps the path straight)
        msg.linear.x = min(MAX_LIN, K_LIN * dist) if abs(err) < 0.2 else 0.0
        self.cmd.publish(msg)
        t = self.get_clock().now().nanoseconds / 1e9
        if t - self.last_log >= 0.5:
            self.last_log = t
            self.get_logger().info(f'position ({self.pose.x:.2f}, {self.pose.y:.2f})  distance {dist:.2f}')


def main():
    rclpy.init()
    node = GoalReacher()
    rclpy.spin(node)


if __name__ == '__main__':
    main()
