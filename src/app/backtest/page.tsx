import Link from "next/link";
import { CircleCheck, CircleX, CircleDot, Crosshair, Hourglass } from "lucide-react";
import { fetchBacktest } from "@/lib/server-data";
import type { BacktestThesis, OutcomeHorizon, ThesisOutcome } from "@/lib/db";

export const revalidate = 300;

const HORIZONS: { key: OutcomeHorizon; label: string; days: number }[] = [
  { key: "t1", label: "T+1", days: 1 },
  { key: "t5", label: "T+5", days: 5 },
  { key: "t20", label: "T+20", days: 20 },
];

const VERDICT_CONFIG = {
  hit: { label: "命中", icon: CircleCheck, cls: "border-up/30 bg-up/10 text-up" },
  miss: { label: "证伪", icon: CircleX, cls: "border-down/30 bg-down/10 text-down" },
  mixed: { label: "混杂", icon: CircleDot, cls: "border-warn/30 bg-warn/10 text-warn" },
} as const;

const STATUS_LABEL: Record<string, string> = {
  forming: "形成中",
  active: "活跃",
  confirmed: "已确认",
  invalidated: "已失效",
  expired: "已过期",
};

function fmtPct(pct: number | null) {
  if (pct == null) return "";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  });
}

function fmtCountdown(dueMs: number, now: number) {
  const diff = dueMs - now;
  if (diff <= 0) return "待记录";
  const hours = Math.ceil(diff / 3_600_000);
  if (hours < 24) return `${hours}h 后`;
  return `${Math.ceil(hours / 24)}d 后`;
}

function OutcomeCell({
  thesis,
  horizon,
  days,
  now,
}: {
  thesis: BacktestThesis;
  horizon: OutcomeHorizon;
  days: number;
  now: number;
}) {
  const outcome = thesis.outcomes[horizon];
  if (outcome?.verdict) {
    const config = VERDICT_CONFIG[outcome.verdict];
    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs font-semibold ${config.cls}`}
        title={`标的平均涨跌 ${fmtPct(outcome.avgReturn)}`}
      >
        <Icon className="size-3.5" />
        {config.label}
        {outcome.avgReturn != null && <span className="num">{fmtPct(outcome.avgReturn)}</span>}
      </span>
    );
  }
  const dueMs = new Date(thesis.createdAt).getTime() + days * 86_400_000;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2/50 px-2 py-1 font-mono text-xs text-faint">
      <Hourglass className="size-3" />
      {fmtCountdown(dueMs, now)}
    </span>
  );
}

function RateBar({ label, hit, miss, mixed }: { label: string; hit: number; miss: number; mixed: number }) {
  const decided = hit + miss;
  const rate = decided > 0 ? (hit / decided) * 100 : null;
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-faint">{label}</span>
        <span className="num font-mono text-xl font-bold text-foreground">
          {rate == null ? "—" : `${rate.toFixed(0)}%`}
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        {rate != null && <div className="bg-up" style={{ width: `${rate}%` }} />}
        {rate != null && <div className="bg-down" style={{ width: `${100 - rate}%` }} />}
      </div>
      <p className="num mt-2 font-mono text-xs text-muted-foreground">
        <span className="text-up">{hit} 中</span> · <span className="text-down">{miss} 伪</span> ·{" "}
        <span className="text-warn">{mixed} 杂</span>
      </p>
    </div>
  );
}

export default async function BacktestPage() {
  const theses = await fetchBacktest();
  const now = Date.now();

  const allOutcomes: { thesis: BacktestThesis; outcome: ThesisOutcome }[] = [];
  for (const thesis of theses) {
    for (const horizon of HORIZONS) {
      const outcome = thesis.outcomes[horizon.key];
      if (outcome?.verdict) allOutcomes.push({ thesis, outcome });
    }
  }

  const count = (pred: (o: ThesisOutcome) => boolean) =>
    allOutcomes.filter(({ outcome }) => pred(outcome)).length;
  const hits = count((o) => o.verdict === "hit");
  const misses = count((o) => o.verdict === "miss");
  const mixeds = count((o) => o.verdict === "mixed");
  const decided = hits + misses;
  const overallRate = decided > 0 ? ((hits / decided) * 100).toFixed(0) + "%" : "—";

  const horizonStats = HORIZONS.map(({ key, label }) => {
    const rows = allOutcomes.filter(({ outcome }) => outcome.horizon === key);
    return {
      label,
      hit: rows.filter(({ outcome }) => outcome.verdict === "hit").length,
      miss: rows.filter(({ outcome }) => outcome.verdict === "miss").length,
      mixed: rows.filter(({ outcome }) => outcome.verdict === "mixed").length,
    };
  });

  const bands = [
    { label: "信心 80-100", min: 80, max: 101 },
    { label: "信心 50-79", min: 50, max: 80 },
    { label: "信心 <50", min: 0, max: 50 },
  ].map(({ label, min, max }) => {
    const rows = allOutcomes.filter(
      ({ thesis }) => thesis.conviction >= min && thesis.conviction < max
    );
    return {
      label,
      hit: rows.filter(({ outcome }) => outcome.verdict === "hit").length,
      miss: rows.filter(({ outcome }) => outcome.verdict === "miss").length,
      mixed: rows.filter(({ outcome }) => outcome.verdict === "mixed").length,
    };
  });

  const stats = [
    { label: "论点", value: String(theses.length), tone: "text-foreground" },
    { label: "已判定", value: String(allOutcomes.length), tone: "text-foreground" },
    { label: "命中", value: String(hits), tone: "text-up" },
    { label: "证伪", value: String(misses), tone: "text-down" },
    { label: "混杂", value: String(mixeds), tone: "text-warn" },
    { label: "命中率", value: overallRate, tone: "text-accent" },
  ];

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">
              <Crosshair className="size-4" />
              Track Record
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              判断回溯
            </h1>
          </div>
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
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          每个论点激活后,管道在 T+1 / T+5 / T+20 自动记录映射标的的平均涨跌:与论点方向一致且幅度 ≥2%
          判<span className="text-up">命中</span>,反向 ≥2% 判<span className="text-down">证伪</span>
          ,其余为<span className="text-warn">混杂</span>。命中率 = 命中 / (命中 + 证伪)。
        </p>
      </div>

      {allOutcomes.length === 0 && (
        <div className="mb-8 rounded-xl border border-dashed border-border bg-surface/50 px-5 py-6">
          <p className="font-display text-lg font-medium text-foreground">回溯数据积累中</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            当前论点均为近期生成,尚无到期的判定窗口。首批 T+1
            判定将在论点激活满一天后由管道自动写入,下方排期实时更新。
          </p>
        </div>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {horizonStats.map((s) => (
          <RateBar key={s.label} {...s} />
        ))}
      </div>

      <div className="mb-8">
        <h2 className="mb-1 font-display text-xl font-semibold tracking-tight text-foreground">
          信心分校准
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">高信心论点是否真的更准</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {bands.map((b) => (
            <RateBar key={b.label} {...b} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-xl font-semibold tracking-tight text-foreground">
          逐论点判定
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {["日期", "论点", "方向", "信心", "状态", "T+1", "T+5", "T+20"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {theses.map((thesis) => {
                const isBull = thesis.direction === "bullish";
                return (
                  <tr key={thesis.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="num whitespace-nowrap px-4 py-3 font-mono text-xs text-faint">
                      {fmtDate(thesis.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/thesis/${thesis.id}`}
                        className="font-medium text-foreground transition-colors hover:text-accent"
                      >
                        {thesis.sectorZh ?? thesis.sector}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-faint">{thesis.theme}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`grid size-7 place-items-center rounded-full border font-display text-sm font-bold ${
                          isBull ? "border-up/60 text-up" : "border-down/60 text-down"
                        }`}
                      >
                        {isBull ? "多" : "空"}
                      </span>
                    </td>
                    <td className="num px-4 py-3 font-mono text-sm font-semibold text-foreground">
                      {thesis.conviction}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                      {STATUS_LABEL[thesis.status] ?? thesis.status}
                    </td>
                    {HORIZONS.map(({ key, days }) => (
                      <td key={key} className="whitespace-nowrap px-4 py-3">
                        <OutcomeCell thesis={thesis} horizon={key} days={days} now={now} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
