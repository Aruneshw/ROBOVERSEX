/**
 * Turtlesim viewport controller.
 *  - "live" mode: a TurtleWorld stepped at 100 Hz in real time (ros2 CLI / teleop from the terminal).
 *  - "program" mode: plays the stream coming from the Python worker in real time (1x by default),
 *    while the worker is still computing — the turtle moves and logs print as they happen.
 * One requestAnimationFrame loop renders both.
 */
import { CENTER, DT, TurtleWorld, wrapAngle, type Segment } from "@/sim/engine";
import { CANVAS_PX, InkLayer, PX_PER_M, drawTurtle, toPx } from "@/sim/renderer";
import type { Target } from "@/sim/score";
import type { RunChunk, WorkerRunResult } from "./python-runtime";

export type Pose2D = { x: number; y: number; theta: number };
export type Goal = { x: number; y: number; tolerance?: number };
export type LogLine = { tick: number; level: string; msg: string };
export type SimMode = "live" | "program";
export type Speed = number | "instant";

export type SimSnapshot = {
  mode: SimMode;
  playing: boolean;
  pose: Pose2D;
  linear: number;
  angular: number;
  simTime: number;
  wallHits: number;
};

type Playback = {
  poses: number[];
  segments: Segment[];
  clears: [number, number][];
  logs: LogLine[];
  logIdx: number;
  clearIdx: number;
  wallHits: number;
  playTick: number;
  done: boolean;
  totalTicks: number;
  onLog: (l: LogLine) => void;
  onEnd: () => void;
  ended: boolean;
};

const BG = "rgb(69,86,255)";

export class SimController {
  start: Pose2D = { x: CENTER, y: CENTER, theta: 0 };
  target: Target | null = null;
  goal: Goal | null = null;
  showGhost = true;
  showGrid = false;
  showGoalLine = true;
  diff: { missed: [number, number][]; extra: [number, number][] } | null = null;
  /** diff of the last program run against `target` (set diff = lastPreviewDiff to show it) */
  lastPreviewDiff: { missed: [number, number][]; extra: [number, number][] } | null = null;
  speed: Speed = 1;

  mode: SimMode = "live";
  world: TurtleWorld = new TurtleWorld([CENTER, CENTER, 0]);
  private pb: Playback | null = null;
  private ink: InkLayer | null = null;
  private lastClears = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private lastNow = 0;
  private acc = 0;
  private liveTickCbs = new Set<(w: TurtleWorld) => void>();
  private frameCbs = new Set<(s: SimSnapshot) => void>();
  private snap: SimSnapshot = { mode: "live", playing: false, pose: { ...this.start }, linear: 0, angular: 0, simTime: 0, wallHits: 0 };
  onWorldLog?: (l: LogLine) => void;

  // ------------------------------------------------------------ setup
  configure(o: { start?: Pose2D; target?: Target | null; goal?: Goal | null }) {
    if (o.target !== undefined) this.target = o.target;
    if (o.goal !== undefined) this.goal = o.goal;
    const start = o.start ?? (o.target ? o.target.start_pose : undefined);
    if (start) this.start = { ...start };
    this.reset();
  }

  attach(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = canvas.height = CANVAS_PX * dpr;
    this.ctx = canvas.getContext("2d");
    if (!this.ink) this.ink = new InkLayer(dpr);
    this.resync();
    this.startLoop();
    return () => {
      if (this.canvas === canvas) {
        this.canvas = null;
        this.ctx = null;
      }
    };
  }

  /** Fresh live world at the start pose (ink, diff and playback cleared). */
  reset() {
    this.pb = null;
    this.mode = "live";
    this.world = new TurtleWorld([this.start.x, this.start.y, this.start.theta]);
    this.world.onLog = (msg, level) => this.onWorldLog?.({ tick: this.world.tick, level, msg });
    this.lastClears = 0;
    this.diff = null;
    this.ink?.wipe(0);
    this.update(this.world.x, this.world.y, this.world.theta, 0, 0, 0, 0);
  }

  /** Make sure ros2 CLI commands drive a live world (a finished program's drawing is reset). */
  ensureLive(): boolean {
    if (this.mode === "live") return false;
    this.reset();
    return true;
  }

  onLiveTick(cb: (w: TurtleWorld) => void) { this.liveTickCbs.add(cb); return () => this.liveTickCbs.delete(cb); }
  onFrame(cb: (s: SimSnapshot) => void) { this.frameCbs.add(cb); return () => this.frameCbs.delete(cb); }
  snapshot(): SimSnapshot { return this.snap; }

  // ------------------------------------------------------------ program playback (streaming)
  beginProgram(onLog: (l: LogLine) => void, onEnd: () => void) {
    this.reset();
    this.mode = "program";
    this.pb = {
      poses: [], segments: [], clears: [], logs: [], logIdx: 0, clearIdx: 0, wallHits: 0,
      playTick: 0, done: false, totalTicks: 0, onLog, onEnd, ended: false,
    };
    this.startLoop();
  }
  pushChunk(c: RunChunk) {
    const pb = this.pb;
    if (!pb) return;
    for (const v of c.poses) pb.poses.push(v);
    for (const s of c.segments) pb.segments.push(s);
    for (const cl of c.clears) pb.clears.push(cl);
    for (const l of c.logs) pb.logs.push(l);
    pb.wallHits = c.wall_hits;
  }
  endProgram(r: WorkerRunResult | null) {
    const pb = this.pb;
    if (!pb) return;
    pb.done = true;
    pb.totalTicks = r ? r.ticks : Math.max(0, pb.poses.length / 3 - 1);
    this.lastPreviewDiff = r?.preview?.diff ?? null;
  }
  /** Stop playback immediately (Ctrl+C). Keeps what was drawn so far. */
  abortProgram() {
    const pb = this.pb;
    if (!pb || pb.ended) return;
    pb.ended = true;
    pb.done = true;
    pb.totalTicks = Math.floor(pb.playTick);
  }
  get playing(): boolean { return !!this.pb && !this.pb.ended; }
  get commandLog() { return this.world.commandLog; }

  // ------------------------------------------------------------ frame loop
  /** The loop keeps running without a canvas so playback/teleop timing never depends on the viewport. */
  startLoop() {
    if (this.raf || typeof requestAnimationFrame === "undefined") return;
    this.lastNow = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(250, now - this.lastNow);
      this.lastNow = now;
      if (this.mode === "live") this.stepLive(dt);
      else this.stepProgram(dt);
      this.render();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stepLive(dtMs: number) {
    const w = this.world;
    this.acc += dtMs;
    let n = 0;
    while (this.acc >= DT * 1000 && n < 25) {
      w.step();
      for (const cb of this.liveTickCbs) cb(w);
      this.acc -= DT * 1000;
      n++;
    }
    if (n === 25) this.acc = 0;
    if (this.ink) {
      if (w.clears.length !== this.lastClears) {
        this.lastClears = w.clears.length;
        this.ink.wipe(w.clears[w.clears.length - 1][1]);
      }
      this.ink.sync(w.segments);
    }
    const p = w.pose();
    this.update(w.x, w.y, w.theta, p.linear_velocity, p.angular_velocity, w.tick * DT, w.wallHits);
  }

  private stepProgram(dtMs: number) {
    const pb = this.pb;
    if (!pb) return;
    const available = pb.poses.length / 3 - 1;
    if (available < 0) {
      if (pb.done && !pb.ended) {
        while (pb.logIdx < pb.logs.length) pb.onLog(pb.logs[pb.logIdx++]);
        pb.ended = true;
        pb.onEnd();
      }
      return;
    }
    if (!pb.ended) {
      const limit = pb.done ? pb.totalTicks : available;
      pb.playTick = this.speed === "instant" ? limit : Math.min(limit, pb.playTick + (dtMs / 1000 / DT) * this.speed);
    }
    const t = Math.min(Math.floor(pb.playTick), available);
    while (pb.clearIdx < pb.clears.length && pb.clears[pb.clearIdx][0] <= t) this.ink?.wipe(pb.clears[pb.clearIdx++][1]);
    this.ink?.sync(pb.segments, t);
    while (pb.logIdx < pb.logs.length && pb.logs[pb.logIdx].tick <= t) pb.onLog(pb.logs[pb.logIdx++]);
    const i = t * 3, j = Math.max(0, t - 1) * 3;
    const x = pb.poses[i], y = pb.poses[i + 1], th = pb.poses[i + 2];
    const px = pb.poses[j], py = pb.poses[j + 1], pth = pb.poses[j + 2];
    const v = t > 0 ? (Math.cos(th) * (x - px) + Math.sin(th) * (y - py)) / DT : 0;
    const w = t > 0 ? wrapAngle(th - pth) / DT : 0;
    const playing = !pb.ended;
    const still = pb.ended || Math.abs(v) < 1e-6;
    this.update(x, y, th, still ? 0 : v, pb.ended || Math.abs(w) < 1e-6 ? 0 : w, t * DT, pb.wallHits, playing);
    if (!pb.ended && pb.done && t >= pb.totalTicks) {
      while (pb.logIdx < pb.logs.length) pb.onLog(pb.logs[pb.logIdx++]);
      pb.ended = true;
      this.update(x, y, th, 0, 0, t * DT, pb.wallHits, false);
      pb.onEnd();
    }
  }

  private update(x: number, y: number, theta: number, linear: number, angular: number, simTime: number, wallHits: number, playing = false) {
    this.snap = { mode: this.mode, playing, pose: { x, y, theta }, linear, angular, simTime, wallHits };
    for (const cb of this.frameCbs) cb(this.snap);
  }

  /** Re-paint ink after a canvas (re)attach. */
  private resync() {
    if (!this.ink) return;
    this.ink.wipe(0);
    if (this.mode === "live") {
      const c = this.world.clears;
      this.lastClears = c.length;
      if (c.length) this.ink.wipe(c[c.length - 1][1]);
      this.ink.sync(this.world.segments);
    } else if (this.pb) {
      const t = Math.floor(this.pb.playTick);
      const cl = this.pb.clears.filter((c) => c[0] <= t);
      if (cl.length) this.ink.wipe(cl[cl.length - 1][1]);
      this.ink.sync(this.pb.segments, t);
    }
  }

  // ------------------------------------------------------------ drawing
  private render() {
    const ctx = this.ctx;
    if (!ctx || !this.ink) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
    if (this.showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let m = 1; m < 11; m++) {
        const p = m * PX_PER_M + 0.5;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, CANVAS_PX); ctx.moveTo(0, CANVAS_PX - p); ctx.lineTo(CANVAS_PX, CANVAS_PX - p); ctx.stroke();
      }
    }
    if (this.target && this.showGhost) {
      ctx.save();
      ctx.setLineDash([8, 7]); ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      for (const st of this.target.strokes) {
        ctx.beginPath();
        st.points.forEach(([x, y], i) => { const [px, py] = toPx(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.drawImage(this.ink.canvas, 0, 0, CANVAS_PX, CANVAS_PX);
    const { pose } = this.snap;
    if (this.goal) this.drawGoal(ctx, this.goal, pose);
    if (this.diff) {
      const dots = (pts: [number, number][], color: string) => {
        ctx.fillStyle = color;
        for (const [x, y] of pts) { const [px, py] = toPx(x, y); ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
      };
      dots(this.diff.missed, "rgba(244,63,94,0.95)");
      dots(this.diff.extra, "rgba(245,158,11,0.95)");
    }
    drawTurtle(ctx, pose.x, pose.y, pose.theta);
  }

  private drawGoal(ctx: CanvasRenderingContext2D, g: Goal, pose: Pose2D) {
    const [gx, gy] = toPx(g.x, g.y);
    if (this.showGoalLine) {
      const [tx, ty] = toPx(pose.x, pose.y);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(gx, gy); ctx.stroke();
      ctx.restore();
    }
    const r = Math.max(6, (g.tolerance ?? 0.1) * PX_PER_M);
    const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, r + 14);
    halo.addColorStop(0, "rgba(250,204,21,0.55)"); halo.addColorStop(1, "rgba(250,204,21,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(gx, gy, r + 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#facc15"; ctx.strokeStyle = "#fff7cc"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = "600 11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#fff7cc";
    ctx.fillText("GOAL", Math.min(CANVAS_PX - 18, Math.max(18, gx)), gy - r - 8 < 10 ? gy + r + 16 : gy - r - 8);
  }
}
