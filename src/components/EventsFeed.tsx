"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Languages } from "lucide-react";

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
    .replace(/^Item\s+\d+\.\d+\s*[\u2014\-\.]*\s*/i, "")
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
  BULLISH: "bg-[#1B4332]",
  BEARISH: "bg-[#7C1D1D]",
  NEUTRAL: "bg-[#5C5C6E]",
};

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

  return (
    <div>
      <div className="border-b border-[#D4CCB8] py-4">
        <div className="flex min-w-0 items-center gap-x-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`shrink-0 whitespace-nowrap rounded px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  activeFilter === filter
                    ? "bg-[#1A1A2E] text-[#E8E3D8]"
                    : "text-[#5C5C6E] hover:bg-[#EDE8DE] hover:text-[#1A1A2E]"
                }`}
              >
                {EVENT_LABELS[filter] ?? filter}
                {filter !== "ALL" && filter !== "HIDE_INSIDER_SELL" && filter !== "MARKET_NEWS" && (
                  <span className="ml-1 opacity-50">{events.filter((event) => event.type === filter).length}</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setLang((value) => (value === "zh" ? "en" : "zh"))}
            className="flex shrink-0 items-center gap-1.5 rounded px-3 py-1 font-mono text-[11px] text-[#5C5C6E] transition-colors hover:bg-[#EDE8DE] hover:text-[#1A1A2E]"
            title="切换语言 / Toggle language"
          >
            <Languages className="size-3.5" />
            {lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </div>

      <div className="divide-y divide-[#D4CCB8]">
        {allItems.length === 0 && <p className="py-8 text-center font-sans text-sm text-[#5C5C6E]">暂无符合条件的信号</p>}
        {allItems.map((event, index) => {
          const metadata = event.metadata ?? {};
          const showExecutive = Boolean(metadata.insiderName && (event.type === "INSIDER_SELL" || event.type === "INSIDER_BUY"));

          return (
            <div
              key={event.id ?? `${event.ticker}-${event.date}-${index}`}
              className="group flex items-start gap-3 px-3 py-4 transition-colors hover:bg-[#EDE8DE] sm:gap-4 sm:px-4"
            >
              <div className="hidden w-24 shrink-0 pt-0.5 sm:block">
                <p className="font-mono text-[11px] text-[#5C5C6E]">{event.date}</p>
              </div>
              <div className="hidden w-14 shrink-0 pt-0.5 sm:block">
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
              <div className="min-w-0 flex-1 space-y-1">
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
                {showExecutive && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C5C6E]">
                    <span className="rounded-full bg-[#EDE8DE] px-2 py-1 font-mono uppercase tracking-[0.18em] text-[10px] text-[#B5882B]">
                      {metadata.insiderName}
                    </span>
                    {metadata.insiderTitle && <span className="text-[11px]">{metadata.insiderTitle}</span>}
                  </div>
                )}
                <p className="break-words font-medium text-sm leading-snug text-[#1A1A2E]">
                  {localizeTitle(event.title, lang)}
                </p>
                {event.description && (
                  <p className="line-clamp-3 text-xs leading-relaxed text-[#5C5C6E]" style={{ overflowWrap: "break-word" }}>
                    {lang === "zh" && event.descriptionZh ? event.descriptionZh : event.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                    event.impact === "BULLISH"
                      ? "bg-[#1B4332]/15 text-[#1B4332]"
                      : event.impact === "BEARISH"
                      ? "bg-[#7C1D1D]/15 text-[#7C1D1D]"
                      : "bg-[#5C5C6E]/10 text-[#5C5C6E]"
                  }`}
                >
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
          );
        })}
      </div>
    </div>
  );
}
