"use client";

import { useEffect, useRef, useState } from "react";
import { RvxSimulator, RvxTerminal, TASKS, rvx, useRvx, useTaskFlow } from "@/rvx-runtime";

/**
 * Reference integration of the full arena flow:
 * task list (locked → current → passed) · editor · simulator · telemetry · terminal · auto evaluation · SUBMIT RUN.
 */
export function ArenaDemo({ preview = false }: { preview?: boolean }) {
  const [code, setCode] = useState("");
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);
  const s = useRvx();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    rvx.configure({ user: "arunesh", host: "roboverse-x", fileName: "solution.py", getCode: () => codeRef.current });
  }, []);

  const flow = useTaskFlow({
    participantId: preview ? "organiser-preview" : "RVX-001",
    tasks: preview ? TASKS : undefined,
    unlockAll: preview,
    code,
    setCode: (c) => { codeRef.current = c; setCode(c); },
    onSubmit: async (task) => {
      // replace with your API call (POST /api/submissions); throw to keep the task open
      setToast(`${task.title} completed ✔`);
      setTimeout(() => setToast(null), 3000);
    },
  });
  const task = flow.current;

  const mono: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1C2A4A" }}>
      <span style={{ color: "#8EA0C4" }}>{k}</span>
      <span style={mono}>{v}</span>
    </div>
  );
  const btn: React.CSSProperties = { padding: "7px 12px", borderRadius: 6, border: "1px solid #2A3D66", background: "#101B33", color: "#E7EEFC", cursor: "pointer" };
  const stateColor = { locked: "#5C6F96", available: "#8EA0C4", current: "#3D7BFF", passed: "#2BD98C" } as const;

  return (
    <main style={{ display: "grid", gridTemplateColumns: "290px 1fr 1fr", gridTemplateRows: "360px 1fr auto", gap: 12, padding: 12, height: "100dvh", boxSizing: "border-box", color: "#E7EEFC", fontSize: 13 }}>
      <aside style={{ gridRow: "1 / 4", background: "#0B1326", border: "1px solid #1C2A4A", borderRadius: 10, padding: 12, overflow: "auto" }}>
        <div style={{ color: "#8EA0C4", marginBottom: 8 }}>{flow.completed} / {flow.total} completed</div>
        {flow.tasks.map((t) => (
          <button
            key={t.task.id}
            data-task={t.task.id}
            data-state={t.state}
            disabled={t.state === "locked"}
            onClick={() => flow.select(t.task.id)}
            style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8, padding: 10, borderRadius: 8, background: "#101B33", color: "#E7EEFC",
              border: `1px solid ${t.state === "current" ? "#3D7BFF" : "#1C2A4A"}`, opacity: t.state === "locked" ? 0.5 : 1, cursor: t.state === "locked" ? "not-allowed" : "pointer" }}
          >
            <div style={{ fontWeight: 600 }}>Task {t.task.task}{t.task.card && t.task.task === 4 ? ` · Card ${t.task.card}` : ""}: {t.task.title.replace(/^Card \d · /, "")}</div>
            <div style={{ color: "#8EA0C4", fontSize: 12, margin: "4px 0" }}>{t.task.summary}</div>
            <span style={{ color: stateColor[t.state], fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>
              {t.state === "current" ? "in progress" : t.state}{t.score != null ? ` · ${t.score.toFixed(2)}%` : ""}
            </span>
          </button>
        ))}
        {flow.allDone && <div style={{ color: "#2BD98C", fontWeight: 600 }}>All missions complete!</div>}
        <button style={{ ...btn, marginTop: 8, fontSize: 11 }} onClick={flow.resetProgress}>reset progress (testing)</button>
      </aside>

      <section style={{ gridColumn: "2 / 4", display: "grid", gridTemplateColumns: "1fr 260px", border: "1px solid #1C2A4A", borderRadius: 10, overflow: "hidden" }}>
        <RvxSimulator />
        <div style={{ background: "#0B1326", padding: 12, overflow: "auto" }}>
          <div style={{ fontWeight: 600 }}>{task.title}</div>
          <div style={{ color: "#8EA0C4", fontSize: 12, margin: "4px 0 8px" }}>{task.summary}</div>
          {row("State", `${s.runtime} · ${s.activity}`)}
          {row("x / y", `${s.pose.x.toFixed(3)} / ${s.pose.y.toFixed(3)}`)}
          {row("θ (rad)", s.pose.theta.toFixed(3))}
          {row("Linear / Angular", `${s.linear.toFixed(2)} / ${s.angular.toFixed(2)}`)}
          {row("Sim time", `${s.simTime.toFixed(2)} s`)}
          {s.goal && row("Distance to goal", s.distance === null ? "—" : s.distance.toFixed(3))}
          {task.guards && row("Closest guard", s.closestGuard ? `${s.closestGuard.distance.toFixed(2)} (${s.closestGuard.name})` : "—")}
          {flow.evaluation?.score != null && row("Shape match", `${flow.evaluation.score.toFixed(2)} %`)}
          {flow.evaluation?.rubric && row("Rubric (auto)", `${flow.evaluation.rubric.auto} / ${flow.evaluation.rubric.autoMax} (+5 judge)`)}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", border: "1px solid #1C2A4A", borderRadius: 10, overflow: "hidden", minHeight: 0 }}>
        <textarea
          aria-label="solution.py"
          spellCheck={false}
          value={code}
          onChange={(e) => { codeRef.current = e.target.value; setCode(e.target.value); flow.saveDraft(e.target.value); }}
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

      <section style={{ gridColumn: "2 / 4", display: "flex", alignItems: "center", gap: 16, padding: "10px 14px", background: "#0B1326", border: "1px solid #1C2A4A", borderRadius: 10 }}>
        <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>AUTO EVALUATION</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, flex: 1 }}>
          {flow.checks.map((c) => (
            <div key={c.id} title={c.detail} data-check={c.id} data-ok={c.ok}>
              <span style={{ color: flow.evaluation ? (c.ok ? "#2BD98C" : "#FF5470") : "#5C6F96" }}>{flow.evaluation ? (c.ok ? "✔" : "✖") : "○"}</span>{" "}
              {c.label}
              <div style={{ ...mono, color: "#8EA0C4", fontSize: 11 }}>{c.detail}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center" }}>
          <button
            onClick={flow.submit}
            disabled={!flow.canSubmit}
            title={flow.submitHint}
            style={{ ...btn, padding: "10px 18px", fontWeight: 700, background: flow.canSubmit ? "#3D7BFF" : "#1C2A4A", borderColor: flow.canSubmit ? "#3D7BFF" : "#2A3D66", cursor: flow.canSubmit ? "pointer" : "not-allowed" }}
          >
            {flow.submitting ? "SUBMITTING…" : "SUBMIT RUN"}
          </button>
          <div style={{ color: "#8EA0C4", fontSize: 11, marginTop: 4 }}>{flow.submitError ?? flow.submitHint}</div>
        </div>
      </section>
      {toast && (
        <div role="status" style={{ position: "fixed", right: 20, top: 20, background: "#0E2A1E", border: "1px solid #2BD98C", color: "#2BD98C", padding: "10px 14px", borderRadius: 8, fontWeight: 600 }}>{toast}</div>
      )}
    </main>
  );
}
