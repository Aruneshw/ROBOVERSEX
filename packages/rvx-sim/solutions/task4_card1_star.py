#!/usr/bin/env python3
"""PS2 · Task 4 · Card 1 — Star in one stroke (edge 3.5, every vertex turns -144°).

Start pose (given by the task): the left arm tip, facing east. The pen never lifts.
"""
import math
import time

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.srv import SetPen

EDGE = 3.5


def main():
    rclpy.init()
    node = Node('star_artist')
    cmd = node.create_publisher(Twist, '/turtle1/cmd_vel', 10)
    node.create_client(SetPen, '/turtle1/set_pen').call(SetPen.Request(r=255, g=220, b=60, width=3, off=0))

    def drive(linear, angular):
        msg = Twist()
        msg.linear.x = float(linear)
        msg.angular.z = float(angular)
        cmd.publish(msg)
        time.sleep(1.0)            # a Twist acts for exactly 1.0 s

    for i in range(5):
        drive(EDGE, 0.0)
        drive(0.0, -4 * math.pi / 5)
        node.get_logger().info(f'edge {i + 1}/5 done')
    node.get_logger().info('Star complete (one stroke)')
    rclpy.shutdown()


if __name__ == '__main__':
    main()
