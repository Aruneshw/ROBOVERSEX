"use client";

import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/arena/TopNav";
import { SubHeader } from "@/components/arena/SubHeader";
import { Sidebar } from "@/components/arena/Sidebar";
import { MainWorkspace } from "@/components/arena/MainWorkspace";
import { rvx, useTaskFlow } from "@/rvx-runtime";

export default function ArenaPage() {
  const [code, setCode] = useState("");
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);
  
  const [toast, setToast] = useState<string | null>(null);

  const flow = useTaskFlow({
    participantId: "RVX-001",
    code,
    setCode: (c) => { codeRef.current = c; setCode(c); },
    onSubmit: async (task) => {
      setToast(`${task.title} completed ✔`);
      setTimeout(() => setToast(null), 3000);
    },
  });

  const [activeLevel, setActiveLevel] = useState<1 | 2>(flow.current?.ps || 1);
  
  useEffect(() => {
    if (flow.current?.ps) setActiveLevel(flow.current.ps);
  }, [flow.current?.ps]);

  const level1Done = flow.tasks.filter(t => t.task.ps === 1).every(t => t.state === "passed");
  
  const activeTasks = flow.tasks.filter(t => t.task.ps === activeLevel);
  const derivedFlow = {
    ...flow,
    tasks: activeTasks.map((ft, i) => ({ ...ft, index: i })),
    completed: activeTasks.filter(t => t.state === "passed").length,
    total: activeTasks.length,
    allDone: activeTasks.every(t => t.state === "passed")
  };

  useEffect(() => {
    rvx.configure({ user: "arunesh", host: "roboverse-x", fileName: "solution.py", getCode: () => codeRef.current });
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0f1c] text-slate-200 font-sans">
      <TopNav />
      <SubHeader activeLevel={activeLevel} setActiveLevel={setActiveLevel} level1Done={level1Done} />
      
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-xl font-bold z-50 animate-bounce">
          {toast}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar flow={derivedFlow} activeLevel={activeLevel} />
        <MainWorkspace flow={flow} code={code} setCode={setCode} />
      </div>
    </div>
  );
}
