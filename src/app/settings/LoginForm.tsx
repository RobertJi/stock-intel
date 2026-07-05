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
      <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-6">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">
          Settings
        </p>
        <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight text-foreground">验证身份</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-input bg-surface-2 px-4 py-3 font-mono text-sm text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
          />
          {error && (
            <p className="font-mono text-xs text-down">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-accent px-4 py-3 font-mono text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading ? "..." : "进入"}
          </button>
        </form>
      </div>
    </div>
  );
}
