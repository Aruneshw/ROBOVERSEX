"use client";

import { Bell, Calendar, Home, Target, Trophy, BookOpen, LogIn } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="w-full bg-[#0d1425] border-b border-[#1e293b] flex items-center justify-between px-6 py-3">
      
      {/* Left: Branding */}
      <div className="flex flex-col">
        <div className="text-[10px] text-slate-400 font-semibold tracking-wider flex gap-2">
          <span>BANNARI AMMAN INSTITUTE OF TECHNOLOGY</span>
          <span>•</span>
          <span>AI BASED INDUSTRIAL AUTOMATION LAB</span>
          <span>•</span>
          <span>RSI COMMUNITY</span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-3xl font-black tracking-tighter text-white">ROBOVERSE</span>
          <span className="text-3xl font-black bg-blue-600 text-white px-2 rounded-sm ml-1">X</span>
        </div>
        <div className="text-[10px] text-slate-400 font-semibold tracking-[0.2em] mt-0.5">
          EXPLORE • SOLVE • BUILD • INNOVATE
        </div>
      </div>

      {/* Middle: Navigation */}
      <div className="hidden lg:flex items-center gap-8">
        <NavItem href="/dashboard" icon={<Home className="w-4 h-4" />} label="Dashboard" active={pathname === "/dashboard"} />
        <NavItem href="/arena" icon={<Target className="w-4 h-4" />} label="Challenges" active={pathname.startsWith("/arena")} />
        <NavItem href="/leaderboard" icon={<Trophy className="w-4 h-4" />} label="Leaderboard" active={pathname === "/leaderboard"} />
        <NavItem href="/resources" icon={<BookOpen className="w-4 h-4" />} label="Resources" active={pathname === "/resources"} />
      </div>

      {/* Right: Profile & Info */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 border border-slate-700 bg-slate-800/50 px-3 py-1.5 rounded-md text-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="font-medium">10 OCT 2026</span>
        </div>
        
        <button className="relative p-2 text-slate-400 hover:text-white transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border border-[#0d1425]"></span>
        </button>

        <button onClick={() => router.push("/auth/login")} className="flex items-center gap-2 rounded-md border border-blue-500/50 px-3 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/10" aria-label="Sign in with Google">
          <LogIn className="h-4 w-4" />
          Sign in
        </button>

        <div className="flex items-center gap-3 border-l border-slate-700 pl-6">
          <Avatar className="w-9 h-9 border-2 border-slate-700">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>AK</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white">Aruneshwaran K <span className="text-slate-400 text-xs ml-1">v</span></span>
            <span className="text-xs text-slate-400">Participant</span>
          </div>
        </div>
      </div>

    </div>
  );
}

function NavItem({ href, icon, label, active = false }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-2 text-sm font-semibold transition-colors pb-1 ${active ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-slate-200'}`}>
      <span className={active ? "text-blue-400" : ""}>{icon}</span>
      {label}
    </Link>
  );
}
