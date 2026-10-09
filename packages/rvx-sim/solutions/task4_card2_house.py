#!/usr/bin/env python3
"""PS2 · Task 4 · Card 2 — House: square body 2.5, equilateral roof 2.5, door 0.6 x 1.2, window 0.5.

Start pose (given by the task): body bottom-left corner, facing east.
"""
import math
import time

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose
from turtlesim.srv import SetPen, TeleportAbsolute

C = 5.544445
BODY_X, BODY_Y, SIDE = C - 1.25, 2.5, 2.5
DOOR_X, DOOR_Y, DOOR_W, DOOR_H = C + 0.25, 2.5, 0.6, 1.2
WIN_X, WIN_Y, WIN_S = C - 0.85, 4.0, 0.5


class HouseArtist(Node):
    def __init__(self):
        super().__init__('house_artist')
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

    def jump(self, x, y, theta=0.0):
        self.set_pen((0, 0, 0), off=1)
        self.tp.call(TeleportAbsolute.Request(x=float(x), y=float(y), theta=float(theta)))

    def rect(self, x, y, w, h, rgb):
        self.jump(x, y)
        self.set_pen(rgb)
        for length in (w, h, w, h):
            self.drive(length, 0.0)
            self.drive(0.0, math.pi / 2)

    def run(self):
        log = self.get_logger()
        # body: we already start at its bottom-left corner facing east
        self.set_pen((255, 150, 50))
        for _ in range(4):
            self.drive(SIDE, 0.0)
            self.drive(0.0, math.pi / 2)
        log.info('body done')
        # roof: from the body's top-left corner, go along the top edge, then two 120° turns
        self.jump(BODY_X, BODY_Y + SIDE)
        self.set_pen((240, 60, 70))
        for _ in range(3):
            self.drive(SIDE, 0.0)
            self.drive(0.0, 2 * math.pi / 3)
        log.info('roof done')
        self.rect(DOOR_X, DOOR_Y, DOOR_W, DOOR_H, (255, 200, 60))
        log.info('door done')
        self.rect(WIN_X, WIN_Y, WIN_S, WIN_S, (255, 200, 60))
        log.info('window done')
        self.set_pen((0, 0, 0), off=1)
        log.info('House complete')


def main():
    rclpy.init()
    HouseArtist().run()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
