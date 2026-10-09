"use client";

import { Play, RotateCcw, Settings, Trash2, X, Send } from "lucide-react";
import { RvxSimulator, RvxTerminal, rvx, useRvx } from "@/rvx-runtime";
import ReactMarkdown from "react-markdown";

export function MainWorkspace({ flow, code, setCode }: { flow: any, code: string, setCode: (c: string) => void }) {
  const s = useRvx();

  if (flow.allDone) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0f1c] text-white">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <svg viewBox="0 0 24 24" width="40" height="40" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <h1 className="text-4xl font-black tracking-tight">All missions complete!</h1>
        <p className="text-slate-400 mt-2">You have successfully finished all Level 2 tasks.</p>
      </div>
    );
  }

  const task = flow.current;

  return (
    <div className="flex-1 flex flex-col bg-[#0a0f1c] min-w-0 p-4 gap-4 overflow-y-auto">
      
      {/* Task Status Bar */}
      <div className="flex items-center justify-between bg-[#11192b] border border-slate-700/50 rounded-xl p-4 shrink-0">
        <div className="flex items-center gap-4 flex-1 pr-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-bold text-lg truncate">{task.title}</h2>
            <div className="text-slate-400 text-xs mt-1 max-h-16 overflow-y-auto custom-scrollbar markdown-preview">
              <ReactMarkdown>{task.descriptionMd.replace(/\\*\\*/g, "")}</ReactMarkdown>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button 
            onClick={flow.submit}
            disabled={!flow.canSubmit}
            className={`font-bold h-10 px-6 rounded-md shadow-sm relative overflow-hidden transition-all ${
              flow.canSubmit 
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer" 
                : "bg-blue-400/20 text-blue-300/40 cursor-not-allowed"
            }`}
          >
            <span className="relative z-10 flex items-center gap-2">
              <Send className="w-4 h-4" /> SUBMIT RUN
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        
        {/* Left Column: Code Editor */}
        <div className="flex-1 flex flex-col bg-[#11192b] border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
          <div className="flex items-center justify-between px-4 py-2 bg-[#1a2333] border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="flex space-x-1">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="px-3 py-1 bg-[#0f172a] rounded-md text-xs font-mono text-slate-300 border border-slate-700 flex items-center gap-2">
                solution.py <X className="w-3 h-3 text-slate-500 cursor-pointer hover:text-white" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => rvx.run()}
                className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold shadow-sm transition-all bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <Play className="w-4 h-4 fill-current" /> RUN CODE
              </button>
            </div>
          </div>
          <div className="flex-1 w-full bg-[#1e1e1e]">
            <textarea
              value={code}
              onChange={e => {
                const v = e.target.value ?? "";
                setCode(v);
                flow.saveDraft(v);
              }}
              className="w-full h-full bg-transparent text-slate-300 font-mono text-sm p-4 focus:outline-none resize-none custom-scrollbar"
              spellCheck="false"
            />
          </div>
        </div>

        {/* Right Column: Simulation & Info */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          
          <div className="flex-[1.2] flex gap-4 min-h-0">
            {/* Simulation Canvas */}
            <div className="flex-1 bg-[#11192b] border border-slate-700/50 rounded-xl p-4 flex flex-col shadow-lg overflow-hidden">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="font-bold text-slate-200 text-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  LIVE SIMULATION
                </div>
                <button onClick={() => rvx.reset()} className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 px-3 py-1 bg-slate-800 rounded-md transition-colors border border-slate-700">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <div style={{ width: "100%", height: "100%", minHeight: 240 }}>
                  <RvxSimulator />
                </div>
              </div>
            </div>

            {/* Simulation Info */}
            <div className="w-56 bg-[#11192b] border border-slate-700/50 rounded-xl p-4 flex flex-col gap-4 shadow-lg shrink-0 overflow-y-auto custom-scrollbar">
              <h3 className="font-bold text-slate-200 text-sm border-b border-slate-700/50 pb-2">TELEMETRY</h3>
              
              <div className="space-y-4">
                <InfoGroup title="POSITION">
                  <InfoRow label="X" value={s.pose?.x?.toFixed(3) || "0.000"} />
                  <InfoRow label="Y" value={s.pose?.y?.toFixed(3) || "0.000"} />
                  <InfoRow label="θ (rad)" value={s.pose?.theta?.toFixed(3) || "0.000"} />
                </InfoGroup>

                <InfoGroup title="VELOCITY">
                  <InfoRow label="Linear" value={s.linear?.toFixed(3) || "0.000"} />
                  <InfoRow label="Angular" value={s.angular?.toFixed(3) || "0.000"} />
                </InfoGroup>

                <InfoGroup title="STATUS">
                  <InfoRow label="Sim Time" value={(s.simTime?.toFixed(2) || "0.00") + "s"} />
                  <InfoRow label="Distance" value={s.distance == null ? "-" : s.distance.toFixed(3)} />
                  <InfoRow label="State" value={s.activity || "-"} highlight={s.activity === "running"} />
                  {task.guards && <InfoRow label="Closest guard" value={s.closestGuard ? `${s.closestGuard.distance.toFixed(2)} (${s.closestGuard.name})` : "-"} />}
                  {s.evaluation?.score != null && <InfoRow label="Shape match" value={`${s.evaluation.score.toFixed(2)} %`} />}
                </InfoGroup>
              </div>
            </div>
          </div>

          {/* Output Terminal */}
          <div className="flex-[0.8] flex flex-col bg-[#11192b] border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
            <div className="flex items-center justify-between px-2 bg-[#1a2333] border-b border-slate-700/50">
              <div className="flex">
                <button className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-blue-400 border-b-2 border-blue-400">
                  <Play className="w-3 h-3 fill-current" /> OUTPUT
                </button>
              </div>
              <button onClick={() => rvx.clearTerminal()} className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 pr-2">
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
            
            <div className="flex-1 min-h-0 bg-[#050A16]">
              <RvxTerminal />
            </div>
          </div>
        </div>
      </div>

      {/* Auto Evaluation Footer */}
      <div className="bg-white border-t border-slate-200 rounded-xl p-4 flex items-center justify-between text-slate-800 shadow-sm mt-auto mb-2 shrink-0">
        <div className="flex items-center gap-3 w-48 shrink-0">
          <Settings className="w-6 h-6 text-blue-600" />
          <div>
            <div className="font-black text-sm uppercase">AUTO EVALUATION</div>
            <div className="text-[10px] font-medium text-slate-500">{flow.canSubmit ? "Ready to submit" : "Not yet passed"}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-6 flex-1 overflow-x-auto px-4 custom-scrollbar">
          {flow.checks.map((c: any) => (
            <EvalCheckItem 
              key={c.id}
              title={c.label} 
              desc={c.detail || (c.ok ? "Passed" : "Pending")} 
              passed={c.ok} 
            />
          ))}
        </div>
          
        <div className="pl-6 border-l border-slate-200 shrink-0 flex flex-col items-center">
          <button 
            onClick={flow.submit}
            disabled={!flow.canSubmit}
            className={`font-bold h-10 px-8 rounded-md shadow-sm relative overflow-hidden transition-all ${
              flow.canSubmit 
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer" 
                : "bg-blue-400/50 text-white cursor-not-allowed"
            }`}
          >
            <span className="relative z-10 flex items-center gap-2">
              <Send className="w-4 h-4" /> SUBMIT FINAL RUN
            </span>
          </button>
          {flow.submitHint && (
            <div className="text-[10px] text-slate-500 mt-1">{flow.submitHint}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoGroup({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-500 mb-2 tracking-wider">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, highlight = false, color = "emerald" }: { label: string, value: string, highlight?: boolean, color?: "emerald" | "red" }) {
  const highlightColor = color === "red" ? "text-red-400 bg-red-400/10" : "text-emerald-400 bg-emerald-400/10";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400 truncate max-w-[100px]">{label}</span>
      <span className={`font-mono font-medium px-1.5 py-0.5 rounded truncate ${highlight ? highlightColor : "text-slate-200"}`}>{value}</span>
    </div>
  );
}

function EvalCheckItem({ title, desc, passed }: { title: string, desc: string, passed: boolean }) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        passed ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
      }`}>
        {passed ? <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> : <span className="w-2 h-2 rounded-full bg-slate-300"></span>}
      </div>
      <div>
        <div className={`font-bold text-xs truncate max-w-[150px] ${passed ? "text-slate-800" : "text-slate-500"}`}>{title}</div>
        <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{desc}</div>
      </div>
    </div>
  );
}
