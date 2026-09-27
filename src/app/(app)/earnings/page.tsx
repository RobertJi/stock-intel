import Link from "next/link";
import { CalendarClock, CircleCheck, CircleDot, CircleX, KeyRound } from "lucide-react";
import { getPositions, getWatchlist } from "@/lib/db";
import { fetchEarningsForSymbols, hasFmpKey, type EarningsEvent } from "@/lib/fmp";

export const revalidate = 3600;

const DAY_MS = 86_400_000;

function fmtRevenue(value: number | null) {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

function fmtDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getUTCDay()];
  return `${iso.slice(5).replace("-", "/")} 周${weekday}`;
}

type LastReport = { event: EarningsEvent; beat: boolean | null; surprisePct: number | null };

function lastReport(events: EarningsEvent[], todayIso: string): LastReport | null {
  const past = events
    .filter((e) => e.date < todayIso && e.epsActual != null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const event = past[0];
  if (!event) return null;
  if (event.epsEstimate == null || event.epsActual == null) {
    return { event, beat: null, surprisePct: null };
  }
  const beat = event.epsActual >= event.epsEstimate;
  const surprisePct =
    event.epsEstimate !== 0
      ? ((event.epsActual - event.epsEstimate) / Math.abs(event.epsEstimate)) * 100
      : null;
  return { event, beat, surprisePct };
}

function BeatChip({ report }: { report: LastReport | null }) {
  if (!report || report.beat == null) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-faint">
        <CircleDot className="size-3.5" />
        无对比
      </span>
    );
  }
  const Icon = report.beat ? CircleCheck : CircleX;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs font-semibold ${
        report.beat ? "border-up/30 bg-up/10 text-up" : "border-down/30 bg-down/10 text-down"
      }`}
      title={`上季 EPS 实际 ${report.event.epsActual} vs 预期 ${report.event.epsEstimate}`}
    >
      <Icon className="size-3.5" />
      {report.beat ? "超预期" : "不及预期"}
      {report.surprisePct != null && (
        <span className="num">
          {report.surprisePct >= 0 ? "+" : ""}
          {report.surprisePct.toFixed(1)}%
        </span>
      )}
    </span>
  );
}

export default async function EarningsPage() {
  const [watchlist, positions] = await Promise.all([
    getWatchlist().catch(() => []),
    getPositions().catch(() => []),
  ]);
  const positionSet = new Set(positions.map((p) => p.ticker));
  const tickers = [...new Set([...watchlist.map((w) => w.ticker), ...positionSet])];

  const todayIso = new Date().toISOString().slice(0, 10);
  const horizonIso = new Date(Date.now() + 60 * DAY_MS).toISOString().slice(0, 10);

  const fmpData = hasFmpKey()
    ? await fetchEarningsForSymbols(tickers).catch(() => null)
    : null;

  type Row = {
    ticker: string;
    date: string;
    holding: boolean;
    epsEstimate: number | null;
    revenueEstimate: number | null;
    last: LastReport | null;
  };

  let rows: Row[] = [];
  if (fmpData) {
    for (const ticker of tickers) {
      const events = fmpData[ticker] ?? [];
      const upcoming = events
        .filter((e) => e.date >= todayIso && e.date <= horizonIso)
        .sort((a, b) => (a.date > b.date ? 1 : -1))[0];
      if (!upcoming) continue;
      rows.push({
        ticker,
        date: upcoming.date,
        holding: positionSet.has(ticker),
        epsEstimate: upcoming.epsEstimate,
        revenueEstimate: upcoming.revenueEstimate,
        last: lastReport(events, todayIso),
      });
    }
  } else {
    // 降级:用管道已同步的 earnings_date(无预期数据)
    rows = watchlist
      .filter((w) => w.earnings_date && w.earnings_date >= todayIso && w.earnings_date <= horizonIso)
      .map((w) => ({
        ticker: w.ticker,
        date: w.earnings_date!,
        holding: positionSet.has(w.ticker),
        epsEstimate: null,
        revenueEstimate: null,
        last: null,
      }));
  }
  rows.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : a.ticker.localeCompare(b.ticker)));

  const byDate = new Map<string, Row[]>();
  for (const row of rows) {
    byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  }

  const in7 = rows.filter((r) => r.date <= new Date(Date.now() + 7 * DAY_MS).toISOString().slice(0, 10));
  const beats = rows.filter((r) => r.last?.beat === true).length;
  const decided = rows.filter((r) => r.last?.beat != null).length;

  const stats = [
    { label: "覆盖标的", value: String(tickers.length), tone: "text-foreground" },
    { label: "未来60日", value: String(rows.length), tone: "text-foreground" },
    { label: "未来7日", value: String(in7.length), tone: in7.length > 0 ? "text-warn" : "text-faint" },
    { label: "持仓相关", value: String(rows.filter((r) => r.holding).length), tone: "text-accent" },
    {
      label: "上季超预期率",
      value: decided > 0 ? `${Math.round((beats / decided) * 100)}%` : "—",
      tone: "text-up",
    },
  ];

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">
              <CalendarClock className="size-4" />
              Earnings
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              财报日历
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
            {stats.map((s) => (
              <div key={s.label} className="bg-surface px-4 py-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
                  {s.label}
                </p>
                <p className={`num mt-1 font-mono text-xl font-semibold ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!hasFmpKey() && (
        <div className="mb-8 rounded-xl border border-warn/25 bg-warn/[0.06] px-5 py-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-warn">
                FMP 未配置 · 当前为降级模式
              </p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                现在只显示管道同步的财报日期,没有预期 EPS/营收和超预期对比。到
                financialmodelingprep.com 注册(免费层 250 请求/天足够),然后在 .env.local 加一行
                <code className="mx-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">
                  FMP_API_KEY=你的key
                </code>
                并重启服务即可解锁完整数据。
              </p>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 px-5 py-10 text-center">
          <p className="font-display text-lg font-medium text-foreground">未来 60 天没有财报事件</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            watchlist 与持仓标的均无排期,或数据尚未同步。
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...byDate.entries()].map(([date, dateRows]) => {
            const daysLeft = Math.round(
              (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${todayIso}T00:00:00Z`).getTime()) /
                DAY_MS
            );
            return (
              <div key={date}>
                <div className="mb-2 flex items-baseline gap-3">
                  <h2 className="num font-mono text-base font-bold text-foreground">{fmtDate(date)}</h2>
                  <span
                    className={`num font-mono text-xs ${daysLeft <= 3 ? "text-warn" : "text-faint"}`}
                  >
                    {daysLeft === 0 ? "今天" : `${daysLeft} 天后`}
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                  <table className="w-full min-w-[640px] border-collapse text-left">
                    <tbody className="divide-y divide-border/60">
                      {dateRows.map((row) => (
                        <tr key={row.ticker} className="transition-colors hover:bg-surface-2/50">
                          <td className="w-40 px-4 py-3">
                            <Link
                              href={`/stock/${row.ticker}`}
                              className="font-mono text-sm font-semibold tracking-wider text-foreground transition-colors hover:text-accent"
                            >
                              {row.ticker}
                            </Link>
                            {row.holding && (
                              <span className="ml-2 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                                持仓
                              </span>
                            )}
                          </td>
                          <td className="num w-44 px-4 py-3 font-mono text-sm">
                            <span className="mr-2 text-[11px] uppercase tracking-wider text-faint">
                              EPS 预期
                            </span>
                            <span className="text-foreground">
                              {row.epsEstimate == null ? "—" : row.epsEstimate.toFixed(2)}
                            </span>
                          </td>
                          <td className="num w-48 px-4 py-3 font-mono text-sm">
                            <span className="mr-2 text-[11px] uppercase tracking-wider text-faint">
                              营收预期
                            </span>
                            <span className="text-foreground">{fmtRevenue(row.revenueEstimate)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <BeatChip report={row.last} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
