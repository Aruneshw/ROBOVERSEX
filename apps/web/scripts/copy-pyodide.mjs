// apps/web/scripts/copy-pyodide.mjs
// Copies the Pyodide runtime and the rvx_sim Python package into public/ so the browser
// can run participant code offline (no CDN). Runs automatically via "predev" and "prebuild".
import { cpSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const require = createRequire(import.meta.url);

// 1) Pyodide core files
const pyodideDir = dirname(require.resolve("pyodide/package.json"));
const outPy = join(webRoot, "public", "pyodide");
mkdirSync(outPy, { recursive: true });
for (const f of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
  const src = join(pyodideDir, f);
  if (!existsSync(src)) throw new Error(`pyodide file missing: ${src} (check the installed pyodide version)`);
  cpSync(src, join(outPy, f));
}

// 2) rvx_sim package (single source of truth for browser preview AND server judge)
const simSrc = join(webRoot, "..", "..", "packages", "rvx-sim", "rvx_sim");
const outSim = join(webRoot, "public", "py", "rvx_sim");
mkdirSync(outSim, { recursive: true });
for (const f of readdirSync(simSrc).filter((n) => n.endsWith(".py"))) cpSync(join(simSrc, f), join(outSim, f));

console.log(`[copy-pyodide] pyodide -> ${outPy}\n[copy-pyodide] rvx_sim -> ${outSim}`);
