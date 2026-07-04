import {
  ArrowDownRight,
  ArrowUpRight,
  GitBranch,
  Radar,
  ShieldAlert,
} from "lucide-react";
import type { MarketReactionEntry, ThesisData } from "@/lib/db";

const DIRECTION_CONFIG = {
  bullish: {
    label: "看多",
    icon: ArrowUpRight,
    tone: "border-[#1B4332]/25 bg-[#1B4332]/[0.055]",
    badge: "bg-[#1B4332]/12 text-[#1B4332]",
    iconTone: "text-[#1B4332]",
  },
  bearish: {
    label: "看空",
    icon: ArrowDownRight,
    tone: "border-[#7C1D1D]/25 bg-[#7C1D1D]/[0.055]",
    badge: "bg-[#7C1D1D]/12 text-[#7C1D1D]",
    iconTone: "text-[#7C1D1D]",
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
  price_move: "价格异动",
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
  if (pct >= 2) return "text-[#1B4332]";
  if (pct <= -2) return "text-[#7C1D1D]";
  return "text-[#5C5C6E]";
}

export function ThesisPanel({ theses }: { theses: ThesisData[] }) {
  if (theses.length === 0) return null;

  return (
    <section className="mb-10 border-b border-[#D4CCB8] pb-8">
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <Radar className="size-4 text-[#B5882B]" />
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
            Sector Radar
          </p>
        </div>
        <h2 className="font-display text-3xl text-[#1A1A2E] sm:text-4xl">
          板块论点
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {theses.map((thesis) => {
          const config = DIRECTION_CONFIG[thesis.direction] ?? DIRECTION_CONFIG.bullish;
          const Icon = config.icon;
          const reactions = marketRows(thesis.marketReaction);
          const evidence = thesis.evidence.slice(0, 4);
          const invalidate = thesis.invalidateConditions[0];

          return (
            <article key={thesis.id} className={"rounded-lg border px-5 py-4 " + config.tone}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold tracking-[0.14em] text-[#1A1A2E]">
                      {thesis.sectorZh ?? thesis.sector}
                    </span>
                    <span className={"rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " + config.badge}>
                      {config.label}
                    </span>
                    <span className="rounded bg-[#B5882B]/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#8A681F]">
                      {STATUS_LABEL[thesis.status] ?? thesis.status}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-snug text-[#1A1A2E]">
                    {thesis.summary ?? thesis.sector}
                  </p>
                </div>
                <div className="shrink-0 text-center">
                  <div className="grid size-12 place-items-center rounded border border-[#D4CCB8]/80 bg-[#F5F1E8]/70">
                    <span className="font-mono text-lg font-semibold text-[#1A1A2E]">
                      {thesis.conviction}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#5C5C6E]">
                    Conviction
                  </p>
                </div>
              </div>

              {thesis.transmission && (
                <div className="mb-3 rounded border border-[#D4CCB8]/80 bg-[#F5F1E8]/55 px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <GitBranch className="size-3 text-[#B5882B]" />
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#B5882B]">传导链</p>
                  </div>
                  <p className="text-xs leading-relaxed text-[#1A1A2E]">{thesis.transmission}</p>
                </div>
              )}

              {reactions.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#5C5C6E]">
                    近5日各市场反应
                  </p>
                  <div className="space-y-1">
                    {reactions.map(({ market, rows }) => (
                      <div key={market} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="w-7 shrink-0 font-mono text-[10px] font-semibold text-[#5C5C6E]">
                          {market}
                        </span>
                        {rows.slice(0, 4).map((r) => (
                          <span key={r.symbol} className="font-mono text-[11px] text-[#1A1A2E]">
                            {r.symbol}{" "}
                            <span className={pctTone(r.pct_5d) + " font-semibold"}>
                              {r.pct_5d > 0 ? "+" : ""}{r.pct_5d}%
                            </span>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {evidence.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#5C5C6E]">
                    证据 ({thesis.evidence.length})
                  </p>
                  <ul className="space-y-1">
                    {evidence.map((e, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-xs leading-snug">
                        <span className="shrink-0 rounded bg-[#EDE8DE] px-1.5 py-px font-mono text-[9px] text-[#5C5C6E]">
                          {SOURCE_LABEL[e.signal?.source_kind ?? ""] ?? e.signal?.source_kind}
                        </span>
                        <span className={e.stance === "weakens" ? "text-[#7C1D1D]" : "text-[#1A1A2E]"}>
                          {e.signal?.url ? (
                            <a href={e.signal.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {e.signal.title}
                            </a>
                          ) : (
                            e.signal?.title ?? e.reasoning
                          )}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-[#5C5C6E]">{e.weight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {invalidate && (
                <div className="flex items-start gap-1.5 text-[11px] leading-snug text-[#5C5C6E]">
                  <ShieldAlert className="mt-0.5 size-3 shrink-0 text-[#B5882B]" />
                  <span>失效条件:{invalidate}</span>
                </div>
              )}

              <div className={"mt-2 flex items-center justify-end " + config.iconTone}>
                <Icon className="size-4" />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
