"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setError("密码错误");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-xs">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
          Settings
        </p>
        <h1 className="mb-8 font-display text-3xl text-[#1A1A2E]">验证身份</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full border border-[#D4CCB8] bg-[#FAF7F0] px-4 py-3 font-mono text-sm text-[#1A1A2E] placeholder:text-[#9A9AAA] focus:border-[#B5882B] focus:outline-none"
          />
          {error && (
            <p className="font-mono text-xs text-[#7C1D1D]">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-[#1A1A2E] px-4 py-3 font-mono text-sm text-[#E8E3D8] transition-colors hover:bg-[#2A2A4E] disabled:opacity-40"
          >
            {loading ? "..." : "进入"}
          </button>
        </form>
      </div>
    </div>
  );
}
