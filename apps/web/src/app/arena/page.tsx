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

  useEffect(() => {
    rvx.configure({ user: "arunesh", host: "roboverse-x", fileName: "solution.py", getCode: () => codeRef.current });
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0f1c] text-slate-200 font-sans">
      <TopNav />
      <SubHeader />
      
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-xl font-bold z-50 animate-bounce">
          {toast}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar flow={flow} />
        <MainWorkspace flow={flow} code={code} setCode={setCode} />
      </div>
    </div>
  );
}
