# Task 5 · Extreme Geometry — INSTRUCTOR ONLY

> Do not publish this file, `extreme_*.py`, or `packages/rvx-sim/solutions/` to participants.
> If the GitHub repository is public, move `solutions/` to a private repository before the event.

Participant brief: `docs/challenges/EXTREME_PARTICIPANT.md` (generated). Reference images: `docs/challenges/extreme_*.svg`.
Single source of truth: `packages/rvx-sim/tools/extreme_tasks.py` → `apps/web/src/rvx-runtime/tasks.extreme.json`.

## Common limits (all automatic)

| Limit | Value | Why it is hard |
|---|---|---|
| Scoring tolerance | ±0.03 units (≈ 1.35 px) | open-loop "drive for 1 s" timing drifts far beyond this |
| Linear speed | ≤ 6.0 units/s at every 10 ms step | forces many small, precise steps; rules out one-tick jumps |
| Teleport | forbidden | the path must be driven |
| Pen | down for the whole drawing (one stroke) | Sierpinski needs an Euler circuit to fit the time limit |
| Source size | ≤ 12,000 characters | the targets need ≥ 38 k characters as literals → must be generated |
| Time | A 110 s · B 90 s · C 40 s (simulated) | reference runs: 81.9 s · 65.6 s · 24.0 s |

## Private solution specifications

**Common motion technique (all three).** Densify the path into waypoints ≤ 0.0595 apart (corners kept exact). Subscribe to
`/turtle1/pose` and, in every pose callback, publish `angular.z = wrap(atan2(Δy, Δx) − θ)/0.01` and `linear.x = |Δ|/0.01`.
The sim rotates and then moves in the next 10 ms step, so the turtle lands exactly on each waypoint. Timers fire *before* the
pose callback in the same step, so timer-based control reads a pose that is one step old and drifts. That is a common trap.

**A · Dragon.** Paper-folding sequence: turn k is left iff `((k & -k) << 1) & k == 0`. Walk the unit grid (4097 vertices,
bbox 95 × 63), scale by 9/95 → segment 0.0947368, centre the bbox. Two steps per segment → 8192 steps = 81.9 s.
Typical failures: mirrored rule (wrong orientation), scaling by the wrong axis, rounding the segment length, recursion
depth or stack errors when generated recursively, drifting from open-loop timed Twists.

**B · Sierpinski.** All 2187 edges (length 0.140625, total 307.55) have to be drawn. Every vertex has even degree, so an
**Euler circuit** exists. Build it on an integer lattice by splicing closed walks:
`T(P,Q,R) = T(P,mPQ,mPR) ⊕[at mPQ] (T(mPQ,Q,mQR) ⊕[at mQR] T(mQR,R,mPR))`. Three steps per edge → 6561 steps = 65.6 s.
Naive recursive drawing with retracing needs ≈ 1.5–2× the length, which is over 90 s. Using depth 5 fails the shape match;
pen-up repositioning fails "one stroke".

**C · Torus knot.** `x = (2+cos7t)cos3t, y = (2+cos7t)sin3t, z = sin7t`, tₖ = 2πk/2400, normalise **x and y separately**
(9.0 × 7.0). Segment colour by z at t = 2π(k+½)/2400: gold (255,214,64) if ≥ 0, else navy (25,32,105). Colour is part of the
shape match. One step per segment (all < 0.06) → 24.0 s. Typical failures: uniform scaling (proportions), colour by the
start sample instead of the mid-parameter, opening the pen to change colour (breaks the stroke).

Reference implementations: `extreme_a_dragon.py`, `extreme_b_sierpinski.py`, `extreme_c_knot.py`. Each scores 100.00% and
95/95 automatic points.

## Hidden evaluation rubric (100 points)

| Area | Points | Automatic formula |
|---|---|---|
| Geometric similarity | 35 | 35 × shape-match % / 100 (recall/precision within ±0.03; colour for C) |
| Dimensions & proportions | 20 | 20 × max(0, 1 − e/0.5), e = worst of Δwidth, Δheight, Δcentre x, Δcentre y |
| Path continuity & completeness | 15 | 10 × recall + 5 if exactly one stroke |
| Movement precision | 15 | 5 speed ≤ 6.0 + 5 no wall contact + 5 × precision |
| Completion & stopping | 10 | 5 if recall ≥ 0.99 + 5 if finished at rest within the time limit |
| Code organisation & reliability | 5 | **judge**: generated (not hard-coded) path, clear structure, closed-loop control, no fragile sleeps |

Pass gate (unlocks SUBMIT): every automatic check is green. Rank by rubric total, then by simulated completion time.

## Test cases (`pytest packages/rvx-sim/tests/test_extreme.py`)

| Case | Expected |
|---|---|
| Each reference solution | pass, 100.00%, 95/95 |
| Starter template | fail, < 30 points |
| Dragon with mirrored turn rule | shape match fails |
| Dragon scaled to 8.6 | dimensions fail |
| Dragon scaled to 12.5 | wall contact |
| Dragon with a pen lift mid-way | one stroke fails |
| Sierpinski retracing the whole circuit | time limit fails |
| Sierpinski at 7.5 units/s | speed limit fails |
| Sierpinski depth 5 | shape match fails |
| Knot in one colour | shape match (colour) fails |
| Knot with uniform scaling | dimensions fail |
| Knot with pasted coordinates (> 12 k chars) | source limit fails |
| Participant code walking the call stack for the target | finds nothing (target is stripped before the run) |

## Integrity notes

- The browser worker runs participant code **without** the target strokes. The target is only used for scoring afterwards.
- The target geometry still ships to the browser (ghost preview, target image), so a determined participant could read it in
  DevTools. The 12,000-character limit makes pasting it infeasible, and the judge's 5 code points cover "generated, not
  copied". For prize-level fairness, re-judge finalists on the server (same `level2_eval.py`) and review their code.
