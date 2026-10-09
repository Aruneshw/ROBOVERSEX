/**
 * Main-thread client for /rvx/python-worker.mjs (Pyodide in an ES-module worker).
 * - boots once, reports real download progress (wasm, stdlib, wheels)
 * - run(): streams simulation chunks while the program executes
 * - watchdog: a program that never yields for `runTimeoutMs` is killed and the worker is rebuilt
 */
import type { ScoreResult } from "@/sim/score";

export type Progress = { dl: number; file: string; loaded: number; total: number; done: boolean };
export type RunChunk = {
  t0: number;
  poses: number[];
  segments: [number, number, number, number, number, number, number, number, number][];
  clears: [number, number][];
  logs: { tick: number; level: string; msg: string }[];
  events: SimEvent[];
  tick: number;
  wall_hits: number;
};
export type SimEvent =
  | { tick: number; type: "spawn"; name: string; x: number; y: number; theta: number }
  | { tick: number; type: "kill"; name: string }
  | { tick: number; type: "teleport" };
export type WorkerRunResult = {
  status: "finished" | "time_limit" | "error";
  error: string | null;
  ticks: number;
  wall_hits: number;
  teleported: boolean;
  preview: ScoreResult | null;
};
export type BootInfo = { python: string; pyodide: string; packageBaseUrl: string; bootSec: number };

export type RuntimeEvents = {
  bootLog: (text: string, t: number) => void;
  progress: (p: Progress) => void;
  ready: (info: BootInfo) => void;
  bootError: (message: string) => void;
};

type Pending = {
  onChunk?: (c: RunChunk) => void;
  onText?: (t: string) => void;
  onStart?: (() => void) | undefined;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  watchdog?: ReturnType<typeof setTimeout>;
  timeoutMs?: number;
};

export type PythonRuntimeOptions = {
  workerUrl: string;
  indexURL: string;
  simBase: string;
  packageBaseUrl: string | null;
  runTimeoutMs: number;
};

const SIM_FILES = ["__init__.py", "engine.py", "shim.py", "score.py", "runner.py", "arena.py"];

export class TimeoutError extends Error {}
export class CancelledError extends Error {}

export class PythonRuntime {
  private worker: Worker | null = null;
  private bootPromise: Promise<BootInfo> | null = null;
  private pending = new Map<number, Pending>();
  private seq = 0;
  private listeners: { [K in keyof RuntimeEvents]: Set<RuntimeEvents[K]> } = {
    bootLog: new Set(), progress: new Set(), ready: new Set(), bootError: new Set(),
  };
  info: BootInfo | null = null;
  opts: PythonRuntimeOptions;
  constructor(opts: PythonRuntimeOptions) {
    this.opts = opts;
  }

  on<K extends keyof RuntimeEvents>(ev: K, cb: RuntimeEvents[K]): () => void {
    (this.listeners[ev] as Set<RuntimeEvents[K]>).add(cb);
    return () => (this.listeners[ev] as Set<RuntimeEvents[K]>).delete(cb);
  }
  private emit<K extends keyof RuntimeEvents>(ev: K, ...args: Parameters<RuntimeEvents[K]>) {
    for (const cb of this.listeners[ev]) (cb as (...a: Parameters<RuntimeEvents[K]>) => void)(...args);
  }

  get booted(): boolean { return this.info !== null; }
  get booting(): boolean { return this.bootPromise !== null && this.info === null; }

  boot(): Promise<BootInfo> {
    if (this.bootPromise) return this.bootPromise;
    const w = new Worker(this.opts.workerUrl, { type: "module", name: "rvx-python" });
    this.worker = w;
    this.bootPromise = new Promise<BootInfo>((resolve, reject) => {
      w.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        switch (m.type) {
          case "boot-log": this.emit("bootLog", m.text, m.t); break;
          case "progress": this.emit("progress", m as Progress); this.kick(); break;
          case "ready": this.info = m.info; this.emit("ready", m.info); resolve(m.info); break;
          case "boot-error":
            this.emit("bootError", m.message);
            reject(new Error(m.message));
            this.dispose();
            break;
          default: this.route(m);
        }
      };
      w.onerror = (e) => {
        const msg = e.message || "worker failed to load (check that /rvx/python-worker.mjs is served)";
        this.emit("bootError", msg);
        reject(new Error(msg));
        this.dispose();
      };
      w.postMessage({
        type: "boot",
        config: { indexURL: this.opts.indexURL, packageBaseUrl: this.opts.packageBaseUrl, simBase: this.opts.simBase, simFiles: SIM_FILES },
      });
    });
    return this.bootPromise;
  }

  /** Reset every active watchdog (downloads count as progress). */
  private kick() {
    for (const p of this.pending.values()) this.arm(p);
  }
  private arm(p: Pending) {
    if (!p.timeoutMs) return;
    if (p.watchdog) clearTimeout(p.watchdog);
    p.watchdog = setTimeout(() => {
      this.hardStop(new TimeoutError("watchdog"));
    }, p.timeoutMs);
  }

  private route(m: { type: string; id: number; [k: string]: unknown }) {
    const p = this.pending.get(m.id);
    if (!p) return;
    if (m.type !== "result" && m.type !== "done" && m.type !== "error") this.arm(p);
    switch (m.type) {
      case "run-start": p.timeoutMs = this.opts.runTimeoutMs; this.arm(p); p.onStart?.(); break;
      case "chunk": p.onChunk?.(JSON.parse(m.data as string) as RunChunk); break;
      case "pip-log": p.onText?.(String(m.text) + "\n"); break;
      case "stdout": p.onText?.(String(m.text)); break;
      case "result": this.finish(m.id, m.result); break;
      case "done": this.finish(m.id, { ok: m.ok, more: m.more }); break;
      case "error": this.fail(m.id, new Error(String(m.message))); break;
    }
  }
  private finish(id: number, v: unknown) {
    const p = this.pending.get(id);
    if (!p) return;
    if (p.watchdog) clearTimeout(p.watchdog);
    this.pending.delete(id);
    p.resolve(v);
  }
  private fail(id: number, e: Error) {
    const p = this.pending.get(id);
    if (!p) return;
    if (p.watchdog) clearTimeout(p.watchdog);
    this.pending.delete(id);
    p.reject(e);
  }

  private async call<T>(msg: Record<string, unknown>, p: Omit<Pending, "resolve" | "reject">): Promise<T> {
    await this.boot();
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { ...p, resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ ...msg, id });
    });
  }

  run(code: string, task: unknown, h: { onChunk: (c: RunChunk) => void; onText: (t: string) => void; onStart?: () => void }, chunkTicks = 10) {
    return this.call<WorkerRunResult>({ type: "run", code, task, chunkTicks }, { onChunk: h.onChunk, onText: h.onText, onStart: h.onStart });
  }
  pip(args: string[], onText: (t: string) => void) {
    return this.call<{ ok: boolean }>({ type: "pip", args }, { onText });
  }
  repl(line: string, onText: (t: string) => void) {
    return this.call<{ ok: boolean; more: boolean }>({ type: "repl", line }, { onText, timeoutMs: this.opts.runTimeoutMs * 2 });
  }
  replReset() { this.worker?.postMessage({ type: "repl-reset" }); }

  /** Kill whatever is running (Ctrl+C / Stop). The worker is rebuilt lazily on the next call. */
  hardStop(reason: Error = new CancelledError("interrupted")) {
    const busy = this.pending.size > 0;
    if (!busy) return false;
    const all = [...this.pending.values()];
    this.pending.clear();
    this.dispose();
    for (const p of all) { if (p.watchdog) clearTimeout(p.watchdog); p.reject(reason); }
    return true;
  }
  get busy(): boolean { return this.pending.size > 0; }

  private dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.bootPromise = null;
    this.info = null;
  }
}
