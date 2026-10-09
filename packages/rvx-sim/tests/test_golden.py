"""Golden tests for RVX-Sim. Run:  python -m pytest -q tests/   (from the folder containing rvx_sim/)"""
import math
import time
import json

from rvx_sim.runner import judge
from rvx_sim.engine import CENTER

C = CENTER
SQUARE_TASK = {
    "level": 1, "mode": "teleop", "tolerance": 0.12, "pass_threshold": 100.0,
    "max_sim_sec": 120, "idle_stop_sec": 5,
    "target": {"version": 1, "start_pose": {"x": C, "y": C, "theta": 0.0},
               "strokes": [{"points": [[C, C], [C + 2, C], [C + 2, C + 2], [C, C + 2], [C, C]], "color": [179, 184, 255]}]},
}


def star_points(x0=3.0, y0=4.0, side=4.0):
    pts, x, y, th = [[x0, y0]], x0, y0, 0.0
    for _ in range(5):
        x, y = x + side * math.cos(th), y + side * math.sin(th)
        pts.append([round(x, 6), round(y, 6)])
        th -= 4 * math.pi / 5
    return pts


STAR_TASK = {
    "level": 2, "mode": "code", "tolerance": 0.12, "pass_threshold": 100.0,
    "max_sim_sec": 120, "idle_stop_sec": 5, "rules": {"allow_teleport": False},
    "target": {"version": 1, "start_pose": {"x": 3.0, "y": 4.0, "theta": 0.0},
               "strokes": [{"points": star_points(), "color": [179, 184, 255]}]},
}

SQUARE_SLEEP_CODE = '''
import rclpy, time, math
from rclpy.node import Node
from geometry_msgs.msg import Twist

def main():
    rclpy.init()
    node = Node("square_drawer")
    pub = node.create_publisher(Twist, "/turtle1/cmd_vel", 10)
    for _ in range(4):
        m = Twist(); m.linear.x = 2.0
        pub.publish(m); time.sleep(1.0)
        m = Twist(); m.angular.z = math.pi / 2
        pub.publish(m); time.sleep(1.0)
    node.get_logger().info("Square done")
    node.destroy_node(); rclpy.shutdown()

if __name__ == "__main__":
    main()
'''

STAR_TIMER_CODE = '''
import math
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose

class StarDrawer(Node):
    def __init__(self):
        super().__init__("star_drawer")
        self.pub = self.create_publisher(Twist, "turtle1/cmd_vel", 10)
        self.sub = self.create_subscription(Pose, "/turtle1/pose", self.on_pose, 10)
        self.pose = None
        self.step = 0
        self.timer = self.create_timer(1.0, self.tick)

    def on_pose(self, msg):
        self.pose = msg

    def tick(self):
        if self.step >= 10:
            self.get_logger().info(f"Star complete at x={self.pose.x:.2f}")
            self.timer.cancel()
            rclpy.shutdown()
            return
        m = Twist()
        if self.step % 2 == 0:
            m.linear.x = 4.0
        else:
            m.angular.z = -4 * math.pi / 5
        self.pub.publish(m)
        self.step += 1

def main(args=None):
    rclpy.init(args=args)
    node = StarDrawer()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
'''


def square_log(side=2.0):
    log, t, seq = [], 0, 0
    for _ in range(4):
        log.append({"t": t, "seq": seq, "type": "cmd_vel", "lx": side, "ly": 0.0, "az": 0.0}); t += 100; seq += 1
        log.append({"t": t, "seq": seq, "type": "cmd_vel", "lx": 0.0, "ly": 0.0, "az": math.pi / 2}); t += 100; seq += 1
    return log


def test_level1_square_teleop_passes():
    r = judge({"kind": "teleop", "command_log": square_log(), "task": SQUARE_TASK})
    assert r["status"] == "passed", r
    assert r["score"] == 100.0


def test_level1_wrong_size_fails():
    r = judge({"kind": "teleop", "command_log": square_log(1.6), "task": SQUARE_TASK})
    assert r["status"] == "failed" and r["score"] < 100.0
    assert r["diff"]["missed"] and r["diff"]["extra"]


def test_level2_square_sleep_code_passes():
    r = judge({"kind": "code", "code": SQUARE_SLEEP_CODE, "task": SQUARE_TASK})
    assert r["status"] == "passed", (r["error"], r["score"])
    assert any("Square done" in l["msg"] for l in r["logs"])


def test_level2_star_timer_code_passes_and_is_fast():
    t0 = time.perf_counter()
    r = judge({"kind": "code", "code": STAR_TIMER_CODE, "task": STAR_TASK})
    assert r["status"] == "passed", (r["error"], r["score"], r["recall"], r["precision"])
    assert time.perf_counter() - t0 < 3.0


def test_teleport_rule_violation():
    code = '''
import rclpy
from rclpy.node import Node
from turtlesim.srv import TeleportAbsolute
rclpy.init(); n = Node("cheat")
c = n.create_client(TeleportAbsolute, "/turtle1/teleport_absolute")
c.wait_for_service()
for p in %s:
    c.call(TeleportAbsolute.Request(x=p[0], y=p[1], theta=0.0))
''' % json.dumps(star_points())
    r = judge({"kind": "code", "code": code, "task": STAR_TASK})
    assert r["status"] == "failed" and r["violation"]


def test_infinite_loop_is_caught():
    code = '''
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
rclpy.init(); n = Node("loop"); p = n.create_publisher(Twist, "/turtle1/cmd_vel", 10)
while True:
    p.publish(Twist())
'''
    r = judge({"kind": "code", "code": code, "task": SQUARE_TASK})
    assert r["status"] == "error" and "InfiniteLoop" in r["error"]


def test_syntax_error_reported_cleanly():
    r = judge({"kind": "code", "code": "import rclpy\nprint('x'\n", "task": SQUARE_TASK})
    assert r["status"] == "error" and "SyntaxError" in r["error"] and "solution.py" in r["error"]


def test_missing_init_is_reported():
    code = "from rclpy.node import Node\nimport rclpy\nn = Node('x')\n"
    r = judge({"kind": "code", "code": code, "task": SQUARE_TASK})
    assert r["status"] == "error" and "rclpy.init()" in r["error"]


def test_swallowing_exceptions_cannot_hang_the_judge():
    code = '''
import rclpy
from rclpy.node import Node
rclpy.init(); n = Node("x")
while True:
    try:
        rclpy.spin(n)
    except Exception:
        pass
'''
    r = judge({"kind": "code", "code": code, "task": SQUARE_TASK})
    assert r["status"] in ("failed", "error")


def test_reset_then_same_tick_draw_counts():
    code = '''
import rclpy, time, math
from rclpy.node import Node
from std_srvs.srv import Empty
from turtlesim.srv import SetPen
from geometry_msgs.msg import Twist
rclpy.init(); n = Node("r")
pub = n.create_publisher(Twist, "/turtle1/cmd_vel", 10)
m = Twist(); m.linear.x = 3.0; pub.publish(m); time.sleep(1.0)          # junk ink
n.create_client(Empty, "/reset").call(Empty.Request())                  # wipe + back to start
for _ in range(4):
    m = Twist(); m.linear.x = 2.0; pub.publish(m); time.sleep(1.0)
    m = Twist(); m.angular.z = math.pi / 2; pub.publish(m); time.sleep(1.0)
'''
    r = judge({"kind": "code", "code": code, "task": SQUARE_TASK})
    assert r["status"] == "passed", (r["score"], r["error"])


def test_print_is_captured_not_written_to_stdout(capsys):
    code = "import rclpy\nprint('hello turtle')\nwhile True:\n    print('spam')\n"
    r = judge({"kind": "code", "code": code, "task": SQUARE_TASK})
    assert capsys.readouterr().out == ""
    assert r["logs"][0]["msg"] == "hello turtle" or any(l["msg"] == "hello turtle" for l in r["trace"]["logs"])
    assert r["status"] == "error" and "InfiniteLoop" in r["error"]
