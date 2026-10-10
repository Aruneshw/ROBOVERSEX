"""Task 5 · Extreme Geometry — reference solutions pass; every typical mistake is caught by the right check.

Covers: geometric accuracy, dimensions, path continuity, completion time, speed, boundary violations,
colour (3D shading), source-size limit, and target isolation (participant code cannot read the target).
"""
import json
import sys
from pathlib import Path

import pytest

import rvx_sim.arena  # noqa: F401
from rvx_sim.runner import run_program

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packages" / "rvx-sim" / "tools"))
from extreme_tasks import tasks  # noqa: E402
from level2_eval import evaluate  # noqa: E402

SOL = ROOT / "packages" / "rvx-sim" / "solutions"
T = {t["card"]: t for t in tasks()}
FILES = {1: "extreme_a_dragon.py", 2: "extreme_b_sierpinski.py", 3: "extreme_c_knot.py"}


def run(card, code, strip_target=True):
    t = T[card]
    target = dict(t["target"])
    if strip_target:                       # exactly what the browser worker does
        target["strokes"] = []
    trace = run_program(code, {"target": target, "max_sim_sec": t["maxSimSec"], "idle_stop_sec": 5,
                               "tolerance": t["tolerance"], "rules": t["rules"], "check_color": t["checkColor"]})
    res = evaluate(t, trace, code)
    return res, {c["id"].split(":")[0]: c for c in res["checks"]}


def src(card):
    return (SOL / FILES[card]).read_text()


def test_json_is_up_to_date():
    data = json.loads((ROOT / "apps/web/src/rvx-runtime/tasks.extreme.json").read_text())
    assert data == json.loads(json.dumps(tasks())), "run: python packages/rvx-sim/tools/extreme_tasks.py"


@pytest.mark.parametrize("card", [1, 2, 3])
def test_reference_solution_scores_full_marks(card):
    res, by = run(card, src(card))
    assert res["passed"], res["checks"]
    assert res["score"] == 100.0
    assert res["rubric"]["auto"] == 95.0


@pytest.mark.parametrize("card", [1, 2, 3])
def test_starter_fails(card):
    res, _ = run(card, T[card]["starterCode"])
    assert not res["passed"]
    assert res["rubric"]["auto"] < 30


def test_dragon_mirrored_turns_fail_geometry():
    code = src(1).replace("(1 if (((k & -k) << 1) & k) == 0 else -1)", "(-1 if (((k & -k) << 1) & k) == 0 else 1)")
    res, by = run(1, code)
    assert not by["shape_match"]["ok"] and not res["passed"]


def test_dragon_wrong_scale_fails_dimensions():
    res, by = run(1, src(1).replace("SIZE = 9.0", "SIZE = 8.6"))
    assert not by["bbox"]["ok"] and not res["passed"]
    assert res["rubric"]["items"][1]["points"] < 20


def test_dragon_too_big_hits_the_wall():
    res, by = run(1, src(1).replace("SIZE = 9.0", "SIZE = 12.5"))
    assert not by["no_wall_hits"]["ok"]


def test_dragon_pen_lift_breaks_continuity():
    code = src(1).replace(
        "        self.cmd.publish(msg)\n        self.i += 1\n",
        "        if self.i in (3000, 3010):\n"
        "            self.create_client(SetPen, '/turtle1/set_pen').call(SetPen.Request(r=255, g=120, b=90, width=3, off=int(self.i == 3000)))\n"
        "        self.cmd.publish(msg)\n        self.i += 1\n")
    res, by = run(1, code)
    assert not by["one_stroke"]["ok"] and not res["passed"]


def test_sierpinski_retracing_everything_runs_out_of_time():
    # draw the Euler circuit and then walk it back again: correct ink, double the time
    code = src(2).replace("walk = euler_walk(DEPTH, (0, 0), (n, 0), (0, n))",
                          "walk = euler_walk(DEPTH, (0, 0), (n, 0), (0, n))\n        walk = walk + walk[::-1][1:]")
    res, by = run(2, code)
    assert not by["within_time"]["ok"] and not res["passed"]


def test_sierpinski_too_fast_breaks_speed_limit():
    res, by = run(2, src(2).replace("MAX_STEP = 0.0595", "MAX_STEP = 0.075"))
    assert not by["max_speed"]["ok"] and not res["passed"]


def test_sierpinski_depth_5_misses_edges():
    res, by = run(2, src(2).replace("DEPTH = 6", "DEPTH = 5"))
    assert not by["shape_match"]["ok"]


def test_knot_without_depth_colours_fails():
    code = src(3).replace("c = self.colours[self.i]", "c = OVER")
    res, by = run(3, code)
    assert not by["shape_match"]["ok"] and not res["passed"]


def test_knot_uniform_scaling_fails_dimensions():
    code = src(3).replace("kx, ky = W / (max(xs) - min(xs)), H / (max(ys) - min(ys))",
                          "kx = ky = W / (max(xs) - min(xs))")
    res, by = run(3, code)
    assert not by["bbox"]["ok"] and not res["passed"]


def test_pasted_coordinates_exceed_source_limit():
    code = src(3) + "\n# " + "1.23456," * 1600
    res, by = run(3, code)
    assert not by["code_size"]["ok"] and not res["passed"]


def test_participant_code_cannot_read_the_target():
    spy = (
        "import sys\nfound = 0\nf = sys._getframe()\n"
        "while f is not None:\n"
        "    for v in list(f.f_locals.values()):\n"
        "        if isinstance(v, dict) and (v.get('target') or {}).get('strokes'):\n"
        "            found += 1\n"
        "    f = f.f_back\n"
        "print('LEAK' if found else 'SAFE')\n"
    )
    trace = run_program(spy, _stripped_task(1))       # no frame on the stack holds the full target
    assert any(l["msg"] == "SAFE" for l in trace["logs"]), trace["logs"]


def _stripped_task(card):
    t = json.loads(json.dumps(T[card]))
    return {"target": {**t["target"], "strokes": []}, "max_sim_sec": 5, "idle_stop_sec": 1}
