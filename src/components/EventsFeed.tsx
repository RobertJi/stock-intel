"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Languages } from "lucide-react";

const EVENT_LABELS: Record<string, string> = {
  HIDE_INSIDER_SELL:    "重大事件",
  ALL:                  "全部",
  MARKET_NEWS:          "市场新闻",
  INSIDER_BUY:          "🟢 内幕买入",
  INSIDER_SELL:         "🔴 内幕卖出",
  EARNINGS:             "财报事项",
  EXECUTIVE_CHANGE:     "高管变动",
  MATERIAL_AGREEMENT:   "重要协议",
  AGREEMENT_TERMINATED: "协议终止",
  ACQUISITION:          "并购交易",
  REGULATION_FD:        "Reg FD",
  SHAREHOLDER_VOTE:     "股东投票",
  DEBT_OBLIGATION:      "负债事项",
  RESTATEMENT:          "财报重述",
  IMPAIRMENT:           "减值计提",
  OTHER_EVENTS:         "其他",
  SEC_8K:               "8-K",
  CHARTER_AMENDMENT:    "章程修订",
  BANKRUPTCY:           "破产等事项",
  COST_REDUCTION:       "成本删减",
  DELISTING:            "退市风险",
  FINANCIAL_EXHIBITS:   "财务附件",
};

// 标题规则映射（不依赖 AI 翻译）
function localizeTitle(title: string, lang: "zh" | "en"): string {
  if (lang === "en") return title;
  // Insider trades
  const insiderSell = title.match(/(Insider\s+.*?Sale):\s*([\d,]+)\s+shares?/i);
  if (insiderSell) return `内幕人士卖出 ${insiderSell[2]} 股`;
  const insiderBuy = title.match(/(Insider\s+.*?Purchase):\s*([\d,]+)\s+shares?/i);
  if (insiderBuy) return `内幕人士买入 ${insiderBuy[2]} 股`;
  // Known English patterns
  const map: [RegExp, string][] = [
    [/earnings|financial results/i, "财报发布"],
    [/executive change|officer|director/i, "高管变动"],
    [/material.*agreement/i, "重要协议"],
    [/agreement.*terminat/i, "协议终止"],
    [/acquisition|merger/i, "并购交易"],
    [/shareholder.*vote/i, "股东投票"],
    [/debt|obligation/i, "负债事项"],
    [/restatement/i, "财报重述"],
    [/impairment/i, "减值计提"],
    [/charter|amendment/i, "章程修订"],
    [/regulation\s+fd/i, "Reg FD 公平信息掫露"],
  ];
  for (const [re, zh] of map) if (re.test(title)) return zh;
  return title; // fallback to original
}

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

  const allItems = activeFilter === "ALL"
    ? events
    : activeFilter === "HIDE_INSIDER_SELL"
    ? events.filter(e => e.type !== "INSIDER_SELL")
    : events.filter(e => e.type === activeFilter);

  return (
    <div>
      {/* Filter tabs + lang toggle */}
      <div className="border-b border-[#D4CCB8] py-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 min-w-0">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
            {filters.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`font-mono text-[11px] tracking-wider uppercase px-3 py-1 rounded transition-colors whitespace-nowrap shrink-0
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
            {lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </div>

      {/* Events list */}
      <div className="divide-y divide-[#D4CCB8]">
        {allItems.length === 0 && (
          <p className="py-8 font-sans text-sm text-[#5C5C6E]">暂无符合条件的信号</p>
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
              <p className="break-words text-sm leading-snug font-medium text-[#1A1A2E]">
                {lang === "zh" && (event as any).descriptionZh
                  ? (event as any).descriptionZh
                  : localizeTitle(event.title, lang)}
              </p>
              {event.description && (
                <p className="line-clamp-3 text-xs leading-relaxed text-[#5C5C6E]" style={{overflowWrap:'break-word'}}>
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
                  className="flex items-center justify-center rounded p-1.5 text-[#B5882B] transition-colors hover:bg-[#D4CCB8]/30"
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
