"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Languages, MoveHorizontal } from "lucide-react";

const EVENT_LABELS: Record<string, string> = {
  HIDE_INSIDER_SELL: "重大事件",
  ALL: "全部",
  MARKET_NEWS: "市场新闻",
  INSIDER_BUY: "🟢 内幕买入",
  INSIDER_SELL: "🔴 内幕卖出",
  EARNINGS: "财报事项",
  EXECUTIVE_CHANGE: "高管变动",
  MATERIAL_AGREEMENT: "重要协议",
  AGREEMENT_TERMINATED: "协议终止",
  ACQUISITION: "并购交易",
  REGULATION_FD: "Reg FD",
  SHAREHOLDER_VOTE: "股东投票",
  DEBT_OBLIGATION: "负债事项",
  RESTATEMENT: "财报重述",
  IMPAIRMENT: "减值计提",
  OTHER_EVENTS: "其他",
  SEC_8K: "8-K",
  CHARTER_AMENDMENT: "章程修订",
  BANKRUPTCY: "破产等事项",
  COST_REDUCTION: "成本删减",
  DELISTING: "退市风险",
  FINANCIAL_EXHIBITS: "财务附件",
};

function localizeTitle(title: string, lang: "zh" | "en"): string {
  if (lang === "en") return title;

  const insiderSell = title.match(/(Insider\s+.*?Sale):\s*([\d,]+)\s+shares?/i);
  if (insiderSell) return `内幕人士卖出 ${insiderSell[2]} 股`;
  const insiderBuy = title.match(/(Insider\s+.*?Purchase):\s*([\d,]+)\s+shares?/i);
  if (insiderBuy) return `内幕人士买入 ${insiderBuy[2]} 股`;

  const cleaned = title
    .replace(/^Item\s+\d+\.\d+\s*[—\-\.]*\s*/i, "")
    .replace(/\.?\s*Filed with the SEC\.?/i, "")
    .replace(/\.?\s*The information set forth in\.?/i, "")
    .replace(/^Entry into a?\s*/i, "")
    .trim();

  const map: [RegExp, string][] = [
    [/earnings|financial results/i, "财报发布"],
    [/executive change|officer|director/i, "高管变动"],
    [/material.*definitive.*agreement|material.*agreement/i, "重要协议签订"],
    [/agreement.*terminat/i, "协议终止"],
    [/acquisition|merger/i, "并购交易"],
    [/shareholder.*vote/i, "股东投票"],
    [/debt|obligation/i, "负债事项"],
    [/restatement/i, "财报重述"],
    [/impairment/i, "减值计提"],
    [/charter|amendment/i, "章程修订"],
    [/regulation\s+fd/i, "Reg FD 公平信息披露"],
    [/other events?/i, "其他公告事项"],
    [/unregistered.*sale|sale.*securities/i, "非公开发行证券"],
    [/^\s*$/i, "公告事项"],
  ];
  const target = cleaned || title;
  for (const [re, zh] of map) if (re.test(target)) return zh;
  return cleaned.length > 3 ? cleaned : title;
}

const IMPACT_DOT: Record<string, string> = {
  BULLISH: "bg-up",
  BEARISH: "bg-down",
  NEUTRAL: "bg-faint",
};

const IMPACT_SUMMARY = {
  BULLISH: {
    label: "今日最强利多",
    tone: "border-up/25 bg-up/[0.06] text-up glow-up",
    badge: "bg-up/15 text-up",
  },
  BEARISH: {
    label: "今日最强利空",
    tone: "border-down/25 bg-down/[0.06] text-down glow-down",
    badge: "bg-down/15 text-down",
  },
  NEUTRAL: {
    label: "需观察",
    tone: "border-warn/25 bg-warn/[0.06] text-warn",
    badge: "bg-warn/15 text-warn",
  },
} as const;

type EventMetadata = {
  insiderName?: string;
  insiderTitle?: string;
  shares?: number;
  price?: number;
  [key: string]: unknown;
};

interface Event {
  id?: number;
  ticker: string;
  type: string;
  title: string;
  date: string;
  link?: string | null;
  impact: string;
  description?: string;
  descriptionZh?: string;
  metadata?: EventMetadata;
}

export function EventsFeed({
  events,
  defaultFilter = "HIDE_INSIDER_SELL",
}: {
  events: Event[];
  defaultFilter?: string;
}) {
  const [activeFilter, setActiveFilter] = useState(defaultFilter);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const filterScrollRef = useRef<HTMLDivElement>(null);

  const updateScrollHints = useCallback(() => {
    const node = filterScrollRef.current;
    if (!node) return;

    const maxScrollLeft = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 4);
    setCanScrollRight(maxScrollLeft - node.scrollLeft > 4);
  }, []);

  const scrollFilters = useCallback((direction: "left" | "right") => {
    const node = filterScrollRef.current;
    if (!node) return;

    node.scrollBy({ left: direction === "left" ? -180 : 180, behavior: "smooth" });
  }, []);

  const typesPresent = Array.from(new Set(events.map((event) => event.type)));
  const filters = [
    "HIDE_INSIDER_SELL",
    "ALL",
    "MARKET_NEWS",
    ...typesPresent.filter((type) => EVENT_LABELS[type] && type !== "MARKET_NEWS"),
  ];

  const allItems =
    activeFilter === "ALL"
      ? events
      : activeFilter === "HIDE_INSIDER_SELL"
      ? events.filter((event) => event.type !== "INSIDER_SELL")
      : events.filter((event) => event.type === activeFilter);

  const summarySource = events.filter((event) => event.type !== "INSIDER_SELL");
  const summaryItems = (["BULLISH", "BEARISH", "NEUTRAL"] as const).map((impact) => {
    const item = summarySource.find((event) => event.impact === impact) ?? null;
    return { impact, item, config: IMPACT_SUMMARY[impact] };
  });

  useEffect(() => {
    updateScrollHints();

    const node = filterScrollRef.current;
    if (!node) return;

    const resizeObserver = new ResizeObserver(updateScrollHints);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [filters.length, updateScrollHints]);

  return (
    <div>
      <div className="grid gap-3 py-4 sm:grid-cols-3">
        {summaryItems.map(({ impact, item, config }) => (
          <div key={impact} className={`rounded-xl border px-4 py-3.5 ${config.tone}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.22em]">{config.label}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${config.badge}`}>
                {impact === "BULLISH" ? "多" : impact === "BEARISH" ? "空" : "观察"}
              </span>
            </div>
            {item ? (
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-mono text-xs font-semibold tracking-wider text-foreground">
                    {item.ticker === "MARKET" ? "NEWS" : item.ticker}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{EVENT_LABELS[item.type] ?? item.type}</span>
                </div>
                <p className="line-clamp-2 text-sm leading-relaxed text-foreground/85">
                  {lang === "zh" && item.descriptionZh ? item.descriptionZh : item.description || localizeTitle(item.title, lang)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-faint">暂无明显信号</p>
            )}
          </div>
        ))}
      </div>

      <div className="border-b border-border py-3">
        <div className="flex min-w-0 items-center gap-x-2">
          <div className="relative min-w-0 flex-1 overflow-hidden">
            {canScrollRight && (
              <>
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
                <button
                  onClick={() => scrollFilters("right")}
                  className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-surface-2 p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                  aria-label="向右查看更多筛选"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </>
            )}
            {canScrollLeft && (
              <>
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
                <button
                  onClick={() => scrollFilters("left")}
                  className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-surface-2 p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                  aria-label="向左查看更多筛选"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
              </>
            )}
          <div
            ref={filterScrollRef}
            className="flex gap-1.5 overflow-x-auto pb-3 pr-9 [scrollbar-width:thin] [scrollbar-color:#232e40_transparent] sm:pr-8 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#232e40] [&::-webkit-scrollbar-track]:bg-transparent"
            onScroll={updateScrollHints}
          >
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors ${
                  activeFilter === filter
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "border border-border bg-surface text-muted-foreground hover:border-faint/40 hover:text-foreground"
                }`}
              >
                {EVENT_LABELS[filter] ?? filter}
                {filter !== "ALL" && filter !== "HIDE_INSIDER_SELL" && filter !== "MARKET_NEWS" && (
                  <span className="ml-1 opacity-60">{events.filter((event) => event.type === filter).length}</span>
                )}
              </button>
            ))}
            {canScrollRight && (
              <div className="pointer-events-none mt-1 flex items-center justify-end gap-1 pr-1 font-mono text-xs uppercase tracking-[0.18em] text-accent sm:hidden">
                <MoveHorizontal className="size-3" />
                Swipe
              </div>
            )}
          </div>
          </div>
          <button
            onClick={() => setLang((value) => (value === "zh" ? "en" : "zh"))}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-faint/40 hover:text-foreground"
            title="切换语言 / Toggle language"
          >
            <Languages className="size-3.5" />
            {lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </div>

      <div className="divide-y divide-border/70">
        {allItems.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="font-display text-xl font-medium text-foreground">暂无符合条件的信号</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              试试切换上方筛选，或等待下一轮事件同步后刷新。
            </p>
          </div>
        )}
        {allItems.map((event, index) => {
          const metadata = event.metadata ?? {};
          const showExecutive = Boolean(metadata.insiderName && (event.type === "INSIDER_SELL" || event.type === "INSIDER_BUY"));

          return (
            <div
              key={event.id ?? `${event.ticker}-${event.date}-${index}`}
              className="group flex items-start gap-3 rounded-lg px-3 py-3.5 transition-colors hover:bg-surface-2/60 sm:gap-4 sm:px-4"
            >
              <div className="hidden w-20 shrink-0 pt-0.5 sm:block">
                <p className="num font-mono text-xs text-faint">{event.date}</p>
              </div>
              <div className="hidden w-16 shrink-0 pt-0.5 sm:block">
                {event.ticker === "MARKET" ? (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-accent">NEWS</span>
                ) : (
                  <Link
                    href={`/stock/${event.ticker}`}
                    className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {event.ticker}
                  </Link>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-1">
                <div className="flex items-start justify-between gap-3 pb-0.5 sm:hidden">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="num font-mono text-xs text-faint">{event.date}</p>
                    {event.ticker === "MARKET" ? (
                      <span className="font-mono text-xs font-semibold tracking-wider text-accent">NEWS</span>
                    ) : (
                      <Link
                        href={`/stock/${event.ticker}`}
                        className="font-mono text-xs font-semibold tracking-wider text-accent hover:underline"
                      >
                        {event.ticker}
                      </Link>
                    )}
                  </div>
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${IMPACT_DOT[event.impact] ?? "bg-faint"}`}
                    aria-label={event.impact}
                    title={event.impact}
                  />
                </div>
                {showExecutive && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-xs uppercase tracking-[0.14em] text-accent">
                      {metadata.insiderName}
                    </span>
                    {metadata.insiderTitle && <span className="min-w-0 break-words text-xs text-faint">{metadata.insiderTitle}</span>}
                  </div>
                )}
                <p className="break-words text-base font-medium leading-snug text-foreground">
                  {localizeTitle(event.title, lang)}
                </p>
                {event.description && (
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground sm:line-clamp-3" style={{ overflowWrap: "break-word" }}>
                    {lang === "zh" && event.descriptionZh ? event.descriptionZh : event.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
                <span
                  className={`hidden rounded-md px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider sm:inline-flex ${
                    event.impact === "BULLISH"
                      ? "bg-up/10 text-up"
                      : event.impact === "BEARISH"
                      ? "bg-down/10 text-down"
                      : "bg-surface-2 text-faint"
                  }`}
                >
                  {event.impact === "BULLISH" ? "多" : event.impact === "BEARISH" ? "空" : "中性"}
                </span>
                {event.link && (
                  <a
                    href={event.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center rounded-md p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-accent"
                    aria-label="Open source"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
