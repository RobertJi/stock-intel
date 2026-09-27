import { Briefcase } from "lucide-react";
import {
  getPositions,
  getStocks,
  getThesisCoverage,
  getWatchlist,
} from "@/lib/db";
import { PortfolioManager, type PortfolioRow } from "@/components/PortfolioManager";

export const revalidate = 60;

const SEGMENT_COLORS = [
  "#F0B429",
  "#0ECB81",
  "#38BDF8",
  "#A78BFA",
  "#F472B6",
  "#FB923C",
  "#34D399",
  "#818CF8",
];

function fmtMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default async function PortfolioPage() {
  const [positions, watchlist] = await Promise.all([
    getPositions().catch(() => []),
    getWatchlist().catch(() => []),
  ]);
  const tickers = positions.map((p) => p.ticker);
  const [stocks, coverage] = await Promise.all([
    tickers.length > 0 ? getStocks(tickers).catch(() => []) : Promise.resolve([]),
    getThesisCoverage(tickers).catch(
      () => ({}) as Awaited<ReturnType<typeof getThesisCoverage>>
    ),
  ]);

  const stockMap = new Map(stocks.map((s) => [s.ticker, s]));
  const earningsMap = new Map(watchlist.map((w) => [w.ticker, w.earnings_date]));

  const rows: PortfolioRow[] = positions.map((p) => {
    const stock = stockMap.get(p.ticker);
    const price = stock?.price ?? null;
    const cost = p.shares * p.avgCost;
    const marketValue = price != null ? p.shares * price : null;
    const pnl = marketValue != null ? marketValue - cost : null;
    return {
      ticker: p.ticker,
      shares: p.shares,
      avgCost: p.avgCost,
      note: p.note,
      price,
      changePct: stock?.changePct ?? null,
      cost,
      marketValue,
      pnl,
      pnlPct: pnl != null && cost > 0 ? (pnl / cost) * 100 : null,
      dayPnl:
        marketValue != null && stock?.changePct != null
          ? (marketValue * stock.changePct) / (100 + stock.changePct)
          : null,
      weightPct: null,
      earningsDate: earningsMap.get(p.ticker) ?? null,
      theses: (coverage[p.ticker] ?? []).map((l) => ({
        thesisId: l.thesisId,
        label: l.sectorZh ?? l.sector,
        direction: l.direction,
        conviction: l.conviction,
      })),
    };
  });

  const totalValue = rows.reduce((acc, r) => acc + (r.marketValue ?? 0), 0);
  const totalCost = rows.reduce((acc, r) => acc + r.cost, 0);
  const totalPnl = rows.reduce((acc, r) => acc + (r.pnl ?? 0), 0);
  const dayPnl = rows.reduce((acc, r) => acc + (r.dayPnl ?? 0), 0);
  const covered = rows.filter((r) => r.theses.length > 0).length;
  const conflicts = rows.filter((r) => r.theses.some((t) => t.direction === "bearish")).length;

  for (const row of rows) {
    row.weightPct = totalValue > 0 && row.marketValue != null ? (row.marketValue / totalValue) * 100 : null;
  }
  rows.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));

  const pnlTone = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-foreground");
  const stats = [
    { label: "总市值", value: fmtMoney(totalValue), tone: "text-foreground" },
    { label: "总成本", value: fmtMoney(totalCost), tone: "text-muted-foreground" },
    {
      label: "总盈亏",
      value: `${totalPnl >= 0 ? "+" : ""}${fmtMoney(totalPnl)}`,
      tone: pnlTone(totalPnl),
    },
    {
      label: "盈亏 %",
      value: totalCost > 0 ? `${totalPnl >= 0 ? "+" : ""}${((totalPnl / totalCost) * 100).toFixed(1)}%` : "—",
      tone: pnlTone(totalPnl),
    },
    {
      label: "今日",
      value: `${dayPnl >= 0 ? "+" : ""}${fmtMoney(dayPnl)}`,
      tone: pnlTone(dayPnl),
    },
    {
      label: "论点覆盖",
      value: `${covered}/${rows.length}`,
      tone: conflicts > 0 ? "text-warn" : "text-accent",
    },
  ];

  const exposure = rows
    .filter((r) => (r.weightPct ?? 0) > 0)
    .map((r, i) => ({
      ticker: r.ticker,
      weightPct: r.weightPct!,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    }));

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">
              <Briefcase className="size-4" />
              Portfolio
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              持仓驾驶舱
            </h1>
          </div>
          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-6">
              {stats.map((s) => (
                <div key={s.label} className="bg-surface px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
                    {s.label}
                  </p>
                  <p className={`num mt-1 font-mono text-xl font-semibold ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {exposure.length > 0 && (
        <div className="mb-8 rounded-xl border border-border bg-surface px-5 py-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
            仓位分布
          </p>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
            {exposure.map((e) => (
              <div
                key={e.ticker}
                title={`${e.ticker} ${e.weightPct.toFixed(1)}%`}
                style={{ width: `${e.weightPct}%`, backgroundColor: e.color }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {exposure.map((e) => (
              <span key={e.ticker} className="flex items-center gap-1.5 font-mono text-xs">
                <span className="size-2 rounded-sm" style={{ backgroundColor: e.color }} />
                <span className="text-foreground">{e.ticker}</span>
                <span className="num text-faint">{e.weightPct.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <PortfolioManager rows={rows} />
    </div>
  );
}
