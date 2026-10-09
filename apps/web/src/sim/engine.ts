/**
 * RVX-Sim engine (TypeScript) — line-for-line port of rvx_sim/engine.py.
 * Drives Level-1 live teleop/CLI in the browser and records the command log
 * that the server replays with the Python engine. Keep both files in sync.
 */
export const WORLD_SIZE = 11.088889; // (500 - 1) / 45
export const CENTER = 5.544445;
export const DT = 0.01; // 100 Hz fixed step
export const CMD_TIMEOUT_TICKS = 100; // Twist acts for exactly 1.0 s
export const ROTATE_ABS_SPEED = 1.0; // rad/s
export const DEFAULT_PEN: Pen = [179, 184, 255, 3];
export const BG_COLOR: [number, number, number] = [69, 86, 255];

export type Pen = [r: number, g: number, b: number, width: number];
/** [tick, x0, y0, x1, y1, r, g, b, width] */
export type Segment = [number, number, number, number, number, number, number, number, number];
export type Pose = { x: number; y: number; theta: number; linear_velocity: number; angular_velocity: number };

export type Command =
  | { t: number; seq: number; type: "cmd_vel"; lx: number; ly: number; az: number }
  | { t: number; seq: number; type: "teleport_abs"; x: number; y: number; theta: number }
  | { t: number; seq: number; type: "teleport_rel"; linear: number; angular: number }
  | { t: number; seq: number; type: "set_pen"; r: number; g: number; b: number; width: number; off: number }
  | { t: number; seq: number; type: "rotate_abs"; theta: number }
  | { t: number; seq: number; type: "clear" }
  | { t: number; seq: number; type: "reset" };

type CommandInput = Command extends infer C ? (C extends { t: number; seq: number } ? Omit<C, "t" | "seq"> : never) : never;

export function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class TurtleWorld {
  readonly start: [number, number, number];
  x = 0; y = 0; theta = 0;
  vx = 0; vy = 0; wz = 0;
  tick = 0;
  lastCmdTick = -1e9;
  rotTarget: number | null = null;
  penOn = true;
  pen: Pen = [...DEFAULT_PEN];
  segments: Segment[] = [];
  /** [tick, index of first segment drawn after the clear] */
  clears: [number, number][] = [];
  logs: { tick: number; level: string; msg: string }[] = [];
  wallContact = false;
  wallHits = 0;
  commandLog: Command[] = [];
  private seq = 0;
  /** called whenever something should be redrawn or logged */
  onLog?: (line: string, level: string) => void;

  constructor(start: [number, number, number] = [CENTER, CENTER, 0]) {
    this.start = start;
    this.resetWorld();
  }

  resetWorld(): void {
    [this.x, this.y] = [this.start[0], this.start[1]];
    this.theta = wrapAngle(this.start[2]);
    this.vx = this.vy = this.wz = 0;
    this.tick = 0;
    this.lastCmdTick = -1e9;
    this.rotTarget = null;
    this.penOn = true;
    this.pen = [...DEFAULT_PEN];
    this.segments = [];
    this.clears = [];
    this.logs = [];
    this.wallContact = false;
    this.wallHits = 0;
    this.commandLog = [];
    this.seq = 0;
  }

  get simTime(): number { return this.tick * DT; }

  get moving(): boolean {
    const active = this.tick - this.lastCmdTick < CMD_TIMEOUT_TICKS;
    return (active && (this.vx !== 0 || this.vy !== 0 || this.wz !== 0)) || this.rotTarget !== null;
  }

  private log(level: string, msg: string) {
    this.logs.push({ tick: this.tick, level, msg });
    this.onLog?.(msg, level);
  }

  /** Apply a command NOW (at the current tick) and record it for server replay. */
  apply(cmd: CommandInput): void {
    const rec = { ...cmd, t: this.tick, seq: this.seq++ } as Command;
    this.commandLog.push(rec);
    switch (rec.type) {
      case "cmd_vel": this.cmdVel(rec.lx, rec.ly, rec.az); break;
      case "teleport_abs": this.teleportAbsolute(rec.x, rec.y, rec.theta); break;
      case "teleport_rel": this.teleportRelative(rec.linear, rec.angular); break;
      case "set_pen": this.setPen(rec.r, rec.g, rec.b, rec.width, rec.off); break;
      case "rotate_abs": this.rotateAbsolute(rec.theta); break;
      case "clear": this.clear(); break;
      case "reset": this.reset(); break;
    }
  }

  private cmdVel(lx: number, ly: number, az: number) {
    this.vx = +lx; this.vy = +ly; this.wz = +az;
    this.lastCmdTick = this.tick;
    this.rotTarget = null;
  }

  private drawTo(nx: number, ny: number) {
    if (this.penOn && (nx !== this.x || ny !== this.y)) {
      const [r, g, b, w] = this.pen;
      this.segments.push([this.tick, this.x, this.y, nx, ny, r, g, b, w]);
    }
    this.x = nx; this.y = ny;
  }

  private teleportAbsolute(x: number, y: number, theta: number) {
    this.drawTo(clamp(+x, 0, WORLD_SIZE), clamp(+y, 0, WORLD_SIZE));
    this.theta = wrapAngle(+theta);
  }

  private teleportRelative(linear: number, angular: number) {
    const th = wrapAngle(this.theta + +angular);
    const nx = clamp(this.x + Math.cos(th) * +linear, 0, WORLD_SIZE);
    const ny = clamp(this.y + Math.sin(th) * +linear, 0, WORLD_SIZE);
    this.theta = th;
    this.drawTo(nx, ny);
  }

  private setPen(r: number, g: number, b: number, width: number, off: number) {
    this.pen = [Math.trunc(clamp(r, 0, 255)), Math.trunc(clamp(g, 0, 255)), Math.trunc(clamp(b, 0, 255)), Math.max(1, Math.trunc(width))];
    this.penOn = !off;
  }

  private clear() { this.clears.push([this.tick, this.segments.length]); }

  private reset() {
    [this.x, this.y] = [this.start[0], this.start[1]];
    this.theta = wrapAngle(this.start[2]);
    this.vx = this.vy = this.wz = 0;
    this.lastCmdTick = -1e9;
    this.rotTarget = null;
    this.penOn = true;
    this.pen = [...DEFAULT_PEN];
    this.clears.push([this.tick, this.segments.length]);
  }

  private rotateAbsolute(theta: number) {
    this.vx = this.vy = this.wz = 0;
    this.lastCmdTick = -1e9;
    this.rotTarget = wrapAngle(+theta);
  }

  /** Advance exactly one 10 ms tick. */
  step(): void {
    if (this.rotTarget !== null) {
      const err = wrapAngle(this.rotTarget - this.theta);
      const s = ROTATE_ABS_SPEED * DT;
      if (Math.abs(err) <= s) { this.theta = this.rotTarget; this.rotTarget = null; }
      else this.theta = wrapAngle(this.theta + (err > 0 ? s : -s));
      this.tick += 1;
      return;
    }
    if (this.tick - this.lastCmdTick >= CMD_TIMEOUT_TICKS) this.vx = this.vy = this.wz = 0;

    this.theta = wrapAngle(this.theta + this.wz * DT);
    const c = Math.cos(this.theta), s = Math.sin(this.theta);
    let nx = this.x + (c * this.vx - s * this.vy) * DT;
    let ny = this.y + (s * this.vx + c * this.vy) * DT;

    const hit = nx < 0 || nx > WORLD_SIZE || ny < 0 || ny > WORLD_SIZE;
    if (hit && !this.wallContact) {
      this.wallHits += 1;
      this.log("WARN", `Oh no! I hit the wall! (Clamping from [x=${nx.toFixed(6)}, y=${ny.toFixed(6)}])`);
    }
    this.wallContact = hit;
    nx = clamp(nx, 0, WORLD_SIZE); ny = clamp(ny, 0, WORLD_SIZE);

    this.tick += 1;
    this.drawTo(nx, ny);
  }

  pose(): Pose {
    const active = this.tick - this.lastCmdTick < CMD_TIMEOUT_TICKS;
    return { x: this.x, y: this.y, theta: this.theta, linear_velocity: active ? this.vx : 0, angular_velocity: active ? this.wz : 0 };
  }

  /** Segments after the last clear/reset — what is visible and what gets scored. */
  visibleSegments(): Segment[] {
    const first = this.clears.length ? this.clears[this.clears.length - 1][1] : 0;
    return this.segments.slice(first);
  }
}

/**
 * Real-time driver: fixed 100 Hz steps from requestAnimationFrame.
 * Never steps more than MAX_STEPS_PER_FRAME (tab-switch safety).
 */
export class LiveLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private world: TurtleWorld;
  private onFrame: (w: TurtleWorld) => void;
  static MAX_STEPS_PER_FRAME = 25;
  constructor(world: TurtleWorld, onFrame: (w: TurtleWorld) => void) {
    this.world = world;
    this.onFrame = onFrame;
  }
  start() {
    this.last = performance.now();
    const frame = (now: number) => {
      this.acc += Math.min(250, now - this.last);
      this.last = now;
      let n = 0;
      while (this.acc >= DT * 1000 && n < LiveLoop.MAX_STEPS_PER_FRAME) { this.world.step(); this.acc -= DT * 1000; n++; }
      this.onFrame(this.world);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  stop() { cancelAnimationFrame(this.raf); }
}
