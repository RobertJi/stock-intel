import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Radar,
  Scale,
  TrendingUpDown,
} from "lucide-react";
import { SignalPoints, SignalText } from "@/components/SignalText";
import { themeAnchor } from "@/lib/anchors";
import type { MarketReactionEntry, ThemeOverview, ThesisData } from "@/lib/db";

const STANCE_CONFIG = {
  bullish: { label: "整体看多", cls: "border-up/30 bg-up/10 text-up" },
  bearish: { label: "整体看空", cls: "border-down/30 bg-down/10 text-down" },
  mixed: { label: "多空分歧", cls: "border-warn/30 bg-warn/10 text-warn" },
} as const;

const DIRECTION_CONFIG = {
  bullish: {
    label: "看多",
    icon: ArrowUpRight,
    edge: "before:bg-up",
    badge: "bg-up/10 text-up",
    scoreTone: "text-up",
    barTone: "bg-up",
    stamp: "多",
    stampCls: "border-up/70 bg-up/[0.07] text-up shadow-[0_0_16px_-6px] shadow-up/40",
  },
  bearish: {
    label: "看空",
    icon: ArrowDownRight,
    edge: "before:bg-down",
    badge: "bg-down/10 text-down",
    scoreTone: "text-down",
    barTone: "bg-down",
    stamp: "空",
    stampCls: "border-down/70 bg-down/[0.07] text-down shadow-[0_0_16px_-6px] shadow-down/40",
  },
} as const;

const STATUS_LABEL: Record<string, string> = {
  forming: "形成中",
  active: "活跃",
  confirmed: "已确认",
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

const MARKET_ORDER = ["US", "HK", "CN", "JP", "KR"];

function marketRows(reaction: ThesisData["marketReaction"]) {
  return MARKET_ORDER.filter(
    (m) => Array.isArray(reaction[m]) && (reaction[m] as MarketReactionEntry[]).length > 0
  ).map((m) => ({ market: m, rows: reaction[m] as MarketReactionEntry[] }));
}

function pctTone(pct: number) {
  if (pct >= 2) return "text-up";
  if (pct <= -2) return "text-down";
  return "text-muted-foreground";
}

function groupByTheme(theses: ThesisData[]) {
  const groups = new Map<string, ThesisData[]>();
  for (const t of theses) {
    const key = t.theme || "其他";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return [...groups.entries()].sort(
    (a, b) =>
      Math.max(...b[1].map((t) => t.conviction)) - Math.max(...a[1].map((t) => t.conviction))
  );
}

export function ThesisPanel({
  theses,
  overviews = {},
}: {
  theses: ThesisData[];
  overviews?: Record<string, ThemeOverview>;
}) {
  if (theses.length === 0) return null;
  const groups = groupByTheme(theses);

  return (
    <section className="mb-12">
      <div className="mb-6 flex items-center gap-2">
        <Radar className="size-4 text-accent" />
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
          板块论点
        </p>
      </div>

      {groups.map(([theme, group]) => {
        const ov = overviews[theme];
        const stance = ov ? STANCE_CONFIG[ov.stance] ?? STANCE_CONFIG.mixed : null;
        const bull = group.filter((t) => t.direction === "bullish").length;
        const bear = group.filter((t) => t.direction === "bearish").length;
        const bullRatio = bull + bear > 0 ? (bull / (bull + bear)) * 100 : 50;

        return (
          <div key={theme} id={themeAnchor(theme)} className="mb-12 scroll-mt-8">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                {theme}
              </h3>
              {stance && (
                <span
                  className={
                    "rounded-md border px-2.5 py-0.5 font-mono text-xs font-medium " + stance.cls
                  }
                >
                  {stance.label}
                </span>
              )}
              {/* 多空比例条 */}
              <div className="flex items-center gap-2">
                <span className="num font-mono text-xs font-semibold text-up">{bull}多</span>
                <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                  <div className="bg-up" style={{ width: `${bullRatio}%` }} />
                  <div className="bg-down" style={{ width: `${100 - bullRatio}%` }} />
                </div>
                <span className="num font-mono text-xs font-semibold text-down">{bear}空</span>
              </div>
            </div>

            {ov?.intro && (
              <SignalText
                text={ov.intro}
                className="mb-2 max-w-4xl text-base leading-7 text-muted-foreground"
              />
            )}
            {ov && (ov.stanceReason || ov.outlook) && (
              <details className="group mb-5 max-w-4xl">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-accent/80 transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                  整体判断与趋势预测
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3 space-y-3">
                  {ov.stanceReason && (
                    <div className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent">
                      <div className="mb-2.5 flex items-center gap-2">
                        <Scale className="size-4 text-accent" />
                        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                          整体判断
                        </p>
                      </div>
                      <SignalText
                        text={ov.stanceReason}
                        lead
                        className="text-base leading-7 text-muted-foreground"
                      />
                    </div>
                  )}
                  {ov.outlook && (
                    <div className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-up">
                      <div className="mb-2.5 flex items-center gap-2">
                        <TrendingUpDown className="size-4 text-up" />
                        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-up">
                          趋势预测
                        </p>
                      </div>
                      <SignalPoints
                        text={ov.outlook}
                        className="text-base leading-7 text-muted-foreground"
                      />
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {group.map((thesis) => {
                const config = DIRECTION_CONFIG[thesis.direction] ?? DIRECTION_CONFIG.bullish;
                const reactions = marketRows(thesis.marketReaction);
                const evidence = thesis.evidence.slice(0, 5);
                const invalidate = thesis.invalidateConditions[0];

                return (
                  <article
                    key={thesis.id}
                    className={
                      "relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-faint/40 before:absolute before:inset-y-0 before:left-0 before:w-[3px] " +
                      config.edge
                    }
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 pt-1">
                        {thesis.status !== "active" && (
                          <span className="mb-1.5 inline-block rounded bg-warn/10 px-2 py-0.5 font-mono text-xs text-warn">
                            {STATUS_LABEL[thesis.status] ?? thesis.status}
                          </span>
                        )}
                        <Link href={`/thesis/${thesis.id}`}>
                          <h4 className="font-display text-xl font-semibold leading-tight tracking-tight text-foreground transition-colors hover:text-accent">
                            {thesis.sectorZh ?? thesis.sector}
                          </h4>
                        </Link>
                      </div>
                      <div className="flex shrink-0 items-start gap-3.5">
                        <div
                          className="text-right"
                          title="信心分:由证据数量、来源多样性、证据强度、时效与已定价程度合成"
                        >
                          <span className={"num font-mono text-3xl font-bold " + config.scoreTone}>
                            {thesis.conviction}
                          </span>
                          <div className="mt-1.5 h-1 w-14 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className={"h-full rounded-full " + config.barTone}
                              style={{ width: `${Math.min(100, Math.max(0, thesis.conviction))}%` }}
                            />
                          </div>
                          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">信心分</p>
                        </div>
                        {/* 多/空 印章 */}
                        <span
                          aria-label={config.label}
                          title={config.label}
                          className={
                            "grid size-12 shrink-0 -rotate-6 select-none place-items-center rounded-full border-2 font-display text-2xl font-bold " +
                            config.stampCls
                          }
                        >
                          {config.stamp}
                        </span>
                      </div>
                    </div>

                    <SignalText
                      text={thesis.summary ?? thesis.sector}
                      className="mb-3 line-clamp-3 text-base leading-relaxed text-muted-foreground"
                    />

                    {reactions.length > 0 && (
                      <div className="mb-3 space-y-1 rounded-lg border border-border/70 bg-surface-2/50 px-3 py-2">
                        {reactions.map(({ market, rows }) => (
                          <div key={market} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <span className="w-7 shrink-0 font-mono text-xs font-semibold uppercase text-faint">
                              {market}
                            </span>
                            {rows.slice(0, 4).map((r) => (
                              <span key={r.symbol} className="num font-mono text-sm text-foreground/80">
                                {r.symbol}{" "}
                                <span className={pctTone(r.pct_5d) + " font-semibold"}>
                                  {r.pct_5d > 0 ? "+" : ""}{r.pct_5d}%
                                </span>
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto flex items-center justify-between gap-3">
                      <Link
                        href={`/thesis/${thesis.id}`}
                        className="text-sm font-medium text-accent/90 transition-colors hover:text-accent"
                      >
                        受影响个股 →
                      </Link>
                    </div>
                    <details className="group mt-2">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-faint transition-colors hover:text-muted-foreground [&::-webkit-details-marker]:hidden">
                        传导链与证据({thesis.evidence.length})
                        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-3 space-y-3">
                        {thesis.transmission && (
                          <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
                            <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-accent/80">传导链</p>
                            <SignalText
                              text={thesis.transmission}
                              className="text-sm leading-relaxed text-foreground/85"
                            />
                          </div>
                        )}
                        {evidence.length > 0 && (
                          <ul className="space-y-1.5">
                            {evidence.map((e, i) => (
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
                              </li>
                            ))}
                          </ul>
                        )}
                        {invalidate && (
                          <p className="text-xs leading-snug text-down/70">
                            失效条件:{invalidate}
                          </p>
                        )}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
