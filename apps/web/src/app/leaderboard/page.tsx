import { TopNav } from "@/components/arena/TopNav";

export default function LeaderboardPage() {
  return (
    <div className="flex flex-col h-screen bg-[#0a0f1c] text-white">
      <TopNav />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-black mb-4 text-blue-500">LEADERBOARD</h1>
          <p className="text-slate-400">Global rankings and top times will be displayed here.</p>
        </div>
      </div>
    </div>
  );
}
