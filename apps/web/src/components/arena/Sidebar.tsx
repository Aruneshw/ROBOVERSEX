import { Lock, PlayCircle, Lightbulb, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export function Sidebar({ flow }: { flow: any }) {
  const completed = flow.completed || 0;
  const total = flow.total || 4;
  const progressPercent = Math.round((completed / total) * 100);

  return (
    <div className="w-[350px] bg-slate-50 border-r border-slate-200 flex flex-col overflow-y-auto text-slate-800 shrink-0">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-start gap-3">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600 mt-1">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight uppercase">Level 2 Challenge</h2>
            <p className="text-xs text-slate-500 font-medium mt-1">Complete all tasks in order.</p>
          </div>
        </div>
        
        <div className="mt-6">
          <div className="flex justify-between text-xs font-bold mb-2">
            <span>{completed} / {total} completed</span>
            <span>{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2 bg-slate-200" />
        </div>
      </div>

      {/* Task List */}
      <div className="p-4 space-y-4 flex-1">
        {flow.tasks?.map((ft: any) => {
          const t = ft.task;
          const isLocked = ft.state === "locked";
          const isCurrent = ft.state === "current";
          const isPassed = ft.state === "passed";

          return (
            <div 
              key={t.id} 
              onClick={() => !isLocked && flow.select(t.id)}
              className={`border-2 rounded-xl p-4 relative overflow-hidden transition-all ${
                isLocked ? "bg-white border-slate-200 opacity-60 cursor-not-allowed" : 
                isCurrent ? "bg-white border-blue-500 shadow-sm cursor-default" :
                "bg-white border-slate-200 hover:border-blue-300 cursor-pointer shadow-sm"
              }`}
            >
              {isCurrent && <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>}
              
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCurrent ? "bg-blue-600 text-white" : 
                    isPassed ? "bg-emerald-500 text-white" :
                    "bg-slate-200 text-slate-500"
                  }`}>
                    {isPassed ? <CheckCircle className="w-3 h-3" /> : (ft.index + 1)}
                  </div>
                  <h3 className="font-bold text-sm">{t.title}</h3>
                </div>
                {isLocked && <Lock className="w-4 h-4 text-slate-400" />}
              </div>
              
              <p className="text-xs text-slate-500 mb-4 ml-9">{t.summary}</p>
              
              <div className="ml-9 flex items-center gap-2">
                {isPassed && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-3 py-1 rounded-full">PASSED</span>}
                {isCurrent && <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full">IN PROGRESS</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* How it works */}
      <div className="p-6 bg-blue-50/50 border-t border-blue-100">
        <div className="flex items-center gap-2 text-blue-800 font-bold mb-4">
          <Lightbulb className="w-5 h-5" />
          How it works?
        </div>
        <ul className="space-y-4 text-xs font-medium text-slate-600">
          <li className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center shrink-0">1</div>
            <span className="mt-0.5">Write / modify your ROS 2 Python code</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center shrink-0">2</div>
            <span className="mt-0.5">Run the simulation and test</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center shrink-0">3</div>
            <span className="mt-0.5">Complete the task requirements</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center shrink-0">4</div>
            <span className="mt-0.5">Submit your final run for evaluation</span>
          </li>
        </ul>
      </div>

    </div>
  );
}
