// public/rvx/python-worker.mjs
// Roboverse X Python runtime — ES MODULE worker (served as a static file, never bundled).
// Start it ONLY like this:   new Worker("/rvx/python-worker.mjs", { type: "module" })
// (Pyodide throws "Classic web workers are not supported" in a classic worker.)
//
// in : {type:"boot", config} | {type:"run", id, code, task, chunkTicks} | {type:"pip", id, args}
//      {type:"repl", id, line} | {type:"repl-reset"}
// out: {type:"boot-log", text} | {type:"progress", dl, file, loaded, total, done} | {type:"ready", info}
//      {type:"boot-error", message} | {type:"run-start", id} | {type:"chunk", id, data}
//      {type:"result", id, result} | {type:"pip-log", id, text} | {type:"stdout", id, text}
//      {type:"done", id, ok, more?} | {type:"error", id, message}

const post = (m) => self.postMessage(m);
let py = null;
let booting = null;
let lock = null;
let cfg = null;
let currentId = 0;
let dlSeq = 0;

// ---------------------------------------------------------------- real download progress
const rawFetch = self.fetch.bind(self);
self.fetch = async (input, init) => {
  const res = await rawFetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!res.ok || !res.body || !/\.(whl|zip|wasm|tar|tgz|tar\.gz|so|data)(\?|$)/i.test(url)) return res;
  const dl = ++dlSeq;
  const file = decodeURIComponent(url.split("?")[0].split("/").pop() || url);
  // with Content-Encoding the length is the compressed size, but the stream yields decoded bytes
  const encoded = !!res.headers.get("content-encoding") && res.headers.get("content-encoding") !== "identity";
  const total = encoded ? 0 : Number(res.headers.get("content-length")) || 0;
  let loaded = 0;
  let last = 0;
  post({ type: "progress", dl, file, loaded: 0, total, done: false });
  const reader = res.body.getReader();
  const body = new ReadableStream({
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) {
        post({ type: "progress", dl, file, loaded, total: Math.max(total, loaded), done: true });
        ctrl.close();
        return;
      }
      loaded += value.byteLength;
      const now = performance.now();
      if (now - last > 60) {
        last = now;
        post({ type: "progress", dl, file, loaded, total: total ? Math.max(total, loaded) : 0, done: false });
      }
      ctrl.enqueue(value);
    },
    cancel(reason) {
      reader.cancel(reason);
    },
  });
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
};

// ---------------------------------------------------------------- python glue (streams the sim live)
const GLUE = String.raw`
import sys, json, importlib.metadata as _md
sys.path.insert(0, "/home/pyodide")
import js
try:
    import rvx_sim.arena  # /spawn, /kill, /<name>/pose (Level 2 tasks)
except ImportError:
    pass
from rvx_sim import engine as _eng, runner as _runner
from rvx_sim.score import score_trace as _score

_S = {"arm": False, "w": None, "pi": 0, "si": 0, "li": 0, "ei": 0, "nseg": 0, "last": 0, "chunk": 10}

def _rvx_flush(w, final=False):
    s = _S
    end = len(w.poses) if final else max(s["pi"], len(w.poses) - 1)
    poses = []
    for (x, y, th) in w.poses[s["pi"]:end]:
        poses.extend((round(x, 5), round(y, 5), round(th, 5)))
    t0 = s["pi"]
    s["pi"] = end
    segs, clears = [], []
    for seg in w.segments[s["si"]:]:
        if seg[0] == "CLEAR":
            clears.append([seg[1], s["nseg"]])
        else:
            segs.append([seg[0], round(seg[1], 5), round(seg[2], 5), round(seg[3], 5), round(seg[4], 5),
                         seg[5], seg[6], seg[7], seg[8]])
            s["nseg"] += 1
    s["si"] = len(w.segments)
    logs = w.logs[s["li"]:]
    s["li"] = len(w.logs)
    events = [e for e in w.events[s["ei"]:] if e.get("type") in ("spawn", "kill", "teleport")]
    s["ei"] = len(w.events)
    s["last"] = w.tick
    if poses or segs or clears or logs or events or final:
        js.rvx_emit(json.dumps({"t0": t0, "poses": poses, "segments": segs, "clears": clears,
                                "logs": logs, "events": events, "tick": w.tick, "wall_hits": w.wall_hits}))

_orig_init = _eng.TurtleWorld.__init__
_orig_step = _eng.TurtleWorld.step

def _init(self, *a, **k):
    _orig_init(self, *a, **k)
    if _S["arm"]:
        _S.update(arm=False, w=self, pi=0, si=0, li=0, ei=0, nseg=0, last=0)

def _step(self):
    _orig_step(self)
    if _S["w"] is self and self.tick - _S["last"] >= _S["chunk"]:
        _rvx_flush(self)

_eng.TurtleWorld.__init__ = _init
_eng.TurtleWorld.step = _step

def _rvx_run(code, run_task_json, chunk):
    # run_task has NO target strokes: participant code can inspect its call stack, so the
    # target only enters Python afterwards, in _rvx_score().
    run_task = json.loads(run_task_json)
    _S.update(arm=True, w=None, chunk=max(1, int(chunk)))
    trace = _runner.run_program(code, run_task)
    run_task = None
    w = _S["w"]
    if w is not None:
        _rvx_flush(w, final=True)
    _S["w"] = None
    _S["trace"] = trace
    return json.dumps({"status": trace["status"], "error": trace["error"], "ticks": trace["ticks"],
                       "wall_hits": trace["wall_hits"],
                       "teleported": any(e["type"] == "teleport" for e in trace["events"]), "preview": None})

def _rvx_score(task_json):
    task = json.loads(task_json)
    trace = _S.pop("trace", None)
    if trace is None or not ((task.get("target") or {}).get("strokes")):
        return "null"
    return json.dumps(_score(trace, task))

import code as _code
_repl = _code.InteractiveConsole({"__name__": "__console__"})

def _rvx_repl(line):
    return _repl.push(line)

def _rvx_repl_reset():
    global _repl
    _repl = _code.InteractiveConsole({"__name__": "__console__"})

def _rvx_version(name):
    try:
        return _md.version(name)
    except Exception:
        return None

def _rvx_pip_list():
    rows = sorted({(d.metadata["Name"], d.version) for d in _md.distributions() if d.metadata["Name"]},
                  key=lambda r: r[0].lower())
    return json.dumps(rows)
`;

async function boot(config) {
  cfg = config;
  const t0 = performance.now();
  const log = (text) => post({ type: "boot-log", text, t: (performance.now() - t0) / 1000 });
  log("rvx-kernel: booting Roboverse X runtime (wasm32-emscripten)");
  const mod = await import(/* webpackIgnore: true */ `${config.indexURL}pyodide.mjs`);
  const version = mod.version;
  const packageBaseUrl = config.packageBaseUrl || `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
  py = await mod.loadPyodide({ indexURL: config.indexURL, packageBaseUrl });
  const pyver = py.runPython("import sys; sys.version.split()[0]");
  log(`python: CPython ${pyver} (Pyodide ${version}) ready`);
  lock = await (await rawFetch(`${config.indexURL}pyodide-lock.json`)).json().catch(() => ({ packages: {} }));
  py.FS.mkdirTree("/home/pyodide/rvx_sim");
  for (const f of [...config.simFiles, ...(config.optionalSimFiles || [])]) {
    const r = await rawFetch(`${config.simBase}${f}`, { cache: "no-cache" });
    if (!r.ok) {
      const fix = "restart `npm run dev` (or run: node scripts/copy-pyodide.mjs) to copy packages/rvx-sim into public/py";
      if (config.simFiles.includes(f)) throw new Error(`cannot fetch ${config.simBase}${f} (HTTP ${r.status}) — ${fix}`);
      log(`\x1b[33mrvx_sim: ${f} not found (HTTP ${r.status}) — /spawn is disabled until you ${fix}\x1b[0m`);
      continue;
    }
    py.FS.writeFile(`/home/pyodide/rvx_sim/${f}`, await r.text());
  }
  self.rvx_emit = (s) => post({ type: "chunk", id: currentId, data: s });
  py.runPython(GLUE);
  py.setStdout({ batched: (s) => post({ type: "stdout", id: currentId, text: s + "\n" }) });
  py.setStderr({ batched: (s) => post({ type: "stdout", id: currentId, text: s + "\n" }) });
  py.setStdin({ error: true });
  log("rvx_sim: mounted /opt/rvx/rvx_sim (engine, rclpy shim, scorer)");
  post({ type: "ready", info: { python: pyver, pyodide: version, packageBaseUrl, bootSec: (performance.now() - t0) / 1000 } });
}

// ---------------------------------------------------------------- pip
const norm = (n) => n.toLowerCase().replace(/[-_.]+/g, "-");
function lockName(name) {
  const pk = lock?.packages || {};
  const n = norm(name);
  if (pk[n]) return n;
  for (const [k, v] of Object.entries(pk)) {
    if (norm(v.name || k) === n || (v.imports || []).some((i) => norm(i) === n)) return k;
  }
  return null;
}
const loadedSet = () => new Set(Object.keys(py.loadedPackages || {}));

async function ensureMicropip(say) {
  if (py.loadedPackages?.micropip) return;
  await py.loadPackage(["micropip"], { messageCallback: () => {}, errorCallback: (m) => say(m) });
}

async function pip(id, args) {
  const say = (text) => post({ type: "pip-log", id, text });
  const sub = args[0];
  if (sub === "list" || sub === "freeze") {
    const rows = JSON.parse(py.globals.get("_rvx_pip_list")());
    if (sub === "freeze") rows.forEach(([n, v]) => say(`${n}==${v}`));
    else {
      const w = Math.max(7, ...rows.map(([n]) => n.length));
      say(`${"Package".padEnd(w)} Version`);
      say(`${"-".repeat(w)} ${"-".repeat(10)}`);
      rows.forEach(([n, v]) => say(`${n.padEnd(w)} ${v}`));
    }
    return true;
  }
  if (sub === "show") {
    const name = args[1];
    const v = name && py.globals.get("_rvx_version")(name);
    if (!v) {
      say(`\x1b[33mWARNING: Package(s) not found: ${name ?? ""}\x1b[0m`);
      return false;
    }
    say(`Name: ${name}\nVersion: ${v}\nLocation: /lib/python3/site-packages`);
    return true;
  }
  if (sub === "uninstall") {
    await ensureMicropip(say);
    for (const n of args.slice(1).filter((a) => !a.startsWith("-"))) {
      const v = py.globals.get("_rvx_version")(n);
      if (!v) { say(`\x1b[33mWARNING: Skipping ${n} as it is not installed.\x1b[0m`); continue; }
      say(`Found existing installation: ${n} ${v}\nUninstalling ${n}-${v}:`);
      py.globals.set("_rvx_un", n);
      await py.runPythonAsync("import micropip\nmicropip.uninstall(_rvx_un)");
      say(`  Successfully uninstalled ${n}-${v}`);
    }
    return true;
  }
  if (sub !== "install") {
    say(`ERROR: unknown command "${sub ?? ""}" (supported: install, uninstall, list, freeze, show)`);
    return false;
  }
  const names = args.slice(1).filter((a) => !a.startsWith("-"));
  if (!names.length) { say("\x1b[31mERROR: You must give at least one requirement to install\x1b[0m"); return false; }
  const before = loadedSet();
  let ok = true;
  for (const raw of names) {
    const name = raw.split(/[=<>!~;\[]/)[0];
    const have = py.globals.get("_rvx_version")(name);
    if (have) {
      say(`Requirement already satisfied: ${name} in /lib/python3/site-packages (${have})`);
      continue;
    }
    say(`Collecting ${raw}`);
    const ln = lockName(name);
    try {
      if (ln) {
        const errors = [];
        await py.loadPackage([ln], { messageCallback: () => {}, errorCallback: (m) => errors.push(m) });
        if (!py.loadedPackages[ln]) throw new Error(errors.join("\n") || `could not load ${ln}`);
      } else {
        await ensureMicropip(say);
        py.globals.set("_rvx_req", raw);
        await py.runPythonAsync("import micropip\nawait micropip.install(_rvx_req, keep_going=True)");
      }
    } catch (e) {
      ok = false;
      const msg = String(e?.message ?? e).split("\n").filter(Boolean).slice(-2).join("\n");
      say(`\x1b[31mERROR: Could not install ${raw}: ${msg}\x1b[0m`);
      say(`\x1b[31mERROR: No matching distribution found for ${raw}\x1b[0m`);
    }
  }
  const requested = new Set(names.map((n) => norm(n.split(/[=<>!~;\[]/)[0])));
  const added = [...loadedSet()].filter((n) => !before.has(n) && (n !== "micropip" || requested.has("micropip")));
  if (added.length) {
    const ver = (n) => py.globals.get("_rvx_version")(n) || lock?.packages?.[n]?.version || "";
    say(`Installing collected packages: ${added.join(", ")}`);
    say(`Successfully installed ${added.map((n) => `${n}-${ver(n)}`).join(" ")}`);
  }
  return ok;
}

// ---------------------------------------------------------------- message loop
self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === "boot") {
      booting ??= boot(m.config).catch((e) => {
        booting = null;
        post({ type: "boot-error", message: String(e?.message ?? e) });
        throw e;
      });
      await booting;
      return;
    }
    if (!booting) throw new Error("runtime not booted");
    await booting;
    currentId = m.id ?? 0;
    if (m.type === "run") {
      // auto-install packages imported by the program (numpy, …) with live progress
      await py.loadPackagesFromImports(m.code, {
        messageCallback: (s) => /^Loading /.test(s) && post({ type: "pip-log", id: m.id, text: s.replace(/^Loading/, "Collecting") }),
        errorCallback: (s) => post({ type: "pip-log", id: m.id, text: `\x1b[33mWARNING: ${s}\x1b[0m` }),
      }).catch(() => {});
      post({ type: "run-start", id: m.id });
      const target = m.task?.target ?? null;
      const runTask = { ...m.task, target: target ? { ...target, strokes: [] } : null };
      const result = JSON.parse(py.globals.get("_rvx_run")(m.code, JSON.stringify(runTask), m.chunkTicks ?? 10));
      result.preview = JSON.parse(py.globals.get("_rvx_score")(JSON.stringify(m.task)));
      post({ type: "result", id: m.id, result });
    } else if (m.type === "pip") {
      const ok = await pip(m.id, m.args);
      post({ type: "done", id: m.id, ok });
    } else if (m.type === "repl") {
      await py.loadPackagesFromImports(m.line).catch(() => {});
      const more = py.globals.get("_rvx_repl")(m.line);
      post({ type: "done", id: m.id, ok: true, more: !!more });
    } else if (m.type === "repl-reset") {
      py.globals.get("_rvx_repl_reset")();
    }
  } catch (e) {
    post({ type: "error", id: m.id, message: String(e?.message ?? e) });
  }
};
