"use client";

import { useEffect, useRef, useState } from "react";
import { RvxSimulator, RvxTerminal, TASKS, getTask, rvx, useRvx } from "@/rvx-runtime";

/** Reference integration: task picker + editor + simulator + telemetry + terminal + auto-evaluation. */
export default function RvxDemo() {
  const [taskId, setTaskId] = useState(TASKS[0].id);
  const task = getTask(taskId);
  const [code, setCode] = useState(task.starterCode);
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);
  const s = useRvx();

  useEffect(() => {
    rvx.configure({ user: "arunesh", host: "roboverse-x", fileName: "solution.py", getCode: () => codeRef.current });
  }, []);
  useEffect(() => {
    rvx.setTask(getTask(taskId));
  }, [taskId]);

  const pick = (id: string) => { setTaskId(id); setCode(getTask(id).starterCode); };
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1C2A4A" }}>
      <span style={{ color: "#8EA0C4" }}>{k}</span>
      <span style={mono}>{v}</span>
    </div>
  );
  const btn: React.CSSProperties = { padding: "7px 12px", borderRadius: 6, border: "1px solid #2A3D66", background: "#101B33", color: "#E7EEFC", cursor: "pointer" };
  const ev = s.evaluation;

  return (
    <main style={{ display: "grid", gridTemplateColumns: "300px 1fr 1fr", gridTemplateRows: "380px 1fr", gap: 12, padding: 12, height: "100dvh", boxSizing: "border-box", color: "#E7EEFC", fontSize: 13 }}>
      <aside style={{ gridRow: "1 / 3", background: "#0B1326", border: "1px solid #1C2A4A", borderRadius: 10, padding: 12, overflow: "auto" }}>
        <label style={{ color: "#8EA0C4" }} htmlFor="task">Task</label>
        <select id="task" value={taskId} onChange={(e) => pick(e.target.value)} style={{ width: "100%", margin: "6px 0 12px", padding: 6, background: "#101B33", color: "#E7EEFC", border: "1px solid #2A3D66", borderRadius: 6 }}>
          {TASKS.map((t) => (
            <option key={t.id} value={t.id}>PS{t.ps} · Task {t.task}{t.card ? ` · Card ${t.card}` : ""} — {t.title}</option>
          ))}
        </select>
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>{task.title}</h2>
        <p style={{ color: "#8EA0C4", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{task.descriptionMd.replace(/\*\*/g, "")}</p>
        <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>Auto evaluation {ev ? (ev.passed ? "· PASSED" : "· not yet") : ""}</h3>
        {(ev?.checks ?? task.checks.map((c) => ({ id: c, label: c, ok: false, detail: "run your code" }))).map((c) => (
          <div key={c.id} style={{ padding: "4px 0", borderBottom: "1px solid #1C2A4A" }}>
            <span style={{ color: ev ? (c.ok ? "#2BD98C" : "#FF5470") : "#5C6F96" }}>{ev ? (c.ok ? "✔" : "✖") : "○"}</span> {c.label}
            {c.detail && <div style={{ ...mono, color: "#8EA0C4", fontSize: 11, marginLeft: 16 }}>{c.detail}</div>}
          </div>
        ))}
      </aside>

      <section style={{ gridColumn: "2 / 4", display: "grid", gridTemplateColumns: "1fr 260px", border: "1px solid #1C2A4A", borderRadius: 10, overflow: "hidden" }}>
        <RvxSimulator />
        <div style={{ background: "#0B1326", padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Telemetry</div>
          {row("State", `${s.runtime} · ${s.activity}`)}
          {row("x / y", `${s.pose.x.toFixed(3)} / ${s.pose.y.toFixed(3)}`)}
          {row("θ (rad)", s.pose.theta.toFixed(3))}
          {row("Linear / Angular", `${s.linear.toFixed(2)} / ${s.angular.toFixed(2)}`)}
          {row("Sim time", `${s.simTime.toFixed(2)} s`)}
          {s.goal && row("Distance to goal", s.distance === null ? "—" : s.distance.toFixed(3))}
          {task.guards && row("Closest guard", s.closestGuard ? `${s.closestGuard.distance.toFixed(2)} (${s.closestGuard.name})` : "—")}
          {s.evaluation?.score != null && row("Shape match", `${s.evaluation.score.toFixed(2)} %`)}
          {row("Last run", s.lastRun ? s.lastRun.status : "—")}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", border: "1px solid #1C2A4A", borderRadius: 10, overflow: "hidden", minHeight: 0 }}>
        <textarea
          aria-label="solution.py"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ flex: 1, background: "#0B1326", color: "#D6E2FF", border: 0, padding: 12, ...mono, fontSize: 12.5, resize: "none", outline: "none" }}
        />
        <div style={{ display: "flex", gap: 8, padding: 8, background: "#101B33" }}>
          <button style={{ ...btn, background: "#3D7BFF", borderColor: "#3D7BFF" }} onClick={() => rvx.run()}>Run code</button>
          <button style={btn} onClick={() => rvx.stop()}>Stop</button>
          <button style={btn} onClick={() => rvx.reset()}>Reset</button>
          <button style={btn} onClick={() => rvx.setSpeed(4)}>4×</button>
          <button style={btn} onClick={() => rvx.setSpeed(1)}>1×</button>
          <button style={btn} onClick={() => rvx.clearTerminal()}>Clear</button>
        </div>
      </section>
      <section style={{ border: "1px solid #1C2A4A", borderRadius: 10, overflow: "hidden", minHeight: 0 }}>
        <RvxTerminal />
      </section>
    </main>
  );
}
