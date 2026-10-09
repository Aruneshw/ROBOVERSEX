"""Level 2 problem statements: every reference solution must pass its own task, starters must not."""
import json
import sys
from pathlib import Path

import pytest

import rvx_sim.arena  # noqa: F401  (enables /spawn, /kill, /<name>/pose)
from rvx_sim.runner import run_program

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packages" / "rvx-sim" / "tools"))
from level2_eval import evaluate  # noqa: E402
from level2_tasks import tasks  # noqa: E402

SOLUTIONS = ROOT / "packages" / "rvx-sim" / "solutions"
CASES = {
    "ps1-t1-reach-goal": "task1_reach_goal.py",
    "ps1-t2-dodge-guards": "task2_dodge_guards.py",
    "ps2-t3-basic-shapes": "task3_basic_shapes.py",
    "ps2-t4-star": "task4_card1_star.py",
    "ps2-t4-house": "task4_card2_house.py",
    "ps2-t4-flower": "task4_card3_flower.py",
    "ps2-t4-spiral": "task4_card4_spiral.py",
}
TASKS = {t["id"]: t for t in tasks()}


def worker_task(t):
    """Same dict the browser runtime sends to run_program (runtime.ts taskForWorker)."""
    tgt = t["target"] or {"version": 1, "start_pose": t["start"], "strokes": []}
    return {"target": {**tgt, "start_pose": t["start"]}, "max_sim_sec": t["maxSimSec"], "idle_stop_sec": 5,
            "tolerance": t["tolerance"], "pass_threshold": t["passThreshold"], "rules": t["rules"], "check_color": False}


def test_json_is_up_to_date():
    data = json.loads((ROOT / "apps/web/src/rvx-runtime/tasks.data.json").read_text())
    assert data == json.loads(json.dumps(tasks())), "run: python packages/rvx-sim/tools/level2_tasks.py"


@pytest.mark.parametrize("task_id", list(CASES))
def test_reference_solution_passes(task_id):
    t = TASKS[task_id]
    code = (SOLUTIONS / CASES[task_id]).read_text()
    wt = worker_task(t)
    trace = run_program(code, wt)
    res = evaluate({**t, **{"target": wt["target"]}}, trace, code)
    assert trace["status"] == "finished", trace["error"]
    assert res["passed"], res["checks"]


@pytest.mark.parametrize("task_id", list(CASES))
def test_starter_code_does_not_pass(task_id):
    t = TASKS[task_id]
    wt = worker_task(t)
    trace = run_program(t["starterCode"], wt)
    assert not evaluate({**t, **{"target": wt["target"]}}, trace, t["starterCode"])["passed"]


def test_cutting_through_a_guard_fails():
    t = TASKS["ps1-t2-dodge-guards"]
    code = (SOLUTIONS / "task1_reach_goal.py").read_text().replace(
        "self.timer = self.create_timer(0.02, self.control)",
        "self.timer = self.create_timer(0.02, self.control)\n"
        "        from turtlesim.srv import Spawn\n"
        "        c = self.create_client(Spawn, '/spawn')\n"
        "        for n, x, y in [('obstacle1', 7.0, 7.0), ('obstacle2', 3.5, 8.0), ('obstacle3', 8.5, 4.0)]:\n"
        "            c.call(Spawn.Request(x=x, y=y, theta=0.0, name=n))")
    trace = run_program(code, worker_task(t))
    res = evaluate(t, trace, code)
    by = {c["id"]: c for c in res["checks"]}
    assert by["guards_spawned"]["ok"] and by["goal_reached"]["ok"]
    assert not by["guard_clearance"]["ok"] and not res["passed"]
