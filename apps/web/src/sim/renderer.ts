/**
 * RVX turtlesim renderer — 500x500 logical canvas, identical look to ROS turtlesim
 * (blue background, lavender pen) plus a ghost target, diff overlay and HUD-friendly API.
 * Uses an offscreen ink layer so thousands of segments cost nothing per frame.
 */
import { BG_COLOR, DT, WORLD_SIZE, type Segment } from "./engine";
import type { Target } from "./score";

export const CANVAS_PX = 500;
export const PX_PER_M = 45;
export const toPx = (x: number, y: number): [number, number] => [x * PX_PER_M + 0.5, (WORLD_SIZE - y) * PX_PER_M + 0.5];

export class InkLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawn = 0; // number of segments already painted
  constructor(dpr = Math.min(2, globalThis.devicePixelRatio || 1)) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = CANVAS_PX * dpr;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }
  /** Paint only segments not painted yet (optionally only up to a tick, for playback). */
  sync(segments: Segment[], upToTick = Infinity): void {
    for (; this.drawn < segments.length; this.drawn++) {
      const s = segments[this.drawn];
      if (s[0] > upToTick) break;
      const [, x0, y0, x1, y1, r, g, b, w] = s;
      const [a, bb] = [toPx(x0, y0), toPx(x1, y1)];
      this.ctx.strokeStyle = `rgb(${r},${g},${b})`;
      this.ctx.lineWidth = w;
      this.ctx.beginPath(); this.ctx.moveTo(a[0], a[1]); this.ctx.lineTo(bb[0], bb[1]); this.ctx.stroke();
    }
  }
  /** Erase everything; painting resumes at segment index `from` (index stored with each clear). */
  wipe(from = 0): void { this.ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX); this.drawn = from; }
}

export type SceneOpts = {
  pose: { x: number; y: number; theta: number };
  ink: InkLayer;
  target?: Target | null;
  showGhost?: boolean;
  showGrid?: boolean;
  diff?: { missed: [number, number][]; extra: [number, number][] } | null;
};

/** Draw one frame onto the visible canvas (sized CANVAS_PX*dpr, CSS-scaled to fit). */
export function drawScene(ctx: CanvasRenderingContext2D, o: SceneOpts, dpr = Math.min(2, globalThis.devicePixelRatio || 1)): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = `rgb(${BG_COLOR.join(",")})`;
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

  if (o.showGrid) {
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
    for (let m = 1; m < 11; m++) {
      const p = m * PX_PER_M + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, CANVAS_PX); ctx.moveTo(0, CANVAS_PX - p); ctx.lineTo(CANVAS_PX, CANVAS_PX - p); ctx.stroke();
    }
  }
  if (o.target && o.showGhost) {
    ctx.save();
    ctx.setLineDash([8, 7]); ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    for (const st of o.target.strokes) {
      ctx.beginPath();
      st.points.forEach(([x, y], i) => { const [px, py] = toPx(x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.drawImage(o.ink.canvas, 0, 0, CANVAS_PX, CANVAS_PX);

  if (o.diff) {
    const dots = (pts: [number, number][], color: string) => {
      ctx.fillStyle = color;
      for (const [x, y] of pts) { const [px, py] = toPx(x, y); ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
    };
    dots(o.diff.missed, "rgba(244,63,94,0.95)");  // red  = target not drawn
    dots(o.diff.extra, "rgba(245,158,11,0.95)");  // amber = ink off the target
  }
  drawTurtle(ctx, o.pose.x, o.pose.y, o.pose.theta);
}

/** Original vector turtle (not the ROS distro icons). Faces +x at theta = 0. */
export function drawTurtle(ctx: CanvasRenderingContext2D, x: number, y: number, theta: number): void {
  const [px, py] = toPx(x, y);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-theta);
  ctx.fillStyle = "#1f8a5b";
  for (const [lx, ly] of [[8, 9], [8, -9], [-8, 9], [-8, -9]]) { ctx.beginPath(); ctx.ellipse(lx, ly, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-18, 2.5); ctx.lineTo(-18, -2.5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(15, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0b1630"; ctx.beginPath(); ctx.arc(17, 2, 1.1, 0, Math.PI * 2); ctx.arc(17, -2, 1.1, 0, Math.PI * 2); ctx.fill();
  const shell = ctx.createRadialGradient(-2, -3, 2, 0, 0, 14);
  shell.addColorStop(0, "#7cf2c4"); shell.addColorStop(1, "#2bb27a");
  ctx.fillStyle = shell; ctx.strokeStyle = "#0f5c3c"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 10.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(15,92,60,0.55)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; ctx.moveTo(4 * Math.cos(a), 4 * Math.sin(a)); ctx.lineTo(10.5 * Math.cos(a), 8.5 * Math.sin(a)); }
  ctx.ellipse(0, 0, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Trace produced by rvx_sim.runner.run_program / judge. */
export type Trace = {
  dt: number; ticks: number; poses: number[]; segments: Segment[]; clears: [number, number][];
  logs: { tick: number; level: string; msg: string }[]; status: string; error: string | null;
};

/** Plays a Level-2 trace back at 1x/2x/4x/instant, emitting logs in sync. */
export class TracePlayer {
  private t0 = 0; private raf = 0; private logIdx = 0; private clearIdx = 0;
  tick = 0;
  private trace: Trace;
  private ink: InkLayer;
  private onFrame: (pose: { x: number; y: number; theta: number }, tick: number) => void;
  private onLog: (l: { level: string; msg: string }) => void;
  private onDone: () => void;
  constructor(trace: Trace, ink: InkLayer,
    onFrame: (pose: { x: number; y: number; theta: number }, tick: number) => void,
    onLog: (l: { level: string; msg: string }) => void, onDone: () => void) {
    this.trace = trace; this.ink = ink; this.onFrame = onFrame; this.onLog = onLog; this.onDone = onDone;
  }
  pose(tick: number) {
    const i = Math.min(tick, this.trace.poses.length / 3 - 1) * 3;
    return { x: this.trace.poses[i], y: this.trace.poses[i + 1], theta: this.trace.poses[i + 2] };
  }
  play(speed: number | "instant" = 1): void {
    this.ink.wipe(); this.logIdx = 0; this.clearIdx = 0; this.tick = 0;
    const frame = (now: number) => {
      if (!this.t0) this.t0 = now;
      const target = speed === "instant" ? this.trace.ticks : Math.min(this.trace.ticks, Math.floor(((now - this.t0) / 1000) * speed / DT));
      this.advance(target);
      if (this.tick >= this.trace.ticks) { this.onDone(); return; }
      this.raf = requestAnimationFrame(frame);
    };
    this.t0 = 0;
    this.raf = requestAnimationFrame(frame);
  }
  private advance(target: number) {
    while (this.clearIdx < this.trace.clears.length && this.trace.clears[this.clearIdx][0] <= target) {
      this.ink.wipe(this.trace.clears[this.clearIdx++][1]); // erase; resume after the cleared segments
    }
    this.ink.sync(this.trace.segments, target);
    while (this.logIdx < this.trace.logs.length && this.trace.logs[this.logIdx].tick <= target) this.onLog(this.trace.logs[this.logIdx++]);
    this.tick = target;
    this.onFrame(this.pose(target), target);
  }
  stop(): void { cancelAnimationFrame(this.raf); }
}
