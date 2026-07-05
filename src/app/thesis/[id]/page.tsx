import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CircleCheck,
  CircleDot,
  CircleX,
  Crosshair,
  GitBranch,
  Hourglass,
} from "lucide-react";
import { getThesisById, getOutcomesForThesis, type InstrumentData, type ThesisOutcome } from "@/lib/db";
import { SignalText } from "@/components/SignalText";
import { Sparkline } from "@/components/Sparkline";

export const revalidate = 60;

const MARKET_LABEL: Record<string, string> = {
  US: "美股",
  HK: "港股",
  CN: "A股",
  JP: "日股",
  KR: "韩股",
};

const RELATION_LABEL: Record<string, string> = {
  direct: "直接相关",
  upstream: "上游",
  downstream: "下游",
  competitor: "竞争对手",
  customer: "客户",
  supplier: "供应商",
  partner: "合作方",
  proxy_etf: "ETF",
};

const SENSITIVITY_LABEL: Record<string, string> = {
  high: "高敏感",
  medium: "中敏感",
  low: "低敏感",
};

const SOURCE_LABEL: Record<string, string> = {
  news: "新闻",
  social: "社媒",
  search_trend: "搜索",
  price_move: "价格",
  benchmark: "评测",
  filing: "公告",
  macro: "宏观",
};

function pctTone(pct: number | null) {
  if (pct == null) return "text-faint";
  if (pct >= 2) return "text-up";
  if (pct <= -2) return "text-down";
  return "text-muted-foreground";
}

function fmtPct(pct: number | null) {
  if (pct == null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

const VERDICT_CONFIG = {
  hit: { label: "命中", icon: CircleCheck, cls: "border-up/30 bg-up/10 text-up" },
  miss: { label: "证伪", icon: CircleX, cls: "border-down/30 bg-down/10 text-down" },
  mixed: { label: "混杂", icon: CircleDot, cls: "border-warn/30 bg-warn/10 text-warn" },
} as const;

function OutcomeStrip({ outcomes }: { outcomes: ThesisOutcome[] }) {
  const byHorizon = new Map(outcomes.map((o) => [o.horizon, o]));
  const horizons = [
    { key: "t1", label: "T+1" },
    { key: "t5", label: "T+5" },
    { key: "t20", label: "T+20" },
  ] as const;

  return (
    <div className="mb-8 rounded-xl border border-border bg-surface px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Crosshair className="size-4 text-accent" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">判断回溯</p>
        </div>
        <Link
          href="/backtest"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          全部记录 →
        </Link>
      </div>
      <div className="flex flex-wrap gap-3">
        {horizons.map(({ key, label }) => {
          const outcome = byHorizon.get(key);
          if (outcome?.verdict) {
            const config = VERDICT_CONFIG[outcome.verdict];
            const Icon = config.icon;
            return (
              <span
                key={key}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-sm font-semibold ${config.cls}`}
              >
                <span className="text-xs font-normal text-muted-foreground">{label}</span>
                <Icon className="size-4" />
                {config.label}
                {outcome.avgReturn != null && (
                  <span className="num">
                    {outcome.avgReturn > 0 ? "+" : ""}
                    {outcome.avgReturn.toFixed(1)}%
                  </span>
                )}
              </span>
            );
          }
          return (
            <span
              key={key}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 font-mono text-sm text-faint"
            >
              <span className="text-xs">{label}</span>
              <Hourglass className="size-3.5" />
              待判定
            </span>
          );
        })}
      </div>
    </div>
  );
}

function InstrumentRow({ inst }: { inst: InstrumentData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/60 py-3 last:border-b-0">
      <div className="w-40 shrink-0">
        <p className="font-mono text-base font-semibold text-foreground">{inst.symbol}</p>
        <p className="text-sm text-muted-foreground">{inst.name ?? ""}</p>
      </div>
      <div className="flex w-36 shrink-0 flex-col gap-1">
        <span className="text-xs text-faint">
          {RELATION_LABEL[inst.relation] ?? inst.relation} · {SENSITIVITY_LABEL[inst.sensitivity] ?? inst.sensitivity}
        </span>
        <span className="num font-mono text-sm">
          <span className={pctTone(inst.pct5d)}>5日 {fmtPct(inst.pct5d)}</span>{" "}
          <span className={pctTone(inst.pct20d)}>20日 {fmtPct(inst.pct20d)}</span>
        </span>
      </div>
      <Sparkline data={inst.history} />
      <p className="min-w-52 flex-1 text-sm leading-relaxed text-muted-foreground">
        {inst.rationale ?? "—"}
      </p>
    </div>
  );
}

export default async function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, outcomes] = await Promise.all([
    getThesisById(id).catch(() => null),
    getOutcomesForThesis(id).catch(() => [] as ThesisOutcome[]),
  ]);
  if (!result) notFound();
  const { thesis, instruments } = result;

  const isBull = thesis.direction === "bullish";
  const Icon = isBull ? ArrowUpRight : ArrowDownRight;
  const tone = isBull ? "text-up" : "text-down";
  const barTone = isBull ? "bg-up" : "bg-down";
  const markets = ["US", "HK", "CN", "JP", "KR"].filter((m) =>
    instruments.some((i) => i.market === m)
  );

  return (
    <div className="w-full">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> 返回雷达
      </Link>

      <div className="mb-8 rounded-2xl border border-border bg-surface px-6 py-5">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
            {thesis.theme}
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-2 flex items-center gap-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {thesis.sectorZh ?? thesis.sector}
              <Icon className={"size-8 " + tone} />
            </h1>
            <SignalText
              text={thesis.summary ?? ""}
              className="max-w-3xl text-base leading-relaxed text-foreground/85"
            />
          </div>
          <div className="text-right">
            <p className={"num font-mono text-5xl font-bold " + tone}>{thesis.conviction}</p>
            <div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
              <div
                className={"h-full rounded-full " + barTone}
                style={{ width: `${Math.min(100, Math.max(0, thesis.conviction))}%` }}
              />
            </div>
            <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.2em] text-faint">信心分</p>
          </div>
        </div>
      </div>

      <OutcomeStrip outcomes={outcomes} />

      {thesis.transmission && (
        <div className="mb-8 rounded-xl border border-accent/20 bg-accent/[0.05] px-5 py-4">
          <div className="mb-1.5 flex items-center gap-2">
            <GitBranch className="size-4 text-accent" />
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">传导链</p>
          </div>
          <SignalText
            text={thesis.transmission}
            className="text-base leading-7 text-foreground/90"
          />
        </div>
      )}

      <div className="mb-8">
        <h2 className="mb-1 font-display text-2xl font-semibold tracking-tight text-foreground">受影响个股</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          由传导链推断的相关标的、影响逻辑与近 30 日走势
        </p>
        {instruments.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无映射标的,等待下轮管道运行补充。</p>
        ) : (
          markets.map((market) => (
            <div key={market} className="mb-5">
              <p className="mb-2 inline-block rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                {MARKET_LABEL[market] ?? market}
              </p>
              <div className="rounded-xl border border-border bg-surface px-5">
                {instruments
                  .filter((i) => i.market === market)
                  .map((inst) => (
                    <InstrumentRow key={inst.symbol} inst={inst} />
                  ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface px-5 py-4">
          <h2 className="mb-3 font-display text-xl font-semibold tracking-tight text-foreground">
            证据 <span className="num font-mono text-base text-faint">({thesis.evidence.length})</span>
          </h2>
          <ul className="space-y-2">
            {thesis.evidence.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm leading-snug">
                <span className="shrink-0 rounded border border-border bg-surface-2 px-1.5 py-px font-mono text-xs text-muted-foreground">
                  {SOURCE_LABEL[e.signal?.source_kind ?? ""] ?? e.signal?.source_kind}
                </span>
                <span className={e.stance === "weakens" ? "text-down/90" : "text-muted-foreground"}>
                  {e.signal?.url ? (
                    <a href={e.signal.url} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
                      {e.signal.title}
                    </a>
                  ) : (
                    e.signal?.title ?? e.reasoning
                  )}
                </span>
                <span className="num ml-auto shrink-0 font-mono text-xs text-faint">{e.weight}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          {thesis.confirmConditions.length > 0 && (
            <div className="rounded-xl border border-up/20 bg-up/[0.04] px-5 py-4">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-up">确认条件</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                {thesis.confirmConditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {thesis.invalidateConditions.length > 0 && (
            <div className="rounded-xl border border-down/20 bg-down/[0.04] px-5 py-4">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-down">失效条件</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                {thesis.invalidateConditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
