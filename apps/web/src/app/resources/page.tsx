import { TopNav } from "@/components/arena/TopNav";

export default function ResourcesPage() {
  return (
    <div className="flex flex-col h-screen bg-[#0a0f1c] text-white">
      <TopNav />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-black mb-4">RESOURCES</h1>
          <p className="text-slate-400 mb-8">ROS 2 documentation, tutorials, and templates.</p>
          <a 
            href="https://docs.google.com/forms/d/e/1FAIpQLScSJN5oEKQc2Wg5J981VRFjVvyDAJby8yRvpU4OKD43L9mFdQ/viewform?usp=publish-editor"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold transition-colors"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            Feedback Form
          </a>
        </div>
      </div>
    </div>
  );
}
