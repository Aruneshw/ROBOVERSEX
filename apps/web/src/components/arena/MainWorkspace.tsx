"use client";

import { Play, RotateCcw, Settings, Trash2, X, Send, Monitor, Maximize2, CheckCircle2, Share2 } from "lucide-react";
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

  if (task.task === 4) {
    return <Task4Workspace flow={flow} code={code} setCode={setCode} s={s} task={task} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0a0f1c] min-w-0 p-4 gap-4 overflow-y-auto">
      
      {/* Task Status Bar */}
      <div className="flex items-center justify-between bg-[#11192b] border border-slate-700/50 rounded-xl p-4 shrink-0">
        <div className="flex items-center gap-4 flex-1 pr-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>
          </div>
          <div className="min-w-0 select-none">
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

function Task4Workspace({ flow, code, setCode, s, task }: any) {
  return (
    <div className="flex-1 flex flex-col bg-[#0a0f1c] min-w-0 p-4 gap-4 overflow-y-auto custom-scrollbar">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-white font-bold text-xl uppercase tracking-wider">TASK 4 — DRAW COMPLEX SHAPES</h2>
              <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 text-[10px] font-bold rounded border border-blue-800/50 flex items-center gap-1">
                 <Settings className="w-3 h-3" /> ROS 2
              </span>
              <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded border border-slate-700 flex items-center gap-1">
                 <Share2 className="w-3 h-3" /> TURTLESIM
              </span>
              <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded border border-slate-700 flex items-center gap-1">
                 <CheckCircle2 className="w-3 h-3" /> AUTO-CHECK
              </span>
            </div>
            <div className="text-slate-400 text-xs mt-1">Draw the shape card you are handed using TurtleSim.</div>
          </div>
        </div>
        <button 
          onClick={flow.submit}
          disabled={!flow.canSubmit}
          className={`font-bold h-10 px-6 rounded-md shadow-sm relative overflow-hidden transition-all ${
            flow.canSubmit 
              ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer" 
              : "bg-blue-600/50 text-blue-100 cursor-not-allowed opacity-80"
          }`}
        >
          <span className="relative z-10 flex items-center gap-2">
            <Send className="w-4 h-4" /> SUBMIT FINAL RUN
          </span>
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        
        {/* Top Half: Descriptions and Sim */}
        <div className="flex gap-4 min-h-[300px]">
          
          {/* Left: Task Description & Rules */}
          <div className="flex-1 bg-[#11192b] border border-slate-700/50 rounded-xl flex flex-col overflow-hidden shadow-lg">
            <div className="p-3 border-b border-slate-700/50 flex items-center gap-2 font-bold text-slate-200 text-sm">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              Task Description
            </div>
            <div className="p-4 flex flex-col flex-1 overflow-y-auto">
              <p className="text-xs text-slate-300 mb-4">
                Draw the complex shape card you are handed using TurtleSim. The shape will be randomly assigned from the following options:
              </p>
              
              {/* Cards */}
              <div className="flex gap-3 mb-6">
                <div className="w-20 h-24 bg-[#1a2333] border border-blue-500 rounded-lg flex flex-col items-center justify-center gap-2 relative shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                  <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center text-white"><svg viewBox="0 0 24 24" width="8" height="8" stroke="currentColor" strokeWidth="4" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                  <svg viewBox="0 0 24 24" width="32" height="32" stroke="#fbbf24" strokeWidth="1.5" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  <span className="text-[10px] font-bold text-slate-300">Star</span>
                </div>
                <div className="w-20 h-24 bg-[#0a0f1c] border border-slate-700 rounded-lg flex flex-col items-center justify-center gap-2 opacity-60">
                  <svg viewBox="0 0 24 24" width="32" height="32" stroke="#f97316" strokeWidth="1.5" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                  <span className="text-[10px] font-bold text-slate-500">House</span>
                </div>
                <div className="w-20 h-24 bg-[#0a0f1c] border border-slate-700 rounded-lg flex flex-col items-center justify-center gap-2 opacity-60">
                  <svg viewBox="0 0 24 24" width="32" height="32" stroke="#f472b6" strokeWidth="1.5" fill="none"><path d="M12 22c5-5 5-11 0-16-5 5-5 11 0 16z"></path><path d="M2 12c5 5 11 5 16 0-5-5-11-5-16 0z"></path></svg>
                  <span className="text-[10px] font-bold text-slate-500">Flower</span>
                </div>
                <div className="w-20 h-24 bg-[#0a0f1c] border border-slate-700 rounded-lg flex flex-col items-center justify-center gap-2 opacity-60">
                  <svg viewBox="0 0 24 24" width="32" height="32" stroke="#38bdf8" strokeWidth="1.5" fill="none"><path d="M12 12c-2 0-3 1-3 3s2 4 5 4 6-3 6-7-4-8-9-8-10 5-10 11 6 12 13 12"></path></svg>
                  <span className="text-[10px] font-bold text-slate-500">Spiral</span>
                </div>
              </div>

              <div className="border-t border-slate-700/50 pt-3">
                <div className="font-bold text-xs text-slate-200 mb-2 flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5" /> Rules & Constraints
                </div>
                <ul className="text-[11px] text-slate-300 space-y-1.5 list-disc pl-4">
                  <li>Use ROS 2 Python (rclpy) with turtlesim.</li>
                  <li>Match the shape exactly as per the given card.</li>
                  <li>Use your own logic and code (no predefined functions).</li>
                  <li>Follow the given dimensions, colours and order.</li>
                  <li>The drawn shape must match 100% with the target output.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right: Simulation */}
          <div className="flex-1 bg-[#11192b] border border-slate-700/50 rounded-xl flex flex-row shadow-lg overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0">
              <div className="p-3 border-b border-slate-700/50 flex items-center justify-between font-bold text-slate-200 text-xs shrink-0">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4" /> TurtleSim Simulation
                </div>
                <div className="flex gap-2">
                  <RotateCcw onClick={() => rvx.reset()} className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-white" />
                  <Maximize2 className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-white" />
                </div>
              </div>
              <div className="flex-1 min-h-0 bg-blue-600/90 relative flex items-center justify-center">
                <div className="absolute inset-0">
                  <RvxSimulator />
                </div>
              </div>
            </div>
            
            {/* Simulation Info Sidebar */}
            <div className="w-48 border-l border-slate-700/50 p-4 flex flex-col justify-between text-[11px] bg-[#0a0f1c]/30">
              <div>
                <div className="font-bold text-slate-300 mb-3 text-xs">Simulation Info</div>
                <div className="flex justify-between mb-2 text-slate-400">
                  <span>Turtle</span>
                  <span className="text-slate-200 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span> turtle1</span>
                </div>
                <div className="flex justify-between mb-2 text-slate-400">
                  <span>Position</span>
                  <span className="text-slate-200 font-mono">({s.pose?.x?.toFixed(2) || "5.54"}, {s.pose?.y?.toFixed(2) || "5.54"})</span>
                </div>
                <div className="flex justify-between text-slate-400 mb-6">
                  <span>Status</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${s.activity === 'running' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                    {s.activity === 'running' ? 'Running' : (s.activity || 'Ready')}
                  </span>
                </div>
                
                <div className="font-bold text-slate-300 mb-2 text-xs">Target Preview</div>
                <div className="w-full aspect-square border border-slate-700 rounded-lg flex items-center justify-center mb-2 bg-[#0a0f1c] overflow-hidden">
                  <svg viewBox="0 0 100 100" width="80%" height="80%" stroke="#fbbf24" strokeWidth="3" fill="none"><polygon points="50 10 63 40 95 40 70 60 78 90 50 72 22 90 30 60 5 40 37 40 50 10"></polygon></svg>
                </div>
                <div className="text-[9px] text-slate-500 text-center uppercase tracking-wide">CARD: Star (one stroke)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Half: Editor and Terminal */}
        <div className="flex-1 flex gap-4 min-h-[250px]">
          
          {/* Code Editor */}
          <div className="flex-[1.2] flex flex-col bg-[#11192b] border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 bg-[#1a2333] border-b border-slate-700/50">
              <div className="flex items-center gap-2 font-bold text-[11px] text-slate-200">
                <div className="w-5 h-5 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                </div>
                main.py
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 bg-[#0f172a] rounded text-[10px] font-mono text-slate-400 border border-slate-700 flex items-center gap-2 cursor-pointer">
                  Python <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <button className="text-slate-400 hover:text-white px-1.5"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
              </div>
            </div>
            
            <div className="flex-1 w-full bg-[#0a0f1c] relative border-b border-slate-700/50">
              <textarea
                value={code}
                onChange={e => {
                  const v = e.target.value ?? "";
                  setCode(v);
                  flow.saveDraft(v);
                }}
                className="w-full h-full bg-transparent text-slate-300 font-mono text-[11px] leading-5 p-3 focus:outline-none resize-none custom-scrollbar"
                spellCheck="false"
              />
            </div>
            
            <div className="p-2 bg-[#1a2333] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => rvx.run()} className="flex items-center gap-1.5 px-4 py-1.5 rounded text-[11px] font-bold transition-all bg-blue-600 hover:bg-blue-500 text-white">
                  <Play className="w-3 h-3 fill-current" /> RUN CODE <div className="w-px h-3 bg-blue-400/50 mx-1"></div> <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <button onClick={() => rvx.reset()} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold transition-all bg-transparent hover:bg-slate-800 text-slate-300 border border-slate-700">
                  <RotateCcw className="w-3 h-3" /> RESET
                </button>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold transition-all bg-transparent hover:bg-slate-800 text-slate-300 border border-slate-700">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save
              </button>
            </div>
          </div>

          {/* Output Terminal */}
          <div className="flex-[0.8] flex flex-col bg-[#11192b] border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
            <div className="flex items-center justify-between px-2 bg-[#1a2333] border-b border-slate-700/50">
              <div className="flex">
                <button className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-blue-400 border-b-2 border-blue-400">
                  <Play className="w-2.5 h-2.5 fill-current" /> OUTPUT
                </button>
                <button className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200">
                  <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> LOGS
                </button>
              </div>
              <button onClick={() => rvx.clearTerminal()} className="text-slate-400 hover:text-slate-200 text-[10px] flex items-center gap-1 pr-2">
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
      <div className="bg-[#11192b] border border-slate-700/50 rounded-xl p-3 flex items-center justify-between shadow-lg mt-auto shrink-0">
        <div className="flex items-center gap-3 w-40 shrink-0">
          <Settings className="w-5 h-5 text-blue-500" />
          <div>
            <div className="font-bold text-[11px] uppercase text-slate-200">AUTO EVALUATION</div>
            <div className="text-[8px] text-slate-400">Your run will be automatically evaluated against the task criteria.</div>
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-3 flex-1 overflow-x-auto px-4 custom-scrollbar">
          {flow.checks.map((c: any) => (
            <div key={c.id} className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700 whitespace-nowrap">
              {c.ok ? (
                <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                  <svg viewBox="0 0 24 24" width="10" height="10" stroke="white" strokeWidth="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
              ) : (
                <div className="w-3.5 h-3.5 bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-200">{c.label}</span>
                <span className="text-[8px] text-slate-400">{c.detail || (c.ok ? "100% similarity" : "Pending")}</span>
              </div>
            </div>
          ))}
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
