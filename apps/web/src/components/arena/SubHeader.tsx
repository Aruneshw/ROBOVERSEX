import { Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubHeader({ 
  activeLevel = 1, 
  setActiveLevel, 
  level1Done 
}: { 
  activeLevel?: 1 | 2;
  setActiveLevel?: (l: 1 | 2) => void;
  level1Done?: boolean;
}) {
  return (
    <div className="w-full bg-[#1e293b] border-b border-slate-700/50 flex items-center justify-between px-4 py-2">
      
      <div className="flex gap-2">
        <button 
          onClick={() => setActiveLevel?.(1)}
          className={`text-xs font-bold px-6 py-2 rounded-md shadow-sm transition-colors ${
            activeLevel === 1 ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700"
          }`}
        >
          LEVEL 1
        </button>
        {level1Done ? (
          <button 
            onClick={() => setActiveLevel?.(2)}
            className={`text-xs font-bold px-6 py-2 rounded-md shadow-sm transition-colors ${
              activeLevel === 2 ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 animate-pulse"
            }`}
          >
            LEVEL 2
          </button>
        ) : (
          <button className="bg-slate-800 hover:bg-slate-700 text-slate-500 text-xs font-bold px-6 py-2 rounded-md border border-slate-700 flex items-center gap-2 transition-colors cursor-not-allowed opacity-50">
            <Lock className="w-3 h-3" />
            LEVEL 2
          </button>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="text-xs font-medium text-slate-400 flex items-center gap-2">
          <span>Turtlesim</span>
          <span>•</span>
          <span>ROS 2</span>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 px-6 rounded-md shadow-sm">
          <Send className="w-4 h-4 mr-2" />
          SUBMIT RUN
        </Button>
      </div>

    </div>
  );
}
