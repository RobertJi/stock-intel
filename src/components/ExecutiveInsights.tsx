"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { BarChart3, TrendingDown, Users } from "lucide-react";

import { EventsFeed } from "@/components/EventsFeed";
import { StockChart, type InsiderTrade } from "@/components/StockChart";
import { getExecutiveAvatar } from "@/lib/executive-avatars";
import type { EventData, StockData } from "@/lib/server-data";

type ExecutiveInsightsProps = {
  stock: StockData;
  events: EventData[];
};

type ExecutiveSummary = {
  name: string;
  title: string;
  bio: string;
  sellCount: number;
  totalShares: number;
  totalValue: number;
  latestDate: string;
  avatar: string;
  avatarUrl: string | null;
};

const RANGE_OPTIONS = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
] as const;

function formatShares(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatMoney(value: number) {
  if (!value) return "$0";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function initialsForName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function buildBio(title: string, sellCount: number, totalShares: number) {
  const role = title || "公司高管";
  return `${role}，近阶段披露 ${sellCount} 笔卖出，合计 ${formatShares(totalShares)} 股。`;
}

function daysDiffFromToday(date: string) {
  const now = new Date();
  const target = new Date(`${date}T00:00:00Z`);
  return Math.floor((now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
}

export function ExecutiveInsights({ stock, events }: ExecutiveInsightsProps) {
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]["days"]>(90);
  const [selectedExecutive, setSelectedExecutive] = useState<string | null>(null);

  const marketNews = useMemo(
    () => events.filter((event) => event.type === "MARKET_NEWS"),
    [events]
  );

  const companyNews = useMemo(
    () => marketNews.filter((event) => ((event.metadata ?? {}) as Record<string, unknown>).newsBucket === "company"),
    [marketNews]
  );

  const ecosystemNews = useMemo(
    () => marketNews.filter((event) => ((event.metadata ?? {}) as Record<string, unknown>).newsBucket === "ecosystem"),
    [marketNews]
  );

  const signalEvents = useMemo(
    () => events.filter((event) => event.type !== "MARKET_NEWS"),
    [events]
  );

  const allInsiderTrades = useMemo<InsiderTrade[]>(() => {
    return signalEvents
      .filter((event) => event.type === "INSIDER_BUY" || event.type === "INSIDER_SELL")
      .map((event) => {
        const metadata = (event.metadata ?? {}) as Record<string, unknown>;
        return {
          date: event.date,
          type: event.type as "INSIDER_BUY" | "INSIDER_SELL",
          shares: Number(metadata.shares ?? 0),
          price: Number(metadata.price ?? 0),
          insiderName: String(metadata.insiderName ?? ""),
          insiderTitle: String(metadata.insiderTitle ?? ""),
        };
      })
      .filter((trade) => trade.insiderName);
  }, [signalEvents]);

  const sellTradesInRange = useMemo(() => {
    return allInsiderTrades.filter(
      (trade) => trade.type === "INSIDER_SELL" && daysDiffFromToday(trade.date) <= rangeDays
    );
  }, [allInsiderTrades, rangeDays]);

  const executiveSummaries = useMemo<ExecutiveSummary[]>(() => {
    const map = new Map<string, ExecutiveSummary>();

    for (const trade of sellTradesInRange) {
      const current = map.get(trade.insiderName) ?? {
        name: trade.insiderName,
        title: trade.insiderTitle || "公司高管",
        bio: "",
        sellCount: 0,
        totalShares: 0,
        totalValue: 0,
        latestDate: trade.date,
        avatar: initialsForName(trade.insiderName),
        avatarUrl: getExecutiveAvatar(trade.insiderName),
      };

      current.sellCount += 1;
      current.totalShares += trade.shares;
      current.totalValue += trade.shares * trade.price;
      current.latestDate = current.latestDate > trade.date ? current.latestDate : trade.date;
      if (!current.title && trade.insiderTitle) current.title = trade.insiderTitle;
      map.set(trade.insiderName, current);
    }

    return Array.from(map.values())
      .map((executive) => ({
        ...executive,
        bio: buildBio(executive.title, executive.sellCount, executive.totalShares),
      }))
      .sort((a, b) => b.totalShares - a.totalShares);
  }, [sellTradesInRange]);

  const selectedSummary = selectedExecutive
    ? executiveSummaries.find((executive) => executive.name === selectedExecutive) ?? null
    : null;

  const chartTrades = useMemo(() => {
    if (!selectedExecutive) return allInsiderTrades;
    return allInsiderTrades.filter(
      (trade) => trade.type === "INSIDER_SELL" && trade.insiderName === selectedExecutive
    );
  }, [allInsiderTrades, selectedExecutive]);

  const filteredEvents = useMemo(() => {
    if (!selectedExecutive) {
      return [...companyNews, ...signalEvents].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return b.id - a.id;
      });
    }
    return signalEvents.filter((event) => {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      return String(metadata.insiderName ?? "") === selectedExecutive;
    });
  }, [companyNews, signalEvents, selectedExecutive]);

  const totals = useMemo(() => {
    return sellTradesInRange.reduce(
      (acc, trade) => {
        acc.shares += trade.shares;
        acc.value += trade.shares * trade.price;
        acc.count += 1;
        return acc;
      },
      { shares: 0, value: 0, count: 0 }
    );
  }, [sellTradesInRange]);

  const statCards = [
    { icon: Users, label: "活跃高管", value: String(executiveSummaries.length) },
    { icon: TrendingDown, label: "卖出总股数", value: formatShares(totals.shares) },
    { icon: BarChart3, label: "披露总金额", value: formatMoney(totals.value) },
    { icon: BarChart3, label: "卖出笔数", value: String(totals.count) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-faint">
              30 日走势
            </p>
            {selectedSummary ? (
              <p className="text-sm text-muted-foreground">
                当前只显示 <span className="text-accent">{selectedSummary.name}</span> 的卖出标记
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">默认显示全部内幕交易标记</p>
            )}
          </div>
        </div>
        <StockChart
          ticker={stock.ticker}
          basePrice={stock.price}
          history={stock.history}
          insiderTrades={chartTrades}
        />
      </div>

      <section className="space-y-4 border-t border-border pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.3em] text-accent">
              Executive Insights
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">高管卖出洞察</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              查看近一段时间内各位高管的卖出强度，选中某位后，图表与事件流会同步聚焦到该高管。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.days}
                onClick={() => setRangeDays(option.days)}
                className={`rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors ${
                  rangeDays === option.days
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "border border-border bg-surface text-muted-foreground hover:border-faint/40 hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {statCards.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center gap-2 text-faint">
                <Icon className="size-4" />
                <span className="font-mono text-xs uppercase tracking-[0.2em]">{label}</span>
              </div>
              <p className="num font-mono text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setSelectedExecutive(null)}
            className={`w-full rounded-xl border p-4 text-left transition-colors sm:w-[280px] ${
              selectedExecutive === null
                ? "border-accent/60 bg-accent/[0.08] ring-1 ring-accent/30"
                : "border-border bg-surface hover:border-faint/40 hover:bg-surface-2"
            }`}
          >
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-faint">All Executives</p>
            <p className="mt-2 font-display text-xl font-semibold text-foreground">全部高管</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              查看全部内幕交易记录，并对比近 {rangeDays} 天各位高管的卖出强度。
            </p>
          </button>

          {executiveSummaries.map((executive) => {
            const isActive = selectedExecutive === executive.name;
            return (
              <button
                key={executive.name}
                onClick={() => setSelectedExecutive(executive.name)}
                className={`w-full rounded-xl border p-4 text-left transition-colors sm:w-[280px] ${
                  isActive
                    ? "border-accent/60 bg-accent/[0.08] ring-1 ring-accent/30"
                    : "border-border bg-surface hover:border-faint/40 hover:bg-surface-2"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-surface-2 font-mono text-sm ${
                      isActive ? "border-accent" : "border-border"
                    }`}
                  >
                    {executive.avatarUrl ? (
                      <Image
                        src={executive.avatarUrl}
                        alt={`${executive.name} 头像`}
                        width={48}
                        height={48}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="text-foreground">{executive.avatar}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-semibold text-foreground">{executive.name}</p>
                    <p className="mt-1 line-clamp-2 font-mono text-xs uppercase tracking-[0.14em] text-faint">
                      {executive.title || "公司高管"}
                    </p>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{executive.bio}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-faint">总股数</p>
                    <p className="num mt-1 font-mono text-xl font-bold text-down">{formatShares(executive.totalShares)}</p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-faint">卖出笔数</p>
                    <p className="num mt-1 font-mono text-xl font-bold text-foreground">{executive.sellCount}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 font-mono text-xs text-faint">
                  <span>金额 {formatMoney(executive.totalValue)}</span>
                  <span className="num">最近 {executive.latestDate}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="border-b border-border py-5">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.3em] text-accent">
            Signal Flow
          </p>
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {selectedSummary ? `${selectedSummary.name} 的交易记录` : "近期事件与市场动态"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedSummary
              ? `当前仅展示 ${selectedSummary.name} 的内幕交易披露。`
              : "主信号流现在只放 SEC 事件和公司直接动态，竞争/生态新闻放到下方单独查看。"}
          </p>
        </div>

        {filteredEvents.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">暂无符合条件的事件</p>
        ) : (
          <EventsFeed
            key={`${selectedExecutive ?? 'all'}-${rangeDays}`}
            events={filteredEvents}
            defaultFilter={selectedExecutive ? "INSIDER_SELL" : "ALL"}
          />
        )}
      </section>

      {!selectedSummary && ecosystemNews.length > 0 && (
        <section className="border-t border-border">
          <div className="border-b border-border py-5">
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.3em] text-accent">
              Ecosystem Watch
            </p>
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">竞争与生态动态</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              这里放和该股票有关、但不属于公司直接动态的竞争格局、供应链、合作与生态新闻。
            </p>
          </div>
          <EventsFeed events={ecosystemNews} defaultFilter="MARKET_NEWS" />
        </section>
      )}
    </div>
  );
}
