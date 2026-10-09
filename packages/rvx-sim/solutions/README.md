# Level 2 reference solutions (organisers only — do not ship to participants)

Real ROS 2 `rclpy` nodes. They run unchanged in the Roboverse X arena (browser and judge) and on a real
ROS 2 turtlesim. Each one passes its task's auto-evaluation with a 100.00 % shape match
(`pytest packages/rvx-sim/tests/test_level2.py`).

| Task | File | Approach |
| --- | --- | --- |
| PS1 · Task 1 — Reach the Goal (9.0, 9.0), stop ≤ 0.1 | `task1_reach_goal.py` | P-controller on `/turtle1/pose`: rotate, then drive; zero Twist + "Goal reached" at < 0.03 |
| PS1 · Task 2 — Dodge the Guards | `task2_dodge_guards.py` | `/spawn` obstacle1–3, read `/obstacleN/pose`, A* on a 0.1 grid (guards inflated to 1.35), line-of-sight shortcut, waypoint follower. Closest approach 1.30 |
| PS2 · Task 3 — Basic Shapes | `task3_basic_shapes.py` | one Twist = exactly 1 s, so `drive(L, 0)` moves L and `drive(0, a)` turns a; circle = `drive(2πr, 2π)`; pen up + teleport between shapes |
| PS2 · Task 4 · Card 1 — Star | `task4_card1_star.py` | 5 × (edge 3.5, turn −144°), one stroke |
| PS2 · Task 4 · Card 2 — House | `task4_card2_house.py` | body, roof (3 × 120°), door, window |
| PS2 · Task 4 · Card 3 — Flower | `task4_card3_flower.py` | stem, then 6 full circles r 1.0 |
| PS2 · Task 4 · Card 4 — Spiral | `task4_card4_spiral.py` | Archimedean r = bφ (b = 2.3/6π), steered point-by-point from every `/turtle1/pose` message |

Task geometry (all coordinates, sizes, start poses): `packages/rvx-sim/tools/level2_tasks.py`
→ regenerates `apps/web/src/rvx-runtime/tasks.data.json`. Evaluation rules:
`packages/rvx-sim/tools/level2_eval.py` (Python) and `apps/web/src/rvx-runtime/tasks.ts` (browser).
