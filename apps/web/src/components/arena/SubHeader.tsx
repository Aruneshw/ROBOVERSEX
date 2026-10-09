import { Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubHeader() {
  return (
    <div className="w-full bg-[#1e293b] border-b border-slate-700/50 flex items-center justify-between px-4 py-2">
      
      <div className="flex gap-2">
        <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2 rounded-md shadow-sm transition-colors">
          LEVEL 1
        </button>
        <button className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold px-6 py-2 rounded-md border border-slate-700 flex items-center gap-2 transition-colors">
          <Lock className="w-3 h-3" />
          LEVEL 2
        </button>
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
