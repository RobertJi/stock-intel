"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Languages } from "lucide-react";

const EVENT_LABELS: Record<string, string> = {
  HIDE_INSIDER_SELL:    "重大事件",
  ALL:                  "全部",
  MARKET_NEWS:          "Market News",
  INSIDER_BUY:          "🟢 内幕买入",
  INSIDER_SELL:         "🔴 内幕卖出",
  EARNINGS:             "Earnings",
  EXECUTIVE_CHANGE:     "Executive",
  MATERIAL_AGREEMENT:   "Agreement",
  AGREEMENT_TERMINATED: "Terminated",
  ACQUISITION:          "Acquisition",
  REGULATION_FD:        "Reg FD",
  SHAREHOLDER_VOTE:     "Vote",
  DEBT_OBLIGATION:      "Debt",
  RESTATEMENT:          "Restatement",
  IMPAIRMENT:           "Impairment",
  OTHER_EVENTS:         "Other",
  SEC_8K:               "8-K",
};

const IMPACT_DOT: Record<string, string> = {
  BULLISH: "bg-[#1B4332]",
  BEARISH: "bg-[#7C1D1D]",
  NEUTRAL: "bg-[#5C5C6E]",
};

interface Event {
  ticker: string;
  type: string;
  title: string;
  date: string;
  link?: string | null;
  impact: string;
  description?: string;
}

// Placeholder market news items — replace with real data source later
const MARKET_NEWS_PLACEHOLDER: Event[] = [
  {
    ticker: "MARKET",
    type: "MARKET_NEWS",
    title: "Market News 功能即将上线",
    date: new Date().toISOString().slice(0, 10),
    impact: "NEUTRAL",
    description: "此标签页将整合市场宏观新闻、财经快讯和重要政策动态，提供全面的信号覆盖。",
  },
];

export function EventsFeed({ events }: { events: Event[] }) {
  const [activeFilter, setActiveFilter] = useState("HIDE_INSIDER_SELL");
  const [lang, setLang] = useState<"zh" | "en">("zh");

  // Build filter options from actual event types present
  const typesPresent = Array.from(new Set(events.map(e => e.type)));
  const filters = [
    "HIDE_INSIDER_SELL",
    "ALL",
    "MARKET_NEWS",
    ...typesPresent.filter(t => EVENT_LABELS[t] && t !== "MARKET_NEWS"),
  ];

  const allItems = activeFilter === "MARKET_NEWS"
    ? MARKET_NEWS_PLACEHOLDER
    : activeFilter === "ALL"
    ? events
    : activeFilter === "HIDE_INSIDER_SELL"
    ? events.filter(e => e.type !== "INSIDER_SELL")
    : events.filter(e => e.type === activeFilter);

  return (
    <div>
      {/* Filter tabs + lang toggle */}
      <div className="border-b border-[#D4CCB8] py-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {filters.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`font-mono text-[11px] tracking-wider uppercase px-3 py-1 rounded transition-colors whitespace-nowrap
                  ${activeFilter === f
                    ? "bg-[#1A1A2E] text-[#E8E3D8]"
                    : "text-[#5C5C6E] hover:text-[#1A1A2E] hover:bg-[#EDE8DE]"
                  }`}
              >
                {EVENT_LABELS[f] ?? f}
                {f !== "ALL" && f !== "HIDE_INSIDER_SELL" && f !== "MARKET_NEWS" && (
                  <span className="ml-1 opacity-50">
                    {events.filter(e => e.type === f).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Language toggle — always stays at end of flex row */}
          <button
            onClick={() => setLang(l => l === "zh" ? "en" : "zh")}
            className="flex shrink-0 items-center gap-1.5 rounded px-3 py-1 font-mono text-[11px] text-[#5C5C6E] transition-colors hover:bg-[#EDE8DE] hover:text-[#1A1A2E]"
            title="切换语言 / Toggle language"
          >
            <Languages className="size-3.5" />
            {lang === "zh" ? "中文" : "EN"}
          </button>
        </div>
      </div>

      {/* Events list */}
      <div className="divide-y divide-[#D4CCB8]">
        {allItems.length === 0 && (
          <p className="py-8 font-sans text-sm text-[#5C5C6E]">No events for this filter.</p>
        )}
        {allItems.map((event, i) => (
          <div
            key={i}
            className="group flex items-start gap-3 px-3 py-4 transition-colors hover:bg-[#EDE8DE] sm:gap-4 sm:px-4"
          >
            {/* Date */}
            <div className="hidden w-24 shrink-0 pt-0.5 sm:block">
              <p className="font-mono text-[11px] text-[#5C5C6E]">{event.date}</p>
            </div>
            {/* Ticker */}
            <div className="hidden w-14 shrink-0 pt-0.5 sm:block">
              {event.ticker === "MARKET" ? (
                <span className="font-mono text-xs font-medium text-[#B5882B] tracking-wider">NEWS</span>
              ) : (
                <Link href={`/stock/${event.ticker}`}
                  className="font-mono text-xs font-medium text-[#B5882B] tracking-wider hover:underline">
                  {event.ticker}
                </Link>
              )}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-3 sm:hidden">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-[#5C5C6E]">{event.date}</p>
                  {event.ticker === "MARKET" ? (
                    <span className="font-mono text-xs font-medium tracking-wider text-[#B5882B]">NEWS</span>
                  ) : (
                    <Link
                      href={`/stock/${event.ticker}`}
                      className="font-mono text-xs font-medium tracking-wider text-[#B5882B] hover:underline"
                    >
                      {event.ticker}
                    </Link>
                  )}
                </div>
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${IMPACT_DOT[event.impact] ?? "bg-[#5C5C6E]"}`}
                  aria-label={event.impact}
                  title={event.impact}
                />
              </div>
              <p className="break-words text-sm leading-snug font-medium text-[#1A1A2E]">{event.title}</p>
              {event.description && (
                <p className="line-clamp-3 break-words text-xs leading-relaxed text-[#5C5C6E]">
                  {lang === "zh" && (event as any).descriptionZh
                    ? (event as any).descriptionZh
                    : event.description}
                </p>
              )}
            </div>
            {/* Impact badge + link */}
            <div className="shrink-0 flex flex-col items-end gap-2 pt-0.5">
              <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                event.impact === "BULLISH"
                  ? "bg-[#1B4332]/15 text-[#1B4332]"
                  : event.impact === "BEARISH"
                  ? "bg-[#7C1D1D]/15 text-[#7C1D1D]"
                  : "bg-[#5C5C6E]/10 text-[#5C5C6E]"
              }`}>
                {event.impact === "BULLISH" ? "多" : event.impact === "BEARISH" ? "空" : "中性"}
              </span>
              {event.link && (
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded p-1.5 text-[#D4CCB8] transition-colors hover:bg-[#D4CCB8]/30 hover:text-[#B5882B] sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Open source"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
