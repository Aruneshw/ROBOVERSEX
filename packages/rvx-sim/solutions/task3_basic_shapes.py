#!/usr/bin/env python3
"""PS2 · Task 3 — Basic Shapes.

Square 2.5, rectangle 3.0 x 1.5, triangle 2.5, circle r 1.0, hexagon 1.2 — each closed, own colour,
pen up between shapes (teleport only with the pen up). Every Twist acts for exactly 1.0 s,
so `drive(L, 0)` moves exactly L units and `drive(0, a)` turns exactly a radians.
"""
import math
import time

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.srv import SetPen, TeleportAbsolute


class Artist(Node):
    def __init__(self):
        super().__init__('shape_artist')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.pen = self.create_client(SetPen, '/turtle1/set_pen')
        self.tp = self.create_client(TeleportAbsolute, '/turtle1/teleport_absolute')
        self.pen.wait_for_service()
        self.tp.wait_for_service()

    def drive(self, linear, angular):
        msg = Twist()
        msg.linear.x = float(linear)
        msg.angular.z = float(angular)
        self.cmd.publish(msg)
        time.sleep(1.0)

    def set_pen(self, rgb, off=0):
        self.pen.call(SetPen.Request(r=rgb[0], g=rgb[1], b=rgb[2], width=3, off=off))

    def start_shape(self, x, y, rgb, theta=0.0):
        self.set_pen((0, 0, 0), off=1)                       # pen UP
        self.tp.call(TeleportAbsolute.Request(x=float(x), y=float(y), theta=float(theta)))
        self.set_pen(rgb)                                    # pen DOWN in this shape's colour

    def polygon(self, x, y, side, sides, rgb):
        self.start_shape(x, y, rgb)
        for _ in range(sides):
            self.drive(side, 0.0)
            self.drive(0.0, 2 * math.pi / sides)

    def rectangle(self, x, y, w, h, rgb):
        self.start_shape(x, y, rgb)
        for length in (w, h, w, h):
            self.drive(length, 0.0)
            self.drive(0.0, math.pi / 2)

    def circle(self, cx, cy, r, rgb):
        self.start_shape(cx, cy - r, rgb)                    # bottom point, heading east → centre on the left
        self.drive(2 * math.pi * r, 2 * math.pi)             # one full turn in exactly 1 s

    def run(self):
        log = self.get_logger()
        log.info('square 2.5');          self.polygon(1.0, 7.25, 2.5, 4, (255, 80, 80))
        log.info('rectangle 3.0 x 1.5'); self.rectangle(4.25, 7.75, 3.0, 1.5, (80, 220, 120))
        log.info('triangle 2.5');        self.polygon(8.0, 7.5, 2.5, 3, (255, 255, 255))
        log.info('circle r 1.0');        self.circle(3.0, 3.5, 1.0, (255, 214, 64))
        log.info('hexagon 1.2')
        self.polygon(7.0 - 0.6, 3.5 - 1.2 * math.sqrt(3) / 2, 1.2, 6, (255, 150, 50))
        self.set_pen((0, 0, 0), off=1)
        log.info('All five shapes drawn')


def main():
    rclpy.init()
    Artist().run()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
