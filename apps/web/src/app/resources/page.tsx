import { TopNav } from "@/components/arena/TopNav";

export default function ResourcesPage() {
  return (
    <div className="flex flex-col h-screen bg-[#0a0f1c] text-white">
      <TopNav />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-black mb-4">RESOURCES</h1>
          <p className="text-slate-400">ROS 2 documentation, tutorials, and templates.</p>
        </div>
      </div>
    </div>
  );
}
