#!/usr/bin/env python3
"""PS1 · Task 2 — Dodge the Guards.

1. /spawn obstacle1..3.
2. Read their positions from /obstacleN/pose.
3. Plan: A* on a 0.1-unit grid with every guard inflated to 1.35 (1.0 safe radius + margin),
   then shorten the path with line-of-sight checks.
4. Follow the waypoints closed-loop (rotate, then drive) and stop within 0.1 of the goal.
Runs unchanged on a real ROS 2 turtlesim.
"""
import heapq
import math

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose
from turtlesim.srv import Spawn

GOAL = (9.0, 9.0)
GUARDS = {'obstacle1': (7.0, 7.0), 'obstacle2': (3.5, 8.0), 'obstacle3': (8.5, 4.0)}
SAFE_RADIUS = 1.0
INFLATE = SAFE_RADIUS + 0.35
WORLD = 11.088889
CELL = 0.1


def wrap(a):
    return math.atan2(math.sin(a), math.cos(a))


def seg_clear(a, b, obstacles, r):
    """True if segment a-b keeps at least r from every obstacle centre."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    for ox, oy in obstacles:
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((ox - ax) * dx + (oy - ay) * dy) / L2))
        if math.hypot(ax + t * dx - ox, ay + t * dy - oy) < r:
            return False
    return True


def plan(start, goal, obstacles):
    n = int(WORLD / CELL) + 1
    to_cell = lambda p: (min(n - 1, max(0, round(p[0] / CELL))), min(n - 1, max(0, round(p[1] / CELL))))
    to_pt = lambda c: (c[0] * CELL, c[1] * CELL)
    free = lambda c: all(math.hypot(c[0] * CELL - ox, c[1] * CELL - oy) >= INFLATE for ox, oy in obstacles)
    s, g = to_cell(start), to_cell(goal)
    h = lambda c: math.hypot(c[0] - g[0], c[1] - g[1])
    openq, came, cost = [(h(s), s)], {s: None}, {s: 0.0}
    moves = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    while openq:
        _, c = heapq.heappop(openq)
        if c == g:
            break
        for mx, my in moves:
            nb = (c[0] + mx, c[1] + my)
            if not (0 <= nb[0] < n and 0 <= nb[1] < n) or not free(nb):
                continue
            nc = cost[c] + math.hypot(mx, my)
            if nc < cost.get(nb, 1e18):
                cost[nb], came[nb] = nc, c
                heapq.heappush(openq, (nc + h(nb), nb))
    if g not in came:
        return None
    path, c = [], g
    while c is not None:
        path.append(to_pt(c))
        c = came[c]
    path.reverse()
    path[0], path[-1] = start, goal
    # line-of-sight shortcut
    out, i = [path[0]], 0
    while i < len(path) - 1:
        j = len(path) - 1
        while j > i + 1 and not seg_clear(path[i], path[j], obstacles, INFLATE - 0.05):
            j -= 1
        out.append(path[j])
        i = j
    return out


class GuardDodger(Node):
    def __init__(self):
        super().__init__('guard_dodger')
        self.cmd = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 10)
        self.pose = None
        self.obstacles = {}
        self.path = None
        self.wp = 0
        self.spawn_guards()
        for name in GUARDS:
            self.create_subscription(Pose, f'/{name}/pose', lambda m, n=name: self.on_guard(n, m), 10)
        self.timer = self.create_timer(0.02, self.control)

    def spawn_guards(self):
        client = self.create_client(Spawn, '/spawn')
        client.wait_for_service()
        for name, (x, y) in GUARDS.items():
            future = client.call_async(Spawn.Request(x=x, y=y, theta=0.0, name=name))
            rclpy.spin_until_future_complete(self, future)
            self.get_logger().info(f'spawned {future.result().name} at ({x}, {y})')

    def on_pose(self, msg):
        self.pose = msg

    def on_guard(self, name, msg):
        self.obstacles[name] = (msg.x, msg.y)

    def control(self):
        if self.pose is None or len(self.obstacles) < len(GUARDS):
            return
        if self.path is None:
            self.path = plan((self.pose.x, self.pose.y), GOAL, list(self.obstacles.values()))
            if not self.path:
                self.get_logger().error('No safe path to the goal')
                rclpy.shutdown()
                return
            self.wp = 1
            pts = ', '.join(f'({x:.2f}, {y:.2f})' for x, y in self.path)
            self.get_logger().info(f'path planned: {pts}')
        tx, ty = self.path[self.wp]
        last = self.wp == len(self.path) - 1
        dx, dy = tx - self.pose.x, ty - self.pose.y
        dist = math.hypot(dx, dy)
        msg = Twist()
        if dist < (0.03 if last else 0.05):
            if last:
                self.cmd.publish(msg)
                clearance = min(math.hypot(self.pose.x - ox, self.pose.y - oy) for ox, oy in self.obstacles.values())
                self.get_logger().info(f'Goal reached at ({self.pose.x:.3f}, {self.pose.y:.3f}); nearest guard now {clearance:.2f}')
                self.timer.cancel()
                rclpy.shutdown()
                return
            self.wp += 1
            self.get_logger().info(f'waypoint {self.wp - 1} reached, heading to ({self.path[self.wp][0]:.2f}, {self.path[self.wp][1]:.2f})')
            self.cmd.publish(msg)
            return
        err = wrap(math.atan2(dy, dx) - self.pose.theta)
        msg.angular.z = max(-3.0, min(3.0, 6.0 * err))
        msg.linear.x = min(1.8, 1.5 * dist) if abs(err) < 0.1 else 0.0
        self.cmd.publish(msg)


def main():
    rclpy.init()
    node = GuardDodger()
    rclpy.spin(node)


if __name__ == '__main__':
    main()
