"""
RVX-Sim rclpy shim — lets unmodified ROS 2 (rclpy) turtlesim programs run
against TurtleWorld with simulated time. Installed into sys.modules as:
  rclpy, rclpy.node, rclpy.qos, rclpy.duration, rclpy.time,
  geometry_msgs, geometry_msgs.msg, turtlesim, turtlesim.msg, turtlesim.srv,
  turtlesim.action, std_srvs, std_srvs.srv

Semantics (single-threaded executor, like rclpy.spin):
  * callbacks run ONLY inside spin / spin_once / spin_until_future_complete
  * time.sleep(s) advances simulated time (callbacks do NOT run during sleep)
  * time.time()/monotonic()/perf_counter() return simulated time
  * a Twist keeps acting for exactly 1.0 s unless replaced
  * the run ends when: program returns, the turtle idles IDLE_STOP_SEC, or MAX sim time
"""
from __future__ import annotations

import math
import sys
import time as _time
import types

from .engine import DT, TurtleWorld

# ---------------------------------------------------------------- run control
class SimFinished(BaseException):
    """Graceful end (turtle idle long enough). Not an error.
    BaseException so user code's `except Exception:` cannot swallow it."""


class SimTimeLimit(BaseException):
    """Simulated time budget exhausted."""


class SimLoopError(BaseException):
    """Program loops without ever letting simulated time advance."""


BUSY_LIMIT = 200_000   # calls without time advancing => infinite loop


class Runtime:
    def __init__(self, world: TurtleWorld, max_sim_sec: float = 120.0, idle_stop_sec: float = 5.0,
                 on_log=None):
        self.world = world
        self.max_ticks = int(round(max_sim_sec / DT))
        self.idle_ticks = int(round(idle_stop_sec / DT))
        self.nodes: list["Node"] = []
        self.initialized = False
        self.shut_down = False
        self.busy = 0
        self.on_log = on_log
        self.ever_active = False

    # -- time
    def advance(self, ticks: int = 1) -> None:
        w = self.world
        for _ in range(max(0, int(ticks))):
            if w.tick >= self.max_ticks:
                raise SimTimeLimit(f"Simulated time limit reached ({self.max_ticks * DT:.0f} s)")
            w.step()
            self.busy = 0
            if w.activity_tick == w.tick:
                self.ever_active = True
            if self.ever_active and (w.tick - w.activity_tick) >= self.idle_ticks and not w.moving:
                raise SimFinished()
            if not self.ever_active and w.tick >= self.idle_ticks * 2:
                raise SimFinished()
            msg = None
            for n in self.nodes:
                for sub in n._subs:
                    if sub.kind == "pose":
                        if msg is None:
                            msg = w.pose_msg()
                        sub.queue.append(msg)
                        if len(sub.queue) > sub.depth:
                            del sub.queue[0]

    def poke(self) -> None:
        self.busy += 1
        if self.busy > BUSY_LIMIT:
            raise SimLoopError(
                "Your program keeps looping but simulated time never advances. "
                "Add time.sleep(...) inside the loop, or use a timer + rclpy.spin()."
            )

    def now_ns(self) -> int:
        return int(round(self.world.tick * DT * 1e9))

    def log(self, level: str, name: str, msg: str) -> None:
        line = f"[{level}] [{self.world.tick * DT:.2f}] [{name}]: {msg}"
        self.world.logs.append({"tick": self.world.tick, "level": level, "msg": line})
        if self.on_log:
            self.on_log(line)

    # -- executor
    def ready_work(self, node: "Node") -> list:
        work = []
        t = self.world.tick
        for tm in node._timers:
            if not tm.cancelled and t >= tm.next_tick:
                work.append(tm)
        for sub in node._subs:
            if sub.queue:
                work.append(sub)
        return work

    def spin_once(self, node: "Node", timeout_sec: float | None) -> None:
        self.poke()
        limit = None if timeout_sec is None or timeout_sec < 0 else int(round(timeout_sec / DT))
        waited = 0
        while True:
            work = self.ready_work(node)
            if work:
                item = work[0]
                if isinstance(item, Timer):
                    item.next_tick += item.period_ticks
                    if item.next_tick <= self.world.tick:          # overdue: skip missed periods
                        item.next_tick = self.world.tick + item.period_ticks
                    item.callback()
                else:
                    m = item.queue.pop(0)
                    item.callback(_pose_from_dict(m))
                return
            if limit is not None and waited >= limit:
                return
            self.advance(1)
            waited += 1


# ------------------------------------------------------------------ messages
class Vector3:
    def __init__(self, x: float = 0.0, y: float = 0.0, z: float = 0.0):
        self.x, self.y, self.z = float(x), float(y), float(z)

    def __repr__(self):
        return f"geometry_msgs.msg.Vector3(x={self.x}, y={self.y}, z={self.z})"


class Twist:
    def __init__(self, linear: Vector3 | None = None, angular: Vector3 | None = None):
        self.linear = linear if linear is not None else Vector3()
        self.angular = angular if angular is not None else Vector3()

    def __repr__(self):
        return f"geometry_msgs.msg.Twist(linear={self.linear!r}, angular={self.angular!r})"


class Pose:
    def __init__(self, x=0.0, y=0.0, theta=0.0, linear_velocity=0.0, angular_velocity=0.0):
        self.x, self.y, self.theta = float(x), float(y), float(theta)
        self.linear_velocity, self.angular_velocity = float(linear_velocity), float(angular_velocity)

    def __repr__(self):
        return (f"turtlesim.msg.Pose(x={self.x:.6f}, y={self.y:.6f}, theta={self.theta:.6f}, "
                f"linear_velocity={self.linear_velocity}, angular_velocity={self.angular_velocity})")


def _pose_from_dict(d: dict) -> Pose:
    return Pose(**d)


def _srv(name: str, req_fields: dict, resp_fields: dict | None = None):
    """Build a ROS-style service type with nested Request/Response classes."""
    resp_fields = resp_fields or {}

    def mk(cls_name, fields):
        def __init__(self, **kw):
            for k, v in fields.items():
                setattr(self, k, kw.get(k, v))
        def __repr__(self):
            return f"{name}.{cls_name}(" + ", ".join(f"{k}={getattr(self, k)!r}" for k in fields) + ")"
        return type(cls_name, (), {"__init__": __init__, "__repr__": __repr__, "_fields": fields})

    return type(name, (), {"Request": mk("Request", req_fields), "Response": mk("Response", resp_fields),
                           "_srv_name": name})


TeleportAbsolute = _srv("TeleportAbsolute", {"x": 0.0, "y": 0.0, "theta": 0.0})
TeleportRelative = _srv("TeleportRelative", {"linear": 0.0, "angular": 0.0})
SetPen = _srv("SetPen", {"r": 0, "g": 0, "b": 0, "width": 0, "off": 0})
Spawn = _srv("Spawn", {"x": 0.0, "y": 0.0, "theta": 0.0, "name": ""}, {"name": ""})
Kill = _srv("Kill", {"name": ""})
Empty = _srv("Empty", {})
RotateAbsolute = _srv("RotateAbsolute", {"theta": 0.0}, {"delta": 0.0})
RotateAbsolute.Goal = RotateAbsolute.Request


# --------------------------------------------------------------- rclpy objects
def _norm(topic: str) -> str:
    topic = topic.strip()
    return topic if topic.startswith("/") else "/" + topic


class Future:
    def __init__(self):
        self._result, self._done, self._cbs = None, False, []

    def set_result(self, r):
        self._result, self._done = r, True
        for cb in self._cbs:
            cb(self)

    def done(self):
        return self._done

    def result(self):
        return self._result

    def add_done_callback(self, cb):
        if self._done:
            cb(self)
        else:
            self._cbs.append(cb)


class Publisher:
    def __init__(self, rt: Runtime, node: "Node", msg_type, topic: str):
        self.rt, self.node, self.topic, self.msg_type = rt, node, _norm(topic), msg_type
        self._warned = False

    def publish(self, msg) -> None:
        self.rt.poke()
        if self.topic == "/turtle1/cmd_vel":
            self.rt.world.cmd_vel(msg.linear.x, msg.linear.y, msg.angular.z)
        elif not self._warned:
            self._warned = True
            self.rt.log("WARN", self.node._name, f"Topic '{self.topic}' does not exist in the RVX arena (ignored).")

    def get_subscription_count(self) -> int:
        return 1 if self.topic == "/turtle1/cmd_vel" else 0

    def destroy(self):
        pass


class Subscription:
    def __init__(self, topic: str, callback, depth: int):
        self.topic, self.callback, self.depth = _norm(topic), callback, max(1, int(depth))
        self.kind = "pose" if self.topic == "/turtle1/pose" else "none"
        self.queue: list = []

    def destroy(self):
        self.kind = "none"


class Timer:
    def __init__(self, rt: Runtime, period_sec: float, callback):
        self.period_ticks = max(1, int(round(float(period_sec) / DT)))
        self.next_tick = rt.world.tick + self.period_ticks
        self.callback, self.cancelled, self.rt = callback, False, rt

    def cancel(self):
        self.cancelled = True

    def reset(self):
        self.cancelled = False
        self.next_tick = self.rt.world.tick + self.period_ticks

    def is_canceled(self):
        return self.cancelled

    def destroy(self):
        self.cancelled = True


class Client:
    def __init__(self, rt: Runtime, node: "Node", srv_type, name: str):
        self.rt, self.node, self.srv_type, self.name = rt, node, srv_type, _norm(name)

    def wait_for_service(self, timeout_sec: float | None = None) -> bool:
        return self.name in _SERVICES

    def service_is_ready(self) -> bool:
        return self.name in _SERVICES

    def call(self, request, timeout_sec=None):
        self.rt.poke()
        handler = _SERVICES.get(self.name)
        if handler is None:
            raise RuntimeError(f"Service '{self.name}' is not available in the RVX arena")
        return handler(self.rt, request, self.srv_type)

    def call_async(self, request) -> Future:
        f = Future()
        f.set_result(self.call(request))
        return f

    def destroy(self):
        pass


def _svc_teleport_abs(rt, r, t):
    rt.world.teleport_absolute(r.x, r.y, r.theta)
    return TeleportAbsolute.Response()


def _svc_teleport_rel(rt, r, t):
    rt.world.teleport_relative(r.linear, r.angular)
    return TeleportRelative.Response()


def _svc_set_pen(rt, r, t):
    rt.world.set_pen(r.r, r.g, r.b, r.width, r.off)
    return SetPen.Response()


def _svc_clear(rt, r, t):
    rt.world.clear()
    return Empty.Response()


def _svc_reset(rt, r, t):
    rt.world.reset()
    return Empty.Response()


def _svc_spawn(rt, r, t):
    raise RuntimeError("Only 'turtle1' exists in the Roboverse X arena — /spawn is disabled.")


_SERVICES = {
    "/turtle1/teleport_absolute": _svc_teleport_abs,
    "/turtle1/teleport_relative": _svc_teleport_rel,
    "/turtle1/set_pen": _svc_set_pen,
    "/clear": _svc_clear,
    "/reset": _svc_reset,
    "/spawn": _svc_spawn,
}


class Duration:
    def __init__(self, seconds: float = 0, nanoseconds: int = 0):
        self.nanoseconds = int(seconds * 1e9) + int(nanoseconds)


class Time:
    def __init__(self, nanoseconds: int = 0, seconds: float = 0):
        self.nanoseconds = int(nanoseconds) + int(seconds * 1e9)

    def seconds_nanoseconds(self):
        return divmod(self.nanoseconds, 1_000_000_000)

    def __sub__(self, other):
        if isinstance(other, Time):
            return Duration(nanoseconds=self.nanoseconds - other.nanoseconds)
        return Time(nanoseconds=self.nanoseconds - other.nanoseconds)

    def __add__(self, d):
        return Time(nanoseconds=self.nanoseconds + d.nanoseconds)

    def __lt__(self, o): return self.nanoseconds < o.nanoseconds
    def __le__(self, o): return self.nanoseconds <= o.nanoseconds
    def __gt__(self, o): return self.nanoseconds > o.nanoseconds
    def __ge__(self, o): return self.nanoseconds >= o.nanoseconds

    def to_msg(self):
        s, ns = self.seconds_nanoseconds()
        return types.SimpleNamespace(sec=s, nanosec=ns)


class Clock:
    def __init__(self, rt: Runtime):
        self.rt = rt

    def now(self) -> Time:
        return Time(nanoseconds=self.rt.now_ns())


class Logger:
    def __init__(self, rt: Runtime, name: str):
        self.rt, self.name = rt, name

    def debug(self, msg, *a, **k): pass
    def info(self, msg, *a, **k): self.rt.log("INFO", self.name, str(msg))
    def warn(self, msg, *a, **k): self.rt.log("WARN", self.name, str(msg))
    warning = warn
    def error(self, msg, *a, **k): self.rt.log("ERROR", self.name, str(msg))
    def fatal(self, msg, *a, **k): self.rt.log("FATAL", self.name, str(msg))


class Parameter:
    def __init__(self, name, value=None):
        self.name, self.value = name, value

    def get_parameter_value(self):
        v = self.value
        return types.SimpleNamespace(double_value=v, integer_value=v, string_value=v, bool_value=v)


def _make_node_class(rt: Runtime):
    class Node:
        def __init__(self, node_name: str, *args, namespace: str = "", **kwargs):
            if not rt.initialized:
                raise RuntimeError("rclpy.init() has not been called — call rclpy.init() before creating a Node")
            self._name = node_name
            self._pubs, self._subs, self._timers, self._clients = [], [], [], []
            self._params: dict = {}
            rt.nodes.append(self)

        def get_name(self): return self._name
        def get_namespace(self): return "/"
        def get_logger(self): return Logger(rt, self._name)
        def get_clock(self): return Clock(rt)

        def create_publisher(self, msg_type, topic, qos_profile=10, **kw):
            p = Publisher(rt, self, msg_type, topic)
            self._pubs.append(p)
            return p

        def create_subscription(self, msg_type, topic, callback, qos_profile=10, **kw):
            depth = qos_profile if isinstance(qos_profile, int) else getattr(qos_profile, "depth", 10)
            s = Subscription(topic, callback, depth)
            self._subs.append(s)
            return s

        def create_timer(self, timer_period_sec, callback, **kw):
            t = Timer(rt, timer_period_sec, callback)
            self._timers.append(t)
            return t

        def create_client(self, srv_type, srv_name, **kw):
            c = Client(rt, self, srv_type, srv_name)
            self._clients.append(c)
            return c

        def create_rate(self, frequency):
            period = 1.0 / float(frequency)
            return types.SimpleNamespace(sleep=lambda: rt.advance(max(1, int(round(period / DT)))))

        def declare_parameter(self, name, value=None, *a, **k):
            self._params[name] = Parameter(name, value)
            return self._params[name]

        def get_parameter(self, name):
            return self._params.get(name, Parameter(name, None))

        def destroy_timer(self, t): t.cancel(); return True
        def destroy_subscription(self, s): s.destroy(); return True
        def destroy_publisher(self, p): return True
        def destroy_client(self, c): return True

        def destroy_node(self):
            for t in self._timers:
                t.cancel()
            for s in self._subs:
                s.destroy()
            if self in rt.nodes:
                rt.nodes.remove(self)

    return Node


class _ActionClient:
    """Minimal rclpy.action.ActionClient for /turtle1/rotate_absolute."""

    def __init__(self, rt, node, action_type, action_name):
        self.rt, self.name = rt, _norm(action_name)

    def wait_for_server(self, timeout_sec=None):
        return self.name == "/turtle1/rotate_absolute"

    def send_goal_async(self, goal, feedback_callback=None):
        w = self.rt.world
        start = w.theta
        w.rotate_absolute(goal.theta)
        while w.rot_target is not None:
            self.rt.advance(1)
        res = types.SimpleNamespace(result=RotateAbsolute.Response(delta=goal.theta - start), status=4)
        handle = types.SimpleNamespace(accepted=True, get_result_async=lambda: _done(res))
        return _done(handle)

    send_goal = send_goal_async


def _done(value) -> Future:
    f = Future()
    f.set_result(value)
    return f


# --------------------------------------------------------------- installation
_INSTALLED: dict = {}
_ORIG_TIME = {}


def install(rt: Runtime) -> None:
    """Register fake ROS packages in sys.modules and patch time.* to simulated time."""
    Node = _make_node_class(rt)

    def m(name: str, **attrs) -> types.ModuleType:
        mod = types.ModuleType(name)
        mod.__dict__.update(attrs)
        sys.modules[name] = mod
        _INSTALLED[name] = mod
        return mod

    def init(args=None, context=None, **kw):
        rt.initialized, rt.shut_down = True, False

    def shutdown(context=None, **kw):
        rt.shut_down = True

    def ok(context=None):
        rt.poke()
        return rt.initialized and not rt.shut_down

    def spin(node, executor=None):
        while rt.initialized and not rt.shut_down:
            rt.spin_once(node, None)

    def spin_once(node, executor=None, timeout_sec=None):
        rt.spin_once(node, timeout_sec)

    def spin_until_future_complete(node, future, executor=None, timeout_sec=None):
        limit = None if timeout_sec is None else int(round(timeout_sec / DT))
        start = rt.world.tick
        while not future.done():
            if limit is not None and rt.world.tick - start >= limit:
                return
            rt.spin_once(node, DT)

    def create_node(name, **kw):
        return Node(name, **kw)

    class QoSProfile:
        def __init__(self, depth=10, **kw):
            self.depth = depth

    rclpy = m("rclpy", init=init, shutdown=shutdown, ok=ok, spin=spin, spin_once=spin_once,
              spin_until_future_complete=spin_until_future_complete, create_node=create_node,
              try_shutdown=shutdown)
    rclpy.node = m("rclpy.node", Node=Node)
    rclpy.qos = m("rclpy.qos", QoSProfile=QoSProfile, qos_profile_sensor_data=QoSProfile(10),
                  ReliabilityPolicy=types.SimpleNamespace(RELIABLE=1, BEST_EFFORT=2),
                  HistoryPolicy=types.SimpleNamespace(KEEP_LAST=1, KEEP_ALL=2))
    rclpy.duration = m("rclpy.duration", Duration=Duration)
    rclpy.time = m("rclpy.time", Time=Time)
    rclpy.action = m("rclpy.action", ActionClient=lambda node, t, n: _ActionClient(rt, node, t, n))
    rclpy.executors = m("rclpy.executors", ExternalShutdownException=type("ExternalShutdownException", (Exception,), {}))

    gm = m("geometry_msgs")
    gm.msg = m("geometry_msgs.msg", Twist=Twist, Vector3=Vector3)
    ts = m("turtlesim")
    ts.msg = m("turtlesim.msg", Pose=Pose)
    ts.srv = m("turtlesim.srv", TeleportAbsolute=TeleportAbsolute, TeleportRelative=TeleportRelative,
               SetPen=SetPen, Spawn=Spawn, Kill=Kill)
    ts.action = m("turtlesim.action", RotateAbsolute=RotateAbsolute)
    ss = m("std_srvs")
    ss.srv = m("std_srvs.srv", Empty=Empty)

    # simulated time
    _ORIG_TIME.update(sleep=_time.sleep, time=_time.time, monotonic=_time.monotonic,
                      perf_counter=_time.perf_counter)
    base = 1_700_000_000.0

    def sim_sleep(sec):
        sec = float(sec)
        if sec > 0:
            rt.advance(max(1, int(round(sec / DT))))
        else:
            rt.poke()

    _time.sleep = sim_sleep
    _time.time = lambda: base + rt.world.tick * DT
    _time.monotonic = lambda: rt.world.tick * DT
    _time.perf_counter = lambda: rt.world.tick * DT


def uninstall() -> None:
    for name in list(_INSTALLED):
        sys.modules.pop(name, None)
    _INSTALLED.clear()
    for k, v in _ORIG_TIME.items():
        setattr(_time, k, v)
    _ORIG_TIME.clear()
