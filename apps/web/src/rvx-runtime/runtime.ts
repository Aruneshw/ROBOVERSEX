/**
 * RVX runtime — one singleton that wires Python (Pyodide worker), the turtlesim viewport and the shell.
 *
 *   rvx.configure({ fileName: "main.py", getCode: () => editorValue, task: { goal: { x: 11, y: 11, tolerance: 0.1 } } })
 *   rvx.run()      // types `python3 main.py` into the terminal and runs it (real-time output + motion)
 *   rvx.stop()     // Ctrl+C
 *   rvx.reset()    // fresh turtlesim
 *   const s = useRvx()   // live pose / velocity / distance / status for your UI
 */
import { useSyncExternalStore } from "react";
import { CENTER } from "@/sim/engine";
import type { ScoreResult, Target } from "@/sim/score";
import { PythonRuntime, type BootInfo, type WorkerRunResult } from "./python-runtime";
import { SimController, type Goal, type Pose2D, type SimMode, type SimSnapshot, type Speed } from "./sim-controller";
import { RvxShell } from "./shell";
import type { Terminal } from "@xterm/xterm";

export type RvxTask = {
  start?: Pose2D;
  target?: Target | null;
  goal?: Goal | null;
  maxSimSec?: number;
  idleStopSec?: number;
  tolerance?: number;
  passThreshold?: number;
  rules?: { allow_teleport?: boolean };
  checkColor?: boolean;
};

export type RvxConfig = {
  user: string;
  host: string;
  fileName: string;
  getCode: () => string;
  task: RvxTask;
  /** wheels for `pip install` / imports; null = jsDelivr CDN matching the installed Pyodide */
  packageBaseUrl: string | null;
  workerUrl: string;
  pyodideBase: string;
  simBase: string;
  /** kill a program that produces nothing (no sim progress, no output) for this long */
  runTimeoutMs: number;
  /** sim ticks per streamed chunk (10 = every 0.1 s of sim time) */
  chunkTicks: number;
};

export type Activity = "idle" | "booting" | "installing" | "running" | "repl" | "teleop" | "publishing" | "echo";
export type RuntimeStatus = "offline" | "booting" | "ready" | "error";

export type RunOutcome = {
  command: string;
  status: "finished" | "time_limit" | "error" | "stopped" | "timeout" | "crashed";
  error: string | null;
  ticks: number;
  simTime: number;
  wallHits: number;
  teleported: boolean;
  preview: ScoreResult | null;
  finalPose: Pose2D;
  distance: number | null;
  goalReached: boolean | null;
  at: number;
};

export type RvxState = {
  runtime: RuntimeStatus;
  activity: Activity;
  python: string | null;
  pyodide: string | null;
  mode: SimMode;
  playing: boolean;
  pose: Pose2D;
  linear: number;
  angular: number;
  simTime: number;
  wallHits: number;
  goal: Goal | null;
  distance: number | null;
  /** within goal tolerance and stopped */
  goalReached: boolean;
  lastRun: RunOutcome | null;
};

const DEFAULTS: RvxConfig = {
  user: "user",
  host: "roboverse-x",
  fileName: "main.py",
  getCode: () => "",
  task: {},
  packageBaseUrl: null,
  workerUrl: "/rvx/python-worker.mjs",
  pyodideBase: "/pyodide/",
  simBase: "/py/rvx_sim/",
  runTimeoutMs: 8000,
  chunkTicks: 10,
};

export class RvxRuntime {
  config: RvxConfig = { ...DEFAULTS };
  readonly sim = new SimController();
  py: PythonRuntime;
  readonly shell: RvxShell;
  private state: RvxState;
  private listeners = new Set<() => void>();
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.py = this.makePy();
    this.shell = new RvxShell(this);
    this.state = {
      runtime: "offline", activity: "booting", python: null, pyodide: null, mode: "live", playing: false,
      pose: { x: CENTER, y: CENTER, theta: 0 }, linear: 0, angular: 0, simTime: 0, wallHits: 0,
      goal: null, distance: null, goalReached: false, lastRun: null,
    };
    this.sim.onFrame((s) => this.onSimFrame(s));
    this.sim.onWorldLog = (l) => {
      if (this.sim.mode === "live") this.shell.out(`\x1b[33m[WARN] [${(Date.now() / 1000).toFixed(9)}] [turtlesim]: ${l.msg}\x1b[0m\n`);
    };
  }

  private makePy() {
    return new PythonRuntime({
      workerUrl: this.config.workerUrl,
      indexURL: this.config.pyodideBase,
      simBase: this.config.simBase,
      packageBaseUrl: this.config.packageBaseUrl,
      runTimeoutMs: this.config.runTimeoutMs,
    });
  }

  // ------------------------------------------------------------ public API
  configure(c: Partial<RvxConfig>) {
    const taskChanged = c.task !== undefined && c.task !== this.config.task;
    this.config = { ...this.config, ...c };
    Object.assign(this.py.opts, {
      workerUrl: this.config.workerUrl, indexURL: this.config.pyodideBase, simBase: this.config.simBase,
      packageBaseUrl: this.config.packageBaseUrl, runTimeoutMs: this.config.runTimeoutMs,
    });
    if (taskChanged) {
      const t = this.config.task;
      this.sim.configure({ start: t.start, target: t.target ?? null, goal: t.goal ?? null });
      this.patch({ goal: t.goal ?? null });
    }
  }

  attachTerminal(term: Terminal): () => void { return this.shell.attach(term); }
  attachCanvas(canvas: HTMLCanvasElement): () => void { return this.sim.attach(canvas); }

  /** RUN button: types the run command into the terminal (exactly like the user would). */
  run(command?: string) {
    if (this.shell.isBusy) this.shell.stop();
    this.shell.typeCommand(command ?? `python3 ${this.config.fileName}`);
  }
  /** Execute any shell command as if typed. */
  exec(command: string) { this.shell.typeCommand(command); }
  stop() { this.shell.stop(); }
  reset() {
    if (this.shell.isBusy) this.shell.stop();
    this.sim.reset();
    this.patch({ lastRun: null });
  }
  clearTerminal() { this.shell.clear(); }
  /** Start Python in the background (the terminal also does this when it mounts). */
  warmup() { void this.py.boot().catch(() => {}); }
  setSpeed(s: Speed) { this.sim.speed = s; }
  setView(v: { ghost?: boolean; grid?: boolean; goalLine?: boolean; diff?: boolean }) {
    if (v.ghost !== undefined) this.sim.showGhost = v.ghost;
    if (v.grid !== undefined) this.sim.showGrid = v.grid;
    if (v.goalLine !== undefined) this.sim.showGoalLine = v.goalLine;
    if (v.diff !== undefined) this.sim.diff = v.diff ? this.sim.lastPreviewDiff : null;
  }
  /** Level-1 command log recorded from ros2 CLI / teleop in the live world (server replays it). */
  getCommandLog() { return this.sim.commandLog.slice(); }

  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  getState = () => this.state;

  // ------------------------------------------------------------ used by the shell
  setActivity(a: Activity) { this.patch({ activity: a }, true); }
  setRuntime(r: RuntimeStatus, info?: BootInfo) {
    this.patch({ runtime: r, python: info?.python ?? this.state.python, pyodide: info?.pyodide ?? this.state.pyodide }, true);
  }
  taskForWorker() {
    const t = this.config.task;
    const start = t.start ?? t.target?.start_pose ?? { x: CENTER, y: CENTER, theta: 0 };
    return {
      target: { version: 1, start_pose: start, strokes: t.target?.strokes ?? [] },
      max_sim_sec: t.maxSimSec ?? 300,
      idle_stop_sec: t.idleStopSec ?? 5,
      tolerance: t.tolerance ?? t.target?.tolerance ?? 0.12,
      pass_threshold: t.passThreshold ?? 100,
      rules: t.rules ?? {},
      check_color: !!t.checkColor,
    };
  }
  reportRun(command: string, status: RunOutcome["status"], error: string | null, r: WorkerRunResult | null) {
    const s = this.sim.snapshot();
    const g = this.config.task.goal ?? null;
    const distance = g ? Math.hypot(s.pose.x - g.x, s.pose.y - g.y) : null;
    const outcome: RunOutcome = {
      command, status, error,
      ticks: r?.ticks ?? Math.round(s.simTime * 100), simTime: s.simTime, wallHits: r?.wall_hits ?? s.wallHits,
      teleported: r?.teleported ?? false, preview: r?.preview ?? null, finalPose: { ...s.pose },
      distance, goalReached: g && distance !== null ? distance <= (g.tolerance ?? 0.1) : null, at: Date.now(),
    };
    this.patch({ lastRun: outcome }, true);
  }

  // ------------------------------------------------------------ state
  private onSimFrame(s: SimSnapshot) {
    const g = this.config.task.goal ?? null;
    const distance = g ? Math.hypot(s.pose.x - g.x, s.pose.y - g.y) : null;
    const goalReached = !!g && distance !== null && distance <= (g.tolerance ?? 0.1) && s.linear === 0 && s.angular === 0;
    this.patch({
      mode: s.mode, playing: s.playing, pose: s.pose, linear: s.linear, angular: s.angular,
      simTime: s.simTime, wallHits: s.wallHits, goal: g, distance, goalReached,
    });
  }
  private patch(p: Partial<RvxState>, now = false) {
    this.state = { ...this.state, ...p };
    const t = performance.now();
    if (now || t - this.lastEmit > 66) { this.flush(); return; }
    this.emitTimer ??= setTimeout(() => this.flush(), 70);
  }
  private flush() {
    if (this.emitTimer) { clearTimeout(this.emitTimer); this.emitTimer = null; }
    this.lastEmit = performance.now();
    for (const cb of this.listeners) cb();
  }
}

/** The single runtime instance used by <RvxTerminal/>, <RvxSimulator/> and your buttons. */
export const rvx = new RvxRuntime();

const serverState = rvx.getState();
/** Live runtime state (re-renders ~15×/s while the turtle moves). */
export function useRvx(): RvxState {
  return useSyncExternalStore(rvx.subscribe, rvx.getState, () => serverState);
}
