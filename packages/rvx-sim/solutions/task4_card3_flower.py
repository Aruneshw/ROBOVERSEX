#!/usr/bin/env python3
"""PS2 · Task 4 · Card 3 — Flower: 6 petals (circles r 1.0 around (5.544, 6.5)) + stem.

Start pose (given by the task): bottom of the stem (5.544, 1.5), facing north.
A circle of radius r = one Twist with linear r·2π and angular 2π for exactly 1 s.
"""
import math
import time

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.srv import SetPen, TeleportAbsolute

CX, CY, R = 5.544445, 6.5, 1.0
STEM_TOP = CY - 2 * R           # lowest point of the bottom petal


class FlowerArtist(Node):
    def __init__(self):
        super().__init__('flower_artist')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.pen = self.create_client(SetPen, '/turtle1/set_pen')
        self.tp = self.create_client(TeleportAbsolute, '/turtle1/teleport_absolute')

    def drive(self, linear, angular):
        msg = Twist()
        msg.linear.x = float(linear)
        msg.angular.z = float(angular)
        self.cmd.publish(msg)
        time.sleep(1.0)

    def set_pen(self, rgb, off=0):
        self.pen.call(SetPen.Request(r=rgb[0], g=rgb[1], b=rgb[2], width=3, off=off))

    def run(self):
        log = self.get_logger()
        self.set_pen((60, 220, 100))
        self.drive(STEM_TOP - 1.5, 0.0)                    # stem: straight up 3.0
        log.info('stem done')
        for k in range(6):
            a = math.radians(90 + 60 * k)
            px, py = CX + R * math.cos(a), CY + R * math.sin(a)   # petal centre
            self.set_pen((0, 0, 0), off=1)
            self.tp.call(TeleportAbsolute.Request(x=px, y=py - R, theta=0.0))   # bottom of the petal, facing east
            self.set_pen((255, 120, 220))
            self.drive(2 * math.pi * R, 2 * math.pi)        # full circle, centre on the left
            log.info(f'petal {k + 1}/6 done')
        self.set_pen((0, 0, 0), off=1)
        log.info('Flower complete')


def main():
    rclpy.init()
    FlowerArtist().run()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
