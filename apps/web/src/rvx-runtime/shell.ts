/**
 * RVX shell — a bash-like terminal on top of xterm.js.
 *   line editing (←/→, Home/End, Ctrl+A/E/U/K/W, ↑/↓ history, Tab completion), type-ahead while busy,
 *   Ctrl+C / Ctrl+L / Ctrl+D, python3 (file, -c, REPL), pip with real download bars,
 *   ros2 (run, topic pub/echo, service call, action send_goal, teleop) and the usual coreutils.
 * Output keeps working while no xterm is attached (buffered, replayed on attach).
 */
import type { Terminal } from "@xterm/xterm";
import { DT } from "@/sim/engine";
import { HELP, runCli, teleopKey, tokenize } from "@/sim/cli";
import { CancelledError, TimeoutError, type Progress, type WorkerRunResult } from "./python-runtime";
import type { LogLine } from "./sim-controller";
import type { RvxRuntime, RunOutcome } from "./runtime";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", bgreen: "\x1b[1;32m", bblue: "\x1b[1;34m", bcyan: "\x1b[1;36m",
};
const COMMANDS = [
  "apt", "apt-get", "cat", "cd", "clear", "colcon", "date", "echo", "env", "exit", "help", "history", "hostname",
  "ll", "ls", "nano", "pip", "pip3", "ps", "pwd", "python", "python3", "ros2", "source", "sudo", "uname", "vim", "which", "whoami",
];
const ROS2_SUB: Record<string, string[]> = {
  "": ["action", "interface", "node", "run", "service", "topic"],
  topic: ["echo", "info", "list", "pub", "type"],
  service: ["call", "list"],
  action: ["list", "send_goal"],
  node: ["list"],
  interface: ["show"],
  run: ["turtlesim", "my_package"],
};
const ROS2_ARGS = [
  "/turtle1/cmd_vel", "/turtle1/pose", "/turtle1/teleport_absolute", "/turtle1/teleport_relative", "/turtle1/set_pen",
  "/turtle1/rotate_absolute", "/clear", "/reset", "geometry_msgs/msg/Twist", "turtlesim/srv/TeleportAbsolute",
  "turtlesim/srv/TeleportRelative", "turtlesim/srv/SetPen", "std_srvs/srv/Empty", "turtlesim/action/RotateAbsolute",
  "turtle_teleop_key", "turtlesim_node", "--once", "--rate",
];

type Mode = "boot" | "prompt" | "busy" | "repl" | "teleop";
type Dl = Progress & { start: number; shown: boolean };

const fmtBytes = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e3).toFixed(1)} kB`);
const fmtPair = (a: number, b: number) =>
  b >= 1e6 ? `${(a / 1e6).toFixed(1)}/${(b / 1e6).toFixed(1)} MB` : `${(a / 1e3).toFixed(1)}/${(b / 1e3).toFixed(1)} kB`;
const fmtEta = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

export class RvxShell {
  private term: Terminal | null = null;
  private pendingOut = "";
  private mode: Mode = "boot";
  private line = "";
  private cur = 0;
  private cursorRow = 0;
  private history: string[] = [];
  private hIdx = 0;
  private draft = "";
  private typeahead = "";
  private cwd = "~/workspace";
  private interrupt: (() => void) | null = null;
  private teleopHandler: ((key: string) => void) | null = null;
  private replMore = false;
  private bootStarted = false;
  private dls = new Map<number, Dl>();
  private curDl: number | null = null;
  private barOn = false;
  private progressStyle: "boot" | "pip" = "pip";
  private bootT0 = 0;

  private rt: RvxRuntime;

  constructor(rt: RvxRuntime) {
    this.rt = rt;
    rt.py.on("progress", (p) => this.onProgress(p));
    rt.py.on("bootLog", (text, t) => this.out(`${C.dim}[${t.toFixed(6).padStart(12)}]${C.reset} ${text}\n`));
    try {
      const h = JSON.parse(globalThis.localStorage?.getItem("rvx.history") ?? "[]");
      if (Array.isArray(h)) this.history = h.filter((x) => typeof x === "string").slice(-200);
    } catch { /* storage unavailable */ }
    this.hIdx = this.history.length;
  }

  // ===================================================================== terminal I/O
  attach(term: Terminal): () => void {
    this.term = term;
    const sub = term.onData((d) => this.onData(d));
    if (this.pendingOut) { term.write(this.pendingOut); this.pendingOut = ""; }
    if (this.mode === "boot" && !this.bootStarted) { this.bootStarted = true; void this.bootSequence(); }
    else if (this.mode === "prompt") { this.term.write("\r\n"); this.cursorRow = 0; this.redraw(); }
    return () => {
      sub.dispose();
      if (this.term === term) this.term = null;
    };
  }

  private raw(s: string) {
    if (this.term) this.term.write(s);
    else { this.pendingOut += s; if (this.pendingOut.length > 200_000) this.pendingOut = this.pendingOut.slice(-150_000); }
  }
  /** Print program/command output ("\n" → "\r\n"), keeping an active download bar at the bottom. */
  out(s: string) {
    if (!s) return;
    const text = s.replace(/\r?\n/g, "\r\n");
    if (this.barOn) {
      this.raw("\r\x1b[K" + text);
      if (/\n$/.test(text) || text.endsWith("\r\n")) this.drawBar();
      else this.barOn = false;
    } else this.raw(text);
  }
  clear() {
    this.term?.clear();
    if (this.mode === "prompt") { this.term?.write("\x1b[2K\r"); this.cursorRow = 0; this.redraw(); }
  }
  private cols() { return Math.max(20, this.term?.cols ?? 80); }

  private get prompt(): string {
    if (this.mode === "repl") return this.replMore ? "... " : ">>> ";
    const { user, host } = this.rt.config;
    return `${C.bgreen}${user}@${host}${C.reset}:${C.bblue}${this.cwd}${C.reset}$ `;
  }

  /** Wrap-aware redraw of prompt + current line, cursor placed at `cur`. */
  private redraw() {
    const cols = this.cols();
    const p = this.prompt;
    const P = visible(p).length;
    let s = "";
    if (this.cursorRow > 0) s += `\x1b[${this.cursorRow}A`;
    s += "\r\x1b[J" + p + this.line;
    const end = P + this.line.length;
    if (end > 0 && end % cols === 0) s += " \b";
    const endRow = Math.floor(end / cols);
    const tRow = Math.floor((P + this.cur) / cols), tCol = (P + this.cur) % cols;
    if (endRow > tRow) s += `\x1b[${endRow - tRow}A`;
    s += "\r" + (tCol ? `\x1b[${tCol}C` : "");
    this.cursorRow = tRow;
    this.raw(s);
  }
  private newPrompt() {
    this.line = ""; this.cur = 0; this.cursorRow = 0;
    this.hIdx = this.history.length;
    this.redraw();
  }
  /** Leave busy state, show the prompt and replay anything typed meanwhile. */
  private toPrompt() {
    this.mode = this.mode === "repl" ? "repl" : "prompt";
    this.interrupt = null;
    this.teleopHandler = null;
    this.rt.setActivity(this.mode === "repl" ? "repl" : "idle");
    this.newPrompt();
    if (this.typeahead) { const t = this.typeahead; this.typeahead = ""; this.onData(t); }
  }

  // ===================================================================== input
  private onData(data: string) {
    if (this.mode === "teleop" && this.teleopHandler) {
      if (data === "\x03") { this.interrupt?.(); return; }
      const keys: Record<string, string> = { "\x1b[A": "ArrowUp", "\x1b[B": "ArrowDown", "\x1b[C": "ArrowRight", "\x1b[D": "ArrowLeft" };
      if (keys[data]) { this.teleopHandler(keys[data]); return; }
      for (const ch of data) this.teleopHandler(ch);
      return;
    }
    if (this.mode === "busy" || this.mode === "boot") {
      if (data.includes("\x03")) { this.interrupt?.(); return; }
      if (data === "\x0c") return;
      this.typeahead += data.replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f]/g, "");
      return;
    }
    let i = 0;
    while (i < data.length) {
      const rest = data.slice(i);
      const esc = /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Za-z]|[bf])/.exec(rest);
      if (esc) { this.key(esc[0]); i += esc[0].length; continue; }
      const ch = data[i++];
      if (ch === "\r" || ch === "\n") {
        if (ch === "\n" && data[i - 2] === "\r") continue;
        this.submit();
        if (this.mode !== "prompt" && this.mode !== "repl") { this.typeahead += data.slice(i); return; }
        continue;
      }
      this.key(ch);
    }
  }

  private key(k: string) {
    const L = this.line;
    switch (k) {
      case "\x03": // Ctrl+C
        this.cur = L.length; this.redraw();
        this.raw("^C\r\n");
        if (this.mode === "repl") { this.replMore = false; this.raw("KeyboardInterrupt\r\n"); this.rt.py.replReset(); }
        this.newPrompt();
        return;
      case "\x04": // Ctrl+D
        if (!L) {
          if (this.mode === "repl") { this.raw("\r\n"); this.exitRepl(); }
          else { this.raw("\r\nlogout\r\n"); this.saveHistory(); this.motd(); this.newPrompt(); }
        }
        return;
      case "\x0c": this.term?.clear(); this.raw("\x1b[H\x1b[2J"); this.cursorRow = 0; this.redraw(); return;
      case "\x7f": case "\b":
        if (this.cur > 0) { this.line = L.slice(0, this.cur - 1) + L.slice(this.cur); this.cur--; this.redraw(); }
        return;
      case "\x1b[3~": if (this.cur < L.length) { this.line = L.slice(0, this.cur) + L.slice(this.cur + 1); this.redraw(); } return;
      case "\x1b[D": case "\x1bOD": if (this.cur > 0) { this.cur--; this.redraw(); } return;
      case "\x1b[C": case "\x1bOC": if (this.cur < L.length) { this.cur++; this.redraw(); } return;
      case "\x1b[H": case "\x1bOH": case "\x1b[1~": case "\x01": this.cur = 0; this.redraw(); return;
      case "\x1b[F": case "\x1bOF": case "\x1b[4~": case "\x05": this.cur = L.length; this.redraw(); return;
      case "\x1bb": case "\x1b[1;5D": { let c = this.cur; while (c > 0 && L[c - 1] === " ") c--; while (c > 0 && L[c - 1] !== " ") c--; this.cur = c; this.redraw(); return; }
      case "\x1bf": case "\x1b[1;5C": { let c = this.cur; while (c < L.length && L[c] === " ") c++; while (c < L.length && L[c] !== " ") c++; this.cur = c; this.redraw(); return; }
      case "\x15": this.line = L.slice(this.cur); this.cur = 0; this.redraw(); return; // Ctrl+U
      case "\x0b": this.line = L.slice(0, this.cur); this.redraw(); return; // Ctrl+K
      case "\x17": { let c = this.cur; while (c > 0 && L[c - 1] === " ") c--; while (c > 0 && L[c - 1] !== " ") c--; this.line = L.slice(0, c) + L.slice(this.cur); this.cur = c; this.redraw(); return; }
      case "\x1b[A": case "\x1bOA":
        if (this.hIdx > 0) { if (this.hIdx === this.history.length) this.draft = L; this.hIdx--; this.line = this.history[this.hIdx]; this.cur = this.line.length; this.redraw(); }
        return;
      case "\x1b[B": case "\x1bOB":
        if (this.hIdx < this.history.length) { this.hIdx++; this.line = this.hIdx === this.history.length ? this.draft : this.history[this.hIdx]; this.cur = this.line.length; this.redraw(); }
        return;
      case "\t": this.complete(); return;
    }
    if (k.length === 1 && k >= " ") {
      this.line = L.slice(0, this.cur) + k + L.slice(this.cur);
      this.cur++;
      this.redraw();
    }
  }

  private complete() {
    if (this.mode === "repl") { this.line = this.line.slice(0, this.cur) + "    " + this.line.slice(this.cur); this.cur += 4; this.redraw(); return; }
    const before = this.line.slice(0, this.cur);
    const words = before.split(/\s+/);
    const word = words[words.length - 1];
    let cands: string[];
    if (words.length === 1) cands = COMMANDS;
    else if (words[0] === "ros2") {
      cands = words.length === 2 ? ROS2_SUB[""] : words.length === 3 ? ROS2_SUB[words[1]] ?? [] : ROS2_ARGS;
    } else if (words[0] === "pip" || words[0] === "pip3") cands = words.length === 2 ? ["install", "list", "show", "uninstall", "freeze"] : [];
    else cands = this.files();
    const m = cands.filter((c) => c.startsWith(word));
    if (!m.length) return;
    if (m.length === 1) {
      const add = m[0].slice(word.length) + (m[0].endsWith("/") ? "" : " ");
      this.line = before + add + this.line.slice(this.cur);
      this.cur += add.length;
      this.redraw();
      return;
    }
    let pre = m[0];
    for (const c of m) while (!c.startsWith(pre)) pre = pre.slice(0, -1);
    if (pre.length > word.length) {
      this.line = before + pre.slice(word.length) + this.line.slice(this.cur);
      this.cur += pre.length - word.length;
      this.redraw();
      return;
    }
    this.cur = this.line.length; this.redraw();
    this.raw("\r\n" + m.join("  ") + "\r\n");
    this.cursorRow = 0;
    this.cur = before.length;
    this.redraw();
  }

  private submit() {
    const line = this.line;
    this.cur = line.length; this.redraw();
    this.raw("\r\n");
    this.cursorRow = 0;
    if (line.trim() && this.history[this.history.length - 1] !== line) { this.history.push(line); this.saveHistory(); }
    this.hIdx = this.history.length;
    this.line = ""; this.cur = 0;
    if (this.mode === "repl") { void this.replLine(line); return; }
    void this.exec(line);
  }
  private saveHistory() {
    try { globalThis.localStorage?.setItem("rvx.history", JSON.stringify(this.history.slice(-200))); } catch { /* ignore */ }
  }

  /** Type a command as if the user entered it (used by the RUN button). */
  typeCommand(cmd: string) {
    if (this.mode === "busy" || this.mode === "boot") { this.typeahead += cmd + "\r"; return; }
    if (this.mode === "repl") this.exitRepl();
    this.line = cmd; this.cur = cmd.length;
    this.submit();
  }
  stop() { this.interrupt?.(); }
  get isBusy() { return this.mode === "busy" || this.mode === "boot" || this.mode === "teleop"; }

  // ===================================================================== boot + motd
  private async bootSequence() {
    this.mode = "boot";
    this.rt.setActivity("booting");
    this.interrupt = null;
    await this.ensureBoot(true);
    this.motd();
    this.mode = "prompt";
    this.toPrompt();
  }
  private motd() {
    const { user } = this.rt.config;
    const d = new Date();
    const stamp = d.toDateString().replace(/^(\w+) (\w+) (\d+) (\d+)$/, "$1 $2 $3") + " " + d.toTimeString().slice(0, 8) + " " + d.getFullYear();
    this.out(
      `\n${C.bcyan}Roboverse X Linux${C.reset} 1.0 LTS (GNU/Linux 6.8.0-rvx wasm32)\n\n` +
      ` * ROS 2 Jazzy  · turtlesim_node running (turtle1)\n` +
      ` * Python ${this.rt.py.info?.python ?? "3"}  · pip packages from Pyodide / PyPI\n` +
      ` * Type ${C.bold}help${C.reset} for commands, ${C.bold}python3 ${this.rt.config.fileName}${C.reset} to run your node\n\n` +
      `Last login: ${stamp} on pts/0 (${user})\n`,
    );
  }
  /** Boot Python if needed, printing the kernel-style log and real download bars. */
  private async ensureBoot(first = false): Promise<boolean> {
    const py = this.rt.py;
    if (py.booted) return true;
    this.progressStyle = "boot";
    this.bootT0 = performance.now();
    if (!first) this.out(`${C.dim}[rvx] starting Python runtime…${C.reset}\n`);
    this.rt.setRuntime("booting");
    try {
      const info = await py.boot();
      const t = (performance.now() - this.bootT0) / 1000;
      const s = this.rt.sim.start;
      this.out(`${C.dim}[${t.toFixed(6).padStart(12)}]${C.reset} ros2: turtlesim_node [turtle1] spawned at x=[${s.x.toFixed(6)}], y=[${s.y.toFixed(6)}], theta=[${s.theta.toFixed(6)}]\n`);
      if (first) this.out(`${C.dim}[${t.toFixed(6).padStart(12)}]${C.reset} systemd[1]: Reached target ${C.green}Roboverse Arena${C.reset}.\n`);
      this.rt.setRuntime("ready", info);
      return true;
    } catch (e) {
      this.flushBars();
      this.out(`${C.red}rvx: Python runtime failed to start: ${(e as Error).message}${C.reset}\n`);
      this.out(`${C.dim}hint: check that /pyodide/pyodide.mjs and /py/rvx_sim/*.py are served (run scripts/copy-pyodide.mjs)${C.reset}\n`);
      this.rt.setRuntime("error");
      return false;
    } finally {
      this.progressStyle = "pip";
    }
  }

  // ===================================================================== progress bars
  private onProgress(p: Progress) {
    const d = this.dls.get(p.dl);
    if (d) Object.assign(d, p);
    else this.dls.set(p.dl, { ...p, start: performance.now(), shown: false });
    if (this.curDl === null) this.curDl = p.dl;
    if (this.curDl === p.dl || (d?.done ?? p.done)) this.drawBar();
  }
  private drawBar() {
    while (this.curDl !== null) {
      const d = this.dls.get(this.curDl);
      if (!d) { this.curDl = this.nextDl(); continue; }
      if (!d.shown) {
        d.shown = true;
        const size = d.total ? ` (${fmtBytes(d.total)})` : "";
        if (this.barOn) this.raw("\r\x1b[K");
        if (this.progressStyle === "boot") {
          const t = (performance.now() - this.bootT0) / 1000;
          this.raw(`${C.dim}[${t.toFixed(6).padStart(12)}]${C.reset} fetch: ${d.file}${size}\r\n`);
        } else this.raw(`  Downloading ${d.file}${size}\r\n`);
      }
      this.raw("\r\x1b[K" + this.bar(d));
      this.barOn = true;
      if (!d.done) return;
      this.raw("\r\n");
      this.barOn = false;
      this.dls.delete(this.curDl);
      this.curDl = this.nextDl();
    }
  }
  private nextDl(): number | null {
    const it = this.dls.keys().next();
    return it.done ? null : it.value;
  }
  private flushBars() {
    if (this.barOn) this.raw("\r\n");
    this.barOn = false;
    this.dls.clear();
    this.curDl = null;
  }
  private bar(d: Dl): string {
    const width = Math.max(10, Math.min(40, this.cols() - 40));
    const el = Math.max(0.001, (performance.now() - d.start) / 1000);
    const rate = d.loaded / el;
    const fill = d.done ? C.green : "\x1b[38;5;197m";
    const dim = "\x1b[38;5;237m";
    if (!d.total && !d.done) {
      // unknown size (compressed transfer): moving segment like pip's indeterminate bar
      const seg = Math.max(4, Math.floor(width / 4));
      const pos = Math.floor(el * 12) % (width + seg) - seg;
      let barStr = "";
      for (let i = 0; i < width; i++) barStr += i >= pos && i < pos + seg ? fill + "━" : dim + "━";
      return `     ${barStr}${C.reset} ${C.green}${fmtBytes(d.loaded)}${C.reset} ${C.red}${fmtBytes(rate)}/s${C.reset}`;
    }
    const total = d.total || d.loaded || 1;
    const frac = Math.min(1, d.loaded / total);
    const n = Math.round(frac * width);
    return (
      "     " + fill + "━".repeat(n) + dim + "━".repeat(width - n) + C.reset +
      ` ${C.green}${fmtPair(d.loaded, total)}${C.reset} ${C.red}${fmtBytes(rate)}/s${C.reset} ${C.cyan}eta ${fmtEta(d.done ? 0 : (total - d.loaded) / Math.max(rate, 1))}${C.reset}`
    );
  }

  // ===================================================================== command dispatch
  private files(): string[] {
    return this.cwd === "~" ? ["workspace/"] : [this.rt.config.fileName, "README.md"];
  }
  private resolveFile(arg: string): string | null {
    const f = this.rt.config.fileName;
    const a = arg.replace(/^\.\//, "").replace(/^~\/workspace\//, this.cwd === "~/workspace" ? "" : "workspace/");
    const home = `/home/${this.rt.config.user}/workspace/`;
    if (this.cwd === "~/workspace" && (a === f || arg === home + f)) return f;
    if (this.cwd === "~" && (a === "workspace/" + f || arg === home + f)) return f;
    if ((this.cwd === "~/workspace" && a === "README.md") || (this.cwd === "~" && a === "workspace/README.md")) return "README.md";
    return null;
  }
  private readme() {
    return `# Roboverse X workspace\n\n${this.rt.config.fileName} is your ROS 2 node (edit it in the editor panel).\n\n  python3 ${this.rt.config.fileName}            run it\n  ros2 run my_package ${this.rt.config.fileName.replace(/\.py$/, "")}   run it as a ROS 2 package\n  pip install <pkg>               install Python packages\n`;
  }

  private begin(activity: Parameters<RvxRuntime["setActivity"]>[0]) {
    this.mode = "busy";
    this.rt.setActivity(activity);
  }

  private async exec(input: string) {
    const lineIn = input.trim();
    if (!lineIn) { this.newPrompt(); return; }
    let argv: string[];
    try { argv = tokenize(lineIn); } catch (e) { this.out(`bash: ${(e as Error).message}\n`); this.newPrompt(); return; }
    const [cmd, ...args] = argv;
    const done = () => this.toPrompt();
    switch (cmd) {
      case "help":
        this.out(`${C.bold}Shell${C.reset}: ls  cd  pwd  cat  echo  clear  history  whoami  uname  date  ps  exit\n` +
          `${C.bold}Python${C.reset}: python3 ${this.rt.config.fileName} | python3 -c "code" | python3 (REPL) | pip install <pkg> | pip list\n` +
          `${C.bold}Keys${C.reset}: Ctrl+C stop · Ctrl+L clear · ↑/↓ history · Tab complete\n\n`);
        this.out(HELP.replace(/\r\n/g, "\n") + "\n");
        return done();
      case "clear": this.term?.clear(); this.raw("\x1b[H\x1b[2J"); return done();
      case "pwd": this.out(this.cwd.replace("~", `/home/${this.rt.config.user}`) + "\n"); return done();
      case "whoami": this.out(this.rt.config.user + "\n"); return done();
      case "hostname": this.out(this.rt.config.host + "\n"); return done();
      case "date": this.out(new Date().toString().replace(/ \(.*\)$/, "") + "\n"); return done();
      case "uname":
        this.out((args.includes("-a") ? `Linux ${this.rt.config.host} 6.8.0-rvx #1 SMP PREEMPT_DYNAMIC wasm32 GNU/Linux` : "Linux") + "\n");
        return done();
      case "echo": this.out(args.join(" ") + "\n"); return done();
      case "history": this.history.forEach((h, i) => this.out(`${String(i + 1).padStart(5)}  ${h}\n`)); return done();
      case "env":
        this.out(`USER=${this.rt.config.user}\nHOME=/home/${this.rt.config.user}\nSHELL=/bin/bash\nROS_DISTRO=jazzy\nROS_VERSION=2\nRMW_IMPLEMENTATION=rmw_rvx_cpp\nPYTHONPATH=/opt/ros/jazzy/lib/python3/site-packages\n`);
        return done();
      case "source": return done();
      case "which": args.forEach((a) => this.out(COMMANDS.includes(a) ? `/usr/bin/${a}\n` : "")); return done();
      case "ps":
        this.out(`    PID TTY          TIME CMD\n   1042 pts/0    00:00:00 bash\n    311 ?        00:00:02 turtlesim_node\n${this.rt.py.booted ? "    502 ?        00:00:01 python3 (rvx-runtime)\n" : ""}   ${1100 + this.history.length} pts/0    00:00:00 ps\n`);
        return done();
      case "cd": {
        const a = args[0] ?? "~";
        if (["~", "/home/" + this.rt.config.user, "..", "~/"].includes(a)) this.cwd = "~";
        else if (["workspace", "workspace/", "~/workspace", "./workspace", "/home/" + this.rt.config.user + "/workspace"].includes(a)) this.cwd = "~/workspace";
        else if (a === ".") { /* stay */ } else this.out(`bash: cd: ${a}: No such file or directory\n`);
        return done();
      }
      case "ls": case "ll": {
        const long = cmd === "ll" || args.some((a) => /^-\w*l/.test(a));
        const target = args.find((a) => !a.startsWith("-"));
        const inWs = target ? /workspace\/?$/.test(target) : this.cwd === "~/workspace";
        const names = inWs ? [this.rt.config.fileName, "README.md"] : ["workspace"];
        if (!long) this.out(names.map((n) => (n === "workspace" ? `${C.bblue}${n}${C.reset}` : n.endsWith(".py") ? `${C.green}${n}${C.reset}` : n)).join("  ") + "\n");
        else {
          const d = new Date(); const ts = d.toDateString().slice(4, 10) + " " + d.toTimeString().slice(0, 5);
          const u = this.rt.config.user;
          this.out(`total ${names.length * 4}\n`);
          for (const n of names) {
            const size = n === this.rt.config.fileName ? this.rt.config.getCode().length : n === "README.md" ? this.readme().length : 4096;
            const perm = n === "workspace" ? "drwxr-xr-x" : n.endsWith(".py") ? "-rwxr-xr-x" : "-rw-r--r--";
            const nm = n === "workspace" ? `${C.bblue}${n}${C.reset}` : n.endsWith(".py") ? `${C.bgreen}${n}${C.reset}` : n;
            this.out(`${perm} 1 ${u} ${u} ${String(size).padStart(6)} ${ts} ${nm}\n`);
          }
        }
        return done();
      }
      case "cat": {
        for (const a of args) {
          const f = this.resolveFile(a);
          if (!f) this.out(`cat: ${a}: No such file or directory\n`);
          else this.out((f === "README.md" ? this.readme() : this.rt.config.getCode()).replace(/\n?$/, "\n"));
        }
        return done();
      }
      case "nano": case "vim": case "vi": case "code":
        this.out(`${cmd}: use the editor panel to edit ${this.rt.config.fileName} (changes are picked up on the next run)\n`);
        return done();
      case "sudo": this.out(`[sudo] password for ${this.rt.config.user}: \n${this.rt.config.user} is not in the sudoers file.  This incident will be reported.\n`); return done();
      case "apt": case "apt-get":
        this.out(`E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?\n${C.dim}hint: Python packages install with: pip install <name>${C.reset}\n`);
        return done();
      case "colcon":
        if (args[0] !== "build") { this.out(`usage: colcon build\n`); return done(); }
        this.begin("running");
        await this.sleep(250); this.out(`Starting ${C.bold}>>>${C.reset} my_package\n`);
        await this.sleep(700); this.out(`Finished ${C.bold}<<<${C.reset} my_package [0.71s]\n\nSummary: 1 package finished [0.84s]\n`);
        return done();
      case "exit": case "logout":
        this.out("logout\n"); this.term?.clear(); this.raw("\x1b[H\x1b[2J"); this.motd(); return done();
      case "python": case "python3": return this.python(args);
      case "pip": case "pip3": return this.pip(args);
      case "ros2": return this.ros2(lineIn, args);
      default:
        if (/^\.\/.+\.py$/.test(cmd) && this.resolveFile(cmd)) return this.python([cmd, ...args]);
        this.out(`${cmd}: command not found\n`);
        return done();
    }
  }

  private sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

  // ===================================================================== python
  private async python(args: string[]) {
    if (args[0] === "--version" || args[0] === "-V") {
      if (!(await this.bootFor())) return this.toPrompt();
      this.out(`Python ${this.rt.py.info?.python}\n`);
      return this.toPrompt();
    }
    if (args[0] === "-m" && args[1] === "pip") return this.pip(args.slice(2));
    if (args[0] === "-c") {
      if (args[1] === undefined) { this.out("Argument expected for the -c option\n"); return this.toPrompt(); }
      return this.runProgram(args[1], `python3 -c`, "python");
    }
    if (!args.length) return this.startRepl();
    const f = this.resolveFile(args[0]);
    if (!f) {
      this.out(`python3: can't open file '/home/${this.rt.config.user}/workspace/${args[0].replace(/^\.\//, "")}': [Errno 2] No such file or directory\n`);
      return this.toPrompt();
    }
    if (f === "README.md") { this.out(`  File "/home/${this.rt.config.user}/workspace/README.md", line 1\n    # Roboverse X workspace\nSyntaxError: invalid syntax\n`); return this.toPrompt(); }
    return this.runProgram(this.rt.config.getCode(), `python3 ${f}`, "python");
  }

  private async bootFor(): Promise<boolean> {
    this.begin("booting");
    this.interrupt = null;
    return this.ensureBoot();
  }

  /** Run code in the simulated ROS world; output and turtle motion stream in real time. */
  private async runProgram(code: string, command: string, kind: "python" | "ros2") {
    if (!(await this.bootFor())) return this.toPrompt();
    this.begin("installing");
    const rt = this.rt;
    const epoch = Date.now() / 1000;
    let finished = false;
    let result: WorkerRunResult | null = null;
    let failure: Error | null = null;

    const end = (status: RunOutcome["status"], error: string | null) => {
      if (finished) return;
      finished = true;
      this.flushBars();
      rt.reportRun(command, status, error, result, code);
      this.toPrompt();
    };

    rt.sim.beginProgram((l) => this.out(this.formatLog(l, epoch) + "\n"), () => {
      if (failure instanceof TimeoutError) {
        this.out(`${C.red}Killed${C.reset}\n${C.dim}rvx: process made no progress for ${rt.config.runTimeoutMs / 1000} s — infinite loop without time.sleep() or rclpy.spin()?${C.reset}\n`);
        return end("timeout", "Program killed: no progress (infinite loop?)");
      }
      if (failure) {
        this.out(`${C.red}rvx: ${failure.message}${C.reset}\n`);
        return end("crashed", failure.message);
      }
      const r = result!;
      if (r.status === "error" && r.error) {
        const file = command.startsWith("python3 -c") ? "<string>" : `/home/${rt.config.user}/workspace/${rt.config.fileName}`;
        const lines = r.error.replace(/solution\.py/g, file).split("\n");
        lines.forEach((ln, i) => this.out((i === lines.length - 1 ? C.red + ln + C.reset : ln) + "\n"));
        if (kind === "ros2") this.out(`${C.red}[ros2run]: Process exited with failure 1${C.reset}\n`);
        return end("error", r.error);
      }
      if (r.status === "time_limit") {
        this.out(`${C.yellow}[WARN] [${(epoch + r.ticks * DT).toFixed(9)}] [rvx]: ${r.error ?? "simulated time limit reached"} — process stopped${C.reset}\n`);
        return end("time_limit", r.error);
      }
      return end("finished", null);
    });

    this.interrupt = () => {
      if (finished) return;
      rt.py.hardStop(new CancelledError("interrupted"));
      rt.sim.abortProgram();
      this.flushBars();
      this.raw("^C");
      if (kind === "python") this.out(`\nTraceback (most recent call last):\n  File "/home/${rt.config.user}/workspace/${rt.config.fileName}", line 1, in <module>\nKeyboardInterrupt\n`);
      else this.out(`[INFO] [${(Date.now() / 1000).toFixed(9)}] [rclpy]: signal_handler(signum=2)\n${C.red}[ros2run]: Interrupt${C.reset}\n`);
      end("stopped", "Interrupted (Ctrl+C)");
    };

    rt.py
      .run(code, rt.taskForWorker(), {
        onChunk: (c) => rt.sim.pushChunk(c),
        onText: (t) => this.out(t),
        onStart: () => { this.flushBars(); rt.setActivity("running"); },
      }, rt.config.chunkTicks)
      .then((r) => { result = r; rt.sim.endProgram(r); })
      .catch((e: Error) => {
        if (finished || e instanceof CancelledError) return;
        failure = e;
        rt.sim.endProgram(null);
      });
  }

  /** ROS 2 style log line: [LEVEL] [epoch.nanos] [node]: msg  (WARN yellow, ERROR red). */
  private formatLog(l: LogLine, epoch: number): string {
    if (l.level === "PRINT") return l.msg;
    const m = /^\[(\w+)\] \[([\d.]+)\] ([\s\S]*)$/.exec(l.msg);
    const level = m ? m[1] : l.level;
    const ts = (epoch + (m ? parseFloat(m[2]) : l.tick * DT)).toFixed(9);
    const body = m ? m[3] : `[turtlesim]: ${l.msg}`;
    const color = level === "WARN" ? C.yellow : level === "ERROR" || level === "FATAL" ? C.red : level === "DEBUG" ? C.green : "";
    return `${color}[${level}] [${ts}] ${body}${color ? C.reset : ""}`;
  }

  // ===================================================================== REPL
  private async startRepl() {
    if (!(await this.bootFor())) return this.toPrompt();
    this.out(`Python ${this.rt.py.info?.python} (main) [Clang 20.0 / Pyodide ${this.rt.py.info?.pyodide}] on emscripten\nType "help", "copyright", "credits" or "license" for more information.\n`);
    this.mode = "repl";
    this.replMore = false;
    this.toPrompt();
  }
  private exitRepl() {
    this.mode = "prompt";
    this.replMore = false;
    this.rt.py.replReset();
    this.toPrompt();
  }
  private async replLine(line: string) {
    if (!this.replMore && /^\s*(exit|quit)\(\s*\)\s*$/.test(line)) { this.exitRepl(); return; }
    this.mode = "busy";
    this.rt.setActivity("running");
    this.interrupt = () => {
      this.rt.py.hardStop(new CancelledError("interrupted"));
      this.raw("^C\r\nKeyboardInterrupt\r\n");
    };
    try {
      const r = await this.rt.py.repl(line, (t) => this.out(t));
      this.replMore = r.more;
    } catch (e) {
      this.replMore = false;
      if (e instanceof TimeoutError) this.out(`${C.red}Killed${C.reset} (no output for ${(this.rt.config.runTimeoutMs * 2) / 1000} s)\n`);
      else if (!(e instanceof CancelledError)) this.out(`${C.red}${(e as Error).message}${C.reset}\n`);
    }
    this.flushBars();
    this.mode = "repl";
    this.toPrompt();
  }

  // ===================================================================== pip
  private async pip(args: string[]) {
    if (!args.length || args[0] === "--version" || args[0] === "-V") {
      if (!(await this.bootFor())) return this.toPrompt();
      this.out(args.length ? `pip 25.1 from /lib/python3/site-packages/pip (python ${this.rt.py.info?.python})\n` : `\nUsage:\n  pip <command> [options]\n\nCommands:\n  install    Install packages.\n  uninstall  Uninstall packages.\n  list       List installed packages.\n  show       Show information about installed packages.\n  freeze     Output installed packages in requirements format.\n`);
      return this.toPrompt();
    }
    if (!(await this.bootFor())) return this.toPrompt();
    this.begin("installing");
    let stopped = false;
    this.interrupt = () => {
      stopped = true;
      this.rt.py.hardStop(new CancelledError("interrupted"));
      this.flushBars();
      this.raw("^C\r\nERROR: Operation cancelled by user\r\n");
      this.toPrompt();
    };
    try {
      await this.rt.py.pip(args, (t) => this.out(t));
    } catch (e) {
      if (stopped) return;
      if (!(e instanceof CancelledError)) this.out(`${C.red}ERROR: ${(e as Error).message}${C.reset}\n`);
    }
    if (stopped) return;
    this.flushBars();
    this.toPrompt();
  }

  // ===================================================================== ros2
  private ros2(lineIn: string, args: string[]) {
    const sim = this.rt.sim;
    if (args[0] === "run" && args[1] && args[1] !== "turtlesim") {
      if (!args[2]) { this.out(`usage: ros2 run <package> <executable>\n`); return this.toPrompt(); }
      return this.runProgram(this.rt.config.getCode(), lineIn, "ros2");
    }
    // cli.ts checks `ros2 run turtlesim …` at the wrong token index, so these two are handled here
    const r: ReturnType<typeof runCli> =
      args[0] === "run" && args[1] === "turtlesim"
        ? args[2] === "turtle_teleop_key"
          ? { kind: "teleop", text: "Reading from keyboard\r\n---------------------------\r\nUse arrow keys to move the turtle.\r\nUse G|B|V|C|D|E|R|T keys to rotate to absolute orientations. 'F' to cancel a rotation.\r\n'Q' to quit." }
          : args[2] === "turtlesim_node"
            ? { kind: "print", text: "[INFO] [turtlesim]: turtlesim_node is already running in the Roboverse X arena." }
            : { kind: "error", text: `No executable found: ${args[2] ?? ""}` }
        : runCli(lineIn);
    const live = () => {
      if (sim.ensureLive()) this.out(`[INFO] [${(Date.now() / 1000).toFixed(9)}] [turtlesim]: Resetting turtlesim.\n`);
    };
    switch (r.kind) {
      case "print": if (r.text) this.out(r.text.replace(/\r\n/g, "\n").replace(/\n?$/, "\n")); return this.toPrompt();
      case "error": this.out(`${C.red}${r.text}${C.reset}\n`); return this.toPrompt();
      case "clear-screen": this.term?.clear(); return this.toPrompt();
      case "apply": {
        live();
        this.begin("publishing");
        const isGoal = r.command.type === "rotate_abs";
        this.out(r.text.replace(/\r\n/g, "\n").replace(/\n+$/, "\n"));
        sim.world.apply(r.command);
        if (!isGoal) return this.toPrompt();
        // like real `ros2 action send_goal`: wait for the result, then print it
        const startTh = sim.world.theta;
        const off = sim.onLiveTick((w) => {
          if (w.rotTarget !== null) return;
          off();
          this.out(`Result:\n    delta: ${(w.theta - startTh).toFixed(6)}\n\nGoal finished with status: ${C.green}SUCCEEDED${C.reset}\n`);
          this.toPrompt();
        });
        this.interrupt = () => { off(); this.raw("^C\r\nCanceling goal...\r\nGoal canceled.\r\n"); sim.world.apply({ type: "cmd_vel", lx: 0, ly: 0, az: 0 }); this.toPrompt(); };
        return;
      }
      case "repeat": {
        live();
        this.begin("publishing");
        const [head, body] = r.text.split("__N__");
        this.out(head.replace(/\r\n/g, "\n"));
        const every = Math.max(1, Math.round(100 / r.rateHz));
        let n = 0;
        let next = sim.world.tick;
        const fire = () => {
          n++;
          sim.world.apply(r.command);
          this.out(`publishing #${n}: ${body}\n\n`);
          next = sim.world.tick + every;
          if (r.times !== null && n >= r.times) { off(); this.toPrompt(); }
        };
        const off = sim.onLiveTick((w) => { if (w.tick >= next) fire(); });
        fire();
        this.interrupt = () => { off(); this.raw("^C"); this.out("\n"); this.toPrompt(); };
        return;
      }
      case "echo": {
        this.begin("echo");
        const print = () => {
          const s = sim.snapshot();
          this.out(`x: ${s.pose.x}\ny: ${s.pose.y}\ntheta: ${s.pose.theta}\nlinear_velocity: ${s.linear}\nangular_velocity: ${s.angular}\n---\n`);
        };
        print();
        if (r.once) return this.toPrompt();
        const id = setInterval(print, 500);
        this.interrupt = () => { clearInterval(id); this.raw("^C"); this.out("\n"); this.toPrompt(); };
        return;
      }
      case "teleop": {
        live();
        this.mode = "teleop";
        this.rt.setActivity("teleop");
        this.out(r.text.replace(/\r\n/g, "\n") + "\n");
        const exit = () => { this.out("\n"); this.mode = "prompt"; this.toPrompt(); };
        this.teleopHandler = (key) => {
          const c = teleopKey(key);
          if (c === "quit") return exit();
          if (c === "cancel") { sim.world.apply({ type: "cmd_vel", lx: 0, ly: 0, az: 0 }); return; }
          if (c) sim.world.apply(c);
        };
        this.interrupt = () => { this.raw("^C"); exit(); };
        return;
      }
    }
  }
}
