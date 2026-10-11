"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
      },
    });
    if (authError) {
      setError("Google sign-in is unavailable right now. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080d18] text-white flex items-center justify-center px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0d1425] p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center items-center gap-1">
            <span className="text-3xl font-black tracking-tighter">ROBOVERSE</span>
            <span className="rounded-sm bg-blue-600 px-2 text-3xl font-black">X</span>
          </div>
          <h1 className="text-xl font-bold">Enter the competition arena</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to save your progress and compete.</p>
        </div>
        <button onClick={signInWithGoogle} disabled={loading} className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60">
          <Globe className="h-5 w-5" />
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>
        {error && <p role="alert" className="mt-4 text-center text-sm text-red-400">{error}</p>}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4" /> Secure authentication powered by Supabase</div>
        <button onClick={() => router.push("/arena")} className="mt-6 w-full text-sm text-slate-400 hover:text-white">Continue as guest</button>
      </section>
    </main>
  );
}
