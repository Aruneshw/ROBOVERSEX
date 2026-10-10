"""
RVX-Sim runner — executes a participant program (Level 2) or replays a
teleop command log (Level 1), then scores it against the task target.

Browser (Pyodide):  from rvx_sim.runner import run_program, replay_commands
Server judge:       python -I -m rvx_sim.runner < job.json > result.json
   job.json = {"kind": "code"|"teleop", "code": "...", "command_log": [...], "task": {...}}
"""
from __future__ import annotations

import contextlib
import json
import sys
import traceback

from .engine import CENTER, DT, TurtleWorld
from .score import score_trace
from . import shim

JUDGE_VERSION = "rvx-judge-1.0.0"


def _start_pose(task: dict) -> tuple:
    sp = (task.get("target") or {}).get("start_pose") or {}
    return (sp.get("x", CENTER), sp.get("y", CENTER), sp.get("theta", 0.0))


def _limits(task: dict) -> tuple:
    return float(task.get("max_sim_sec", 120)), float(task.get("idle_stop_sec", 5))


def _drain(world: TurtleWorld, rt: shim.Runtime | None = None) -> None:
    """After the program returns, let the last command finish (<= 1 s), like real turtlesim."""
    guard = 0
    while world.moving and guard < 100_000:
        if rt is not None and world.tick >= rt.max_ticks:
            break
        world.step()
        guard += 1


def _user_traceback(exc: BaseException) -> str:
    """Traceback limited to frames in solution.py — hides RVX internals."""
    tb = traceback.extract_tb(exc.__traceback__)
    frames = [f for f in tb if f.filename == "solution.py"]
    lines = ["Traceback (most recent call last):"]
    for f in frames:
        lines.append(f'  File "solution.py", line {f.lineno}, in {f.name}')
        if f.line:
            lines.append(f"    {f.line}")
    if isinstance(exc, SyntaxError):
        lines = [f'  File "solution.py", line {exc.lineno}', f"    {(exc.text or '').rstrip()}",
                 "    " + " " * max(0, (exc.offset or 1) - 1) + "^"]
    lines.append(f"{type(exc).__name__}: {exc}")
    return "\n".join(lines)


class _PrintCapture:
    """print() inside participant code -> timestamped console lines (keeps judge stdout clean)."""

    MAX_LINES = 2000

    def __init__(self, rt: shim.Runtime, on_log=None):
        self.rt, self.on_log, self.buf = rt, on_log, ""

    def write(self, s: str) -> int:
        self.rt.poke()                       # `while True: print(...)` is caught as an infinite loop
        self.buf += s
        while "\n" in self.buf:
            line, self.buf = self.buf.split("\n", 1)
            self._emit(line)
        return len(s)

    def _emit(self, line: str) -> None:
        logs = self.rt.world.logs
        if len(logs) < self.MAX_LINES:
            logs.append({"tick": self.rt.world.tick, "level": "PRINT", "msg": line})
            if self.on_log:
                self.on_log(line)

    def flush(self) -> None:
        if self.buf:
            self._emit(self.buf)
            self.buf = ""


def run_program(code: str, task: dict, on_log=None) -> dict:
    """Run Level-2 participant code in the simulated ROS world. Returns trace + status."""
    max_sim, idle = _limits(task)
    world = TurtleWorld(_start_pose(task))
    rt = shim.Runtime(world, max_sim_sec=max_sim, idle_stop_sec=idle, on_log=on_log)
    status, error = "finished", None
    shim.install(rt)
    capture = _PrintCapture(rt, on_log)
    try:
        compiled = compile(code, "solution.py", "exec")
        with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
            exec(compiled, {"__name__": "__main__", "__file__": "solution.py"})
        _drain(world, rt)
    except shim.SimFinished:
        status = "finished"
    except shim.SimTimeLimit as e:
        status, error = "time_limit", str(e)
    except shim.SimLoopError as e:
        status, error = "error", f"InfiniteLoop: {e}"
    except SystemExit:
        _drain(world, rt)
    except KeyboardInterrupt:
        status = "finished"
    except BaseException as e:  # noqa: BLE001 — participant code may raise anything
        status, error = "error", _user_traceback(e)
    finally:
        capture.flush()
        shim.uninstall()
    trace = world.export_trace()
    trace.update(status=status, error=error)
    return trace


def replay_commands(command_log: list, task: dict) -> dict:
    """Deterministically replay a Level-1 teleop/CLI command log recorded by engine.ts."""
    max_sim, _ = _limits(task)
    world = TurtleWorld(_start_pose(task), record_poses=False)   # fast-forwards idle think-time
    max_ticks = int(round(max_sim / DT))
    status, error = "finished", None
    try:
        for ev in sorted(command_log, key=lambda e: (int(e["t"]), int(e.get("seq", 0)))):
            t = int(ev["t"])
            if t > max_ticks:
                status, error = "time_limit", "Command log exceeds the time limit"
                break
            world.advance_to(t)
            typ = ev["type"]
            if typ == "cmd_vel":
                world.cmd_vel(ev.get("lx", 0.0), ev.get("ly", 0.0), ev.get("az", 0.0))
            elif typ == "teleport_abs":
                world.teleport_absolute(ev["x"], ev["y"], ev.get("theta", 0.0))
            elif typ == "teleport_rel":
                world.teleport_relative(ev.get("linear", 0.0), ev.get("angular", 0.0))
            elif typ == "set_pen":
                world.set_pen(ev.get("r", 179), ev.get("g", 184), ev.get("b", 255), ev.get("width", 3), ev.get("off", 0))
            elif typ == "rotate_abs":
                world.rotate_absolute(ev["theta"])
            elif typ == "clear":
                world.clear()
            elif typ == "reset":
                world.reset()
            elif typ == "end":
                pass
            else:
                raise ValueError(f"Unknown command type: {typ}")
        _drain(world)
    except (KeyError, ValueError, TypeError) as e:
        status, error = "error", f"Invalid command log: {e}"
    trace = world.export_trace()
    trace.update(status=status, error=error)
    return trace


def judge(job: dict) -> dict:
    """Full judge: run/replay, then score. Output is what the backend stores."""
    task = job["task"]
    if job["kind"] == "code":
        trace = run_program(job.get("code", ""), task)
    elif job["kind"] == "teleop":
        trace = replay_commands(job.get("command_log", []), task)
    else:
        raise ValueError("kind must be 'code' or 'teleop'")
    result = score_trace(trace, task)
    rules = task.get("rules") or {}
    violation = None
    if rules.get("allow_teleport", True) is False and any(e["type"] == "teleport" for e in trace["events"]):
        violation = "Rule violation: teleport services are not allowed in this task."
    if violation:
        trace["error"] = violation
    passed = (trace["status"] == "finished" and violation is None
              and result["score"] >= float(task.get("pass_threshold", 100.0)))
    return {
        "judge_version": JUDGE_VERSION,
        "status": "passed" if passed else ("error" if trace["status"] == "error" else "failed"),
        "violation": violation,
        "run_status": trace["status"],
        "error": trace["error"],
        "score": result["score"],
        "recall": result["recall"],
        "precision": result["precision"],
        "diff": result["diff"],
        "logs": trace["logs"][-200:],
        "sim_ticks": trace["ticks"],
        "wall_hits": trace["wall_hits"],
        "trace": trace,
    }


def _install_sandbox_audit_hook() -> None:
    """Defence in depth for the server judge: forbid network, processes, file writes, ctypes."""
    blocked_prefixes = ("socket.", "subprocess.", "os.system", "os.exec", "os.spawn", "os.fork",
                        "os.posix_spawn", "ctypes.", "os.kill", "os.remove", "os.rename",
                        "shutil.", "urllib.", "http.client", "pty.", "webbrowser.")

    def hook(event, args):
        if event.startswith(blocked_prefixes):
            raise PermissionError(f"'{event}' is not allowed in the Roboverse X judge")
        if event == "open" and len(args) > 1 and isinstance(args[1], str) and any(c in args[1] for c in "wax+"):
            raise PermissionError("Writing files is not allowed in the Roboverse X judge")

    sys.addaudithook(hook)


def main() -> None:
    job = json.loads(sys.stdin.read())
    _install_sandbox_audit_hook()
    try:
        out = judge(job)
    except Exception as e:  # noqa: BLE001
        out = {"judge_version": JUDGE_VERSION, "status": "error", "error": f"JudgeError: {e}", "score": 0.0}
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
