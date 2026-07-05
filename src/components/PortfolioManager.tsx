"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export type PortfolioRow = {
  ticker: string;
  shares: number;
  avgCost: number;
  note: string | null;
  price: number | null;
  changePct: number | null;
  cost: number;
  marketValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
  dayPnl: number | null;
  weightPct: number | null;
  earningsDate: string | null;
  theses: {
    thesisId: string;
    label: string;
    direction: "bullish" | "bearish";
    conviction: number;
  }[];
};

function fmtNum(value: number | null, digits = 2, prefix = "") {
  if (value == null) return "—";
  return `${prefix}${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function pnlTone(value: number | null) {
  if (value == null) return "text-faint";
  return value > 0 ? "text-up" : value < 0 ? "text-down" : "text-foreground";
}

export function PortfolioManager({ rows }: { rows: PortfolioRow[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(rows.length === 0);
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSave() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, shares: Number(shares), avgCost: Number(avgCost) }),
    });
    setSaving(false);
    if (res.ok) {
      setTicker("");
      setShares("");
      setAvgCost("");
      setFormOpen(false);
      router.refresh();
    } else if (res.status === 401) {
      setError("未登录:请先到设置页输入密码,再回来录入持仓。");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "保存失败,检查输入。");
    }
  }

  async function handleRemove(symbol: string) {
    setRemoving(symbol);
    const res = await fetch(`/api/positions/${symbol}`, { method: "DELETE" });
    setRemoving(null);
    if (res.ok) router.refresh();
    else if (res.status === 401) setError("未登录:请先到设置页输入密码。");
  }

  function startEdit(row: PortfolioRow) {
    setTicker(row.ticker);
    setShares(String(row.shares));
    setAvgCost(String(row.avgCost));
    setFormOpen(true);
    setError("");
  }

  const canSave =
    ticker.trim().length > 0 && Number(shares) > 0 && Number(avgCost) >= 0 && !saving;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
          持仓明细
        </h2>
        <button
          onClick={() => {
            setFormOpen((v) => !v);
            setError("");
          }}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-mono text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" />
          录入 / 更新持仓
        </button>
      </div>

      {formOpen && (
        <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                Ticker
              </span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="NVDA"
                className="w-32 rounded-lg border border-input bg-surface-2 px-3 py-2 font-mono text-sm uppercase text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                股数
              </span>
              <input
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="100"
                inputMode="decimal"
                className="num w-32 rounded-lg border border-input bg-surface-2 px-3 py-2 font-mono text-sm text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                成本价 $
              </span>
              <input
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                placeholder="120.50"
                inputMode="decimal"
                onKeyDown={(e) => e.key === "Enter" && canSave && handleSave()}
                className="num w-32 rounded-lg border border-input bg-surface-2 px-3 py-2 font-mono text-sm text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 font-mono text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : "保存"}
            </button>
          </div>
          <p className="mt-2 text-xs text-faint">
            同一 ticker 重复保存会覆盖(按聚合后的总股数与平均成本录入);新标的会自动加入
            watchlist,价格在下轮同步后出现。
          </p>
          {error && <p className="mt-2 font-mono text-xs text-down">{error}</p>}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 px-5 py-10 text-center">
          <p className="font-display text-lg font-medium text-foreground">还没有持仓记录</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            录入 ticker、股数和平均成本,驾驶舱会自动关联现价、盈亏和板块论点覆盖。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["标的", "股数", "成本", "现价", "市值", "盈亏", "今日", "论点覆盖", ""].map(
                  (h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-faint"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => {
                const conflict = row.theses.some((t) => t.direction === "bearish");
                return (
                  <tr key={row.ticker} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/stock/${row.ticker}`}
                        className="font-mono text-sm font-semibold tracking-wider text-foreground transition-colors hover:text-accent"
                      >
                        {row.ticker}
                      </Link>
                      {row.earningsDate && (
                        <span className="ml-2 inline-flex items-center gap-1 font-mono text-[11px] text-warn">
                          <CalendarClock className="size-3" />
                          {row.earningsDate.slice(5)}
                        </span>
                      )}
                      {row.weightPct != null && (
                        <span className="num ml-2 font-mono text-[11px] text-faint">
                          {row.weightPct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="num px-4 py-3 font-mono text-sm text-foreground">
                      {row.shares.toLocaleString()}
                    </td>
                    <td className="num px-4 py-3 font-mono text-sm text-muted-foreground">
                      {fmtNum(row.avgCost, 2, "$")}
                    </td>
                    <td className="num px-4 py-3 font-mono text-sm text-foreground">
                      {row.price == null ? (
                        <span className="text-faint" title="等待价格同步">
                          待同步
                        </span>
                      ) : (
                        fmtNum(row.price, 2, "$")
                      )}
                    </td>
                    <td className="num px-4 py-3 font-mono text-sm font-semibold text-foreground">
                      {fmtNum(row.marketValue, 0, "$")}
                    </td>
                    <td className={`num px-4 py-3 font-mono text-sm font-semibold ${pnlTone(row.pnl)}`}>
                      {row.pnl == null ? "—" : (
                        <>
                          {row.pnl >= 0 ? "+" : ""}
                          {fmtNum(row.pnl, 0, "$")}
                          <span className="ml-1.5 text-xs font-normal">
                            {row.pnlPct != null && `${row.pnlPct >= 0 ? "+" : ""}${row.pnlPct.toFixed(1)}%`}
                          </span>
                        </>
                      )}
                    </td>
                    <td className={`num px-4 py-3 font-mono text-sm ${pnlTone(row.changePct)}`}>
                      {row.changePct == null
                        ? "—"
                        : `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(2)}%`}
                    </td>
                    <td className="max-w-64 px-4 py-3">
                      {row.theses.length === 0 ? (
                        <span className="font-mono text-xs text-faint">无覆盖</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {conflict && (
                            <span title="有看空论点覆盖该持仓">
                              <AlertTriangle className="size-3.5 text-down" />
                            </span>
                          )}
                          {row.theses.slice(0, 3).map((t) => (
                            <Link
                              key={t.thesisId}
                              href={`/thesis/${t.thesisId}`}
                              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:border-faint/50 ${
                                t.direction === "bearish"
                                  ? "border-down/30 bg-down/10 text-down"
                                  : "border-up/30 bg-up/10 text-up"
                              }`}
                            >
                              {t.direction === "bearish" ? "空" : "多"}
                              <span className="max-w-24 truncate text-foreground/80">{t.label}</span>
                              <span className="num">{t.conviction}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(row)}
                        className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-foreground"
                        title="编辑"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => handleRemove(row.ticker)}
                        disabled={removing === row.ticker}
                        className="rounded-md p-1.5 text-faint transition-colors hover:bg-down/10 hover:text-down disabled:opacity-40"
                        title="删除"
                      >
                        {removing === row.ticker ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
