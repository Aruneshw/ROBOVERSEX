/// <reference lib="webworker" />
/**
 * RVX Pyodide worker — runs Level-2 participant code in the browser for live preview.
 * The SAME rvx_sim Python files are served from /py/rvx_sim/*.py (copied at build time
 * from packages/rvx_sim) so preview and official judge can never drift apart.
 *
 * Messages in : { id, type: "run", code, task }
 * Messages out: { id, type: "ready" } | { id, type: "log", line } | { id, type: "result", result } | { id, type: "error", message }
 * Create it as a MODULE worker:
 *   new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" })
 * The main thread must terminate() and recreate this worker if no result arrives within RUN_WALL_TIMEOUT_MS
 * (a `while True: pass` cannot be interrupted any other way).
 */
// Pyodide is SELF-HOSTED: scripts/copy-pyodide.mjs copies node_modules/pyodide/{pyodide.mjs,
// pyodide.asm.mjs, pyodide.asm.wasm, python_stdlib.zip, pyodide-lock.json} into public/pyodide/.
// Works offline / on campus LAN, no CDN dependency. Tested with pyodide@314.0.7 (Python 3.14).
const PYODIDE_BASE = "/pyodide/";
const PY_FILES = ["__init__.py", "engine.py", "shim.py", "score.py", "runner.py"];

type PyodideAPI = {
  runPython: (code: string) => unknown;
  globals: { get: (name: string) => any; set: (name: string, v: unknown) => void };
  FS: { mkdirTree: (p: string) => void; writeFile: (p: string, data: string) => void };
  setStdout: (o: { batched: (s: string) => void }) => void;
  setStderr: (o: { batched: (s: string) => void }) => void;
};

let pyodideReady: Promise<PyodideAPI> | null = null;
let currentId = 0;

async function boot(): Promise<PyodideAPI> {
  // Runtime import from /public — tell the bundler not to touch it.
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${PYODIDE_BASE}pyodide.mjs`);
  const py: PyodideAPI = await mod.loadPyodide({ indexURL: PYODIDE_BASE });
  py.FS.mkdirTree("/home/pyodide/rvx_sim");
  for (const f of PY_FILES) {
    const src = await (await fetch(`/py/rvx_sim/${f}`, { cache: "no-cache" })).text();
    py.FS.writeFile(`/home/pyodide/rvx_sim/${f}`, src);
  }
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide'); import rvx_sim.runner");
  // print() from participant code goes to the console panel
  py.setStdout({ batched: (s) => postMessage({ id: currentId, type: "log", line: s }) });
  py.setStderr({ batched: (s) => postMessage({ id: currentId, type: "log", line: s }) });
  return py;
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, type, code, task } = ev.data as { id: number; type: string; code: string; task: unknown };
  try {
    pyodideReady ??= boot();
    const py = await pyodideReady;
    if (type === "warmup") { postMessage({ id, type: "ready" }); return; }
    if (type !== "run") return;
    currentId = id;
    py.globals.set("_rvx_code", code);
    py.globals.set("_rvx_task_json", JSON.stringify(task));
    const json = py.runPython(`
import json
from rvx_sim.runner import run_program
from rvx_sim.score import score_trace
_task = json.loads(_rvx_task_json)
_trace = run_program(_rvx_code, _task)
_trace["preview"] = score_trace(_trace, _task)
json.dumps(_trace)
`) as string;
    postMessage({ id, type: "result", result: JSON.parse(json) });
  } catch (e) {
    postMessage({ id, type: "error", message: String((e as Error)?.message ?? e) });
  }
};
