"use client";

import { useState } from "react";
import { X, Plus, Search, Loader2 } from "lucide-react";

type WatchlistItem = {
  ticker: string;
  cik: string | null;
  aliases: string[] | null;
  added_at: string;
};

type TickerPreview = {
  symbol: string;
  name: string;
  exchange: string;
};

export function WatchlistManager({
  initialWatchlist,
}: {
  initialWatchlist: WatchlistItem[];
}) {
  const [watchlist, setWatchlist] = useState(initialWatchlist);
  const [input, setInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState<TickerPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleSearch() {
    const q = input.trim().toUpperCase();
    if (!q) return;
    setValidating(true);
    setPreview(null);
    setPreviewError("");
    const res = await fetch(`/api/validate-ticker?ticker=${q}`);
    const data = await res.json();
    setValidating(false);
    if (data.valid) {
      setPreview({ symbol: data.symbol, name: data.name, exchange: data.exchange });
    } else {
      setPreviewError("找不到这个 Ticker，请检查是否正确");
    }
  }

  async function handleAdd() {
    if (!preview) return;
    setAdding(true);
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: preview.symbol }),
    });
    setAdding(false);
    if (res.ok) {
      setWatchlist((prev) => [
        ...prev,
        { ticker: preview.symbol, cik: null, aliases: null, added_at: new Date().toISOString() },
      ]);
      setInput("");
      setPreview(null);
    } else if (res.status === 401) {
      setPreviewError("Session 已过期，请刷新页面重新登录");
    }
  }

  async function handleRemove(ticker: string) {
    setRemoving(ticker);
    await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
    setRemoving(null);
    setWatchlist((prev) => prev.filter((w) => w.ticker !== ticker));
  }

  const alreadyAdded = preview ? watchlist.some((w) => w.ticker === preview.symbol) : false;

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="mb-8 border-b border-border pb-4">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">
          Settings
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Watchlist</h1>
      </div>

      {/* Current watchlist */}
      <div className="mb-8">
        <p className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          当前关注 · <span className="num text-foreground">{watchlist.length}</span> 只
        </p>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {watchlist.length === 0 && (
            <p className="px-4 py-4 font-mono text-sm text-faint">空</p>
          )}
          {watchlist.map((item) => (
            <div key={item.ticker} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2">
              <div>
                <span className="font-mono text-sm font-semibold tracking-wider text-foreground">
                  {item.ticker}
                </span>
                {item.cik && (
                  <span className="ml-3 font-mono text-xs text-faint">CIK {item.cik}</span>
                )}
              </div>
              <button
                onClick={() => handleRemove(item.ticker)}
                disabled={removing === item.ticker}
                className="rounded-md p-1.5 text-faint transition-colors hover:bg-down/10 hover:text-down disabled:opacity-40"
                title="移除"
              >
                {removing === item.ticker ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add new ticker */}
      <div>
        <p className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          添加股票
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入 Ticker，例如 AAPL"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase());
              setPreview(null);
              setPreviewError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 rounded-lg border border-input bg-surface-2 px-4 py-2.5 font-mono text-sm uppercase text-foreground placeholder:normal-case placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={validating || !input.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2.5 font-mono text-sm text-muted-foreground transition-colors hover:border-faint/40 hover:text-foreground disabled:opacity-40"
          >
            {validating ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </div>

        {previewError && (
          <p className="mt-2 font-mono text-xs text-down">{previewError}</p>
        )}

        {preview && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <div className="min-w-0">
              <span className="font-mono text-sm font-semibold text-foreground">{preview.symbol}</span>
              <span className="ml-2 truncate text-sm text-muted-foreground">{preview.name}</span>
              <span className="ml-2 font-mono text-xs text-accent">{preview.exchange}</span>
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || alreadyAdded}
              className="ml-4 flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-mono text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {adding ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
              {alreadyAdded ? "已添加" : "添加"}
            </button>
          </div>
        )}
      </div>

      <p className="mt-8 font-mono text-xs text-faint">
        修改在下次同步时生效（最长约 2 小时）
      </p>
    </div>
  );
}
