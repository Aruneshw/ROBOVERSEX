# RVX Runtime — drop-in terminal + Python + turtlesim

A real-time Linux-style terminal (xterm.js), Python 3.14 (Pyodide in a module worker) and a live turtlesim
viewport, wired together. Your existing UI keeps its layout; you only mount two components and call `rvx.*`.

## Files (copy exactly these)

| File | What it is |
| --- | --- |
| `public/rvx/python-worker.mjs` | Pyodide **ES-module** worker. Static file, never bundled. |
| `src/rvx-runtime/python-runtime.ts` | Worker client: boot, run, pip, REPL, watchdog, Ctrl+C. |
| `src/rvx-runtime/sim-controller.ts` | Canvas: 100 Hz live world + real-time streaming playback, goal marker. |
| `src/rvx-runtime/shell.ts` | Bash-like shell: line editing, history, Tab, pip progress bars, ros2 CLI, teleop. |
| `src/rvx-runtime/runtime.ts` | `rvx` singleton + `useRvx()` hook. |
| `src/rvx-runtime/RvxTerminal.tsx` | `<RvxTerminal />` (fills its parent). |
| `src/rvx-runtime/RvxSimulator.tsx` | `<RvxSimulator />` (fills its parent, square canvas centred). |
| `src/rvx-runtime/index.ts` | Barrel export. |
| `src/app/rvx-demo/page.tsx` | Working reference page (`/rvx-demo`). Optional. |

The runtime needs these files, which already exist in this repo:

- `src/sim/engine.ts`, `src/sim/renderer.ts`, `src/sim/score.ts`, `src/sim/cli.ts`
- `scripts/copy-pyodide.mjs` (runs on `predev`/`prebuild`; fills `public/pyodide/` and `public/py/rvx_sim/`)
- npm packages: `pyodide`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`

## Wiring (3 steps)

```tsx
"use client";
import { useEffect, useRef } from "react";
import { RvxSimulator, RvxTerminal, rvx, useRvx } from "@/rvx-runtime";

const code = useRef(editorValue); code.current = editorValue;          // your Monaco value

useEffect(() => {
  rvx.configure({
    user: "arunesh", host: "roboverse-x", fileName: "main.py",
    getCode: () => code.current,
    task: { goal: { x: 11.0, y: 11.0, tolerance: 0.1 } },            // or { target, start } for drawing tasks
  });
}, []);

<div className="h-full"><RvxSimulator /></div>                         // inside "Turtlesim Simulation" panel
<div className="h-full"><RvxTerminal /></div>                          // inside "OUTPUT" panel

<button onClick={() => rvx.run()}>RUN CODE</button>                    // types `python3 main.py` + runs
<button onClick={() => rvx.stop()}>STOP</button>                       // Ctrl+C
<button onClick={() => rvx.reset()}>RESET</button>                     // fresh turtlesim
<button onClick={() => rvx.clearTerminal()}>Clear</button>
```

Simulation Info panel / auto-evaluation:

```tsx
const s = useRvx();
s.pose.x, s.pose.y, s.pose.theta, s.linear, s.angular, s.simTime
s.goal, s.distance, s.goalReached          // goalReached = inside tolerance AND stopped
s.runtime   // "offline" | "booting" | "ready" | "error"
s.activity  // "idle" | "booting" | "installing" | "running" | "repl" | "teleop" | "publishing" | "echo"
s.lastRun   // { status, error, finalPose, distance, goalReached, preview, wallHits, teleported, simTime }
```

Other calls: `rvx.exec("pip install numpy")`, `rvx.setSpeed(1 | 2 | 4 | "instant")`,
`rvx.setView({ grid, ghost, goalLine, diff })`, `rvx.getCommandLog()` (Level-1 log from ros2 CLI/teleop).

## What the terminal does

- It boots like a machine: kernel-style log, **real** download bars for `python_stdlib.zip` and `pyodide.asm.wasm`, then the MOTD and prompt.
- `python3 main.py`, `ros2 run my_package <anything>`: runs the editor code. Output is ROS-formatted
  (`[INFO] [epoch.ns] [node]: msg`) and printed at the moment it happens in sim time, while the turtle moves.
  `time.sleep()` and timers run in real time.
- `pip install <pkg>` shows pip-style output with real per-file download progress. Pyodide packages
  (numpy, matplotlib, …) and pure-Python PyPI packages both work. `import numpy` in your code auto-installs it.
  Also: `pip list | show | uninstall | freeze`.
- `python3` (interactive REPL), `python3 -c "…"`, `python3 --version`.
- `ros2 topic list/echo/pub`, `ros2 service call`, `ros2 action send_goal`, `ros2 run turtlesim turtle_teleop_key` (arrow keys, G/B/V/C/D/E/R/T, Q).
- Shell builtins: `ls -la`, `cd`, `pwd`, `cat`, `echo`, `history`, `whoami`, `uname -a`, `date`, `ps`, `env`, `clear`, `help`, `exit`.
- Keys: ←/→, Home/End, ↑/↓ history (persisted), Tab completion, Ctrl+C, Ctrl+L, Ctrl+U/K/W, Ctrl+D. Typing while a program runs is queued (type-ahead).
- A program that never yields (`while True: pass`) is killed after 8 s and prints `Killed`. Python restarts automatically on the next run.

## Required settings

1. **Never create the worker yourself.** The error "Classic web workers are not supported" means the worker
   was created as a classic worker. The runtime creates it with `new Worker("/rvx/python-worker.mjs", { type: "module" })`.
2. `public/pyodide/` and `public/py/rvx_sim/` must exist (`npm run dev`/`build` run `copy-pyodide.mjs`).
3. Packages are fetched from `https://cdn.jsdelivr.net/pyodide/v<version>/full/`. For an offline LAN, host the
   wheels yourself and set `rvx.configure({ packageBaseUrl: "/pyodide-packages/" })`.
4. If you add a Content-Security-Policy, include:
   `worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; connect-src 'self' https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org`.

## Level 2 tasks (PS1 / PS2 from the poster)

`tasks.ts` + `tasks.data.json` define the 7 tasks: PS1 Task 1 (Reach the Goal), PS1 Task 2 (Dodge the Guards),
PS2 Task 3 (Basic Shapes), and PS2 Task 4 (Star, House, Flower or Spiral, one card per participant).

```tsx
import { TASKS, getTask, tasksFor, assignCard, rvx, useRvx } from "@/rvx-runtime";

const myTasks = tasksFor(user.id);          // [Task 1, Task 2, Task 3, this participant's Task-4 card]
rvx.setTask(task);                          // start pose, goal, guards, ghost target, auto-evaluation
setEditorValue(task.starterCode);           // starter template for the editor

const s = useRvx();
s.evaluation?.passed                        // true when every check is green
s.evaluation?.checks                        // [{ label, ok, detail }] → AUTO EVALUATION row
s.evaluation?.score                         // shape match % (Task 3/4)
s.closestGuard                              // { distance, name } live (Task 2)
```

- The task text for the left panel is `task.title`, `task.summary` and `task.descriptionMd` (render it with react-markdown).
- Task 2 unlocks when Task 1 has `evaluation.passed`. Task 4 uses `assignCard(user.id)`: the same user always gets the same card.
- `/spawn` creates static guard turtles. They are drawn as red dots with a 1.0 safe radius and publish `/<name>/pose`.
- Do not ship the reference solutions (`packages/rvx-sim/solutions/`) to the browser.

## Task flow: Submit and the next task (`useTaskFlow`)

```tsx
const [code, setCode] = useState("");                                  // bound to Monaco (onChange → setCode)
const flow = useTaskFlow({ participantId: user.teamCode, code, setCode,
  onSubmit: async (task, evaluation) => { /* optional: POST to your API; throw to keep the task open */ } });

flow.tasks          // [{ task, state: "locked" | "available" | "current" | "passed", score }] → sidebar cards
flow.select(id)     // open a task (locked tasks are ignored)
flow.current        // the task on screen (rvx.setTask is done for you; its draft or starter code goes into the editor)
flow.checks         // AUTO EVALUATION items: { label, ok, detail } (labelled even before the first run)
flow.canSubmit      // true only when the last run of THIS task passed every check AND the editor holds exactly that code
flow.submitHint     // why it is disabled: "Run your code first" / "Complete all criteria…" / "Code changed since the last run…"
flow.submit()       // records the pass and moves to the next task automatically
flow.completed, flow.total, flow.allDone
onChange={(v) => { setCode(v); flow.saveDraft(v); }}                    // every task keeps its own code
```
