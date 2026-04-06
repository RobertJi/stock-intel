import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";

import { StockChart, type InsiderTrade } from "@/components/StockChart";
import { EventsFeed } from "@/components/EventsFeed";
import { fetchEvents, fetchStocks } from "@/lib/server-data";

type Props = { params: Promise<{ ticker: string }> };

export default async function StockDetailPage({ params }: Props) {
  const { ticker } = await params;
  const [stocks, allEvents] = await Promise.all([fetchStocks(), fetchEvents()]);
  const stock = stocks.find((entry) => entry.ticker === ticker.toUpperCase());

  if (!stock) notFound();

  // Only this ticker's events, exclude market news (those are global)
  const tickerEvents = allEvents.filter(
    (e) => e.ticker === ticker.toUpperCase() && e.type !== "MARKET_NEWS"
  );
  const isPos = stock.changePct >= 0;

  const insiderTrades: InsiderTrade[] = tickerEvents
    .filter((e) => e.type === "INSIDER_BUY" || e.type === "INSIDER_SELL")
    .map((e) => {
      const meta = (e as any).metadata ?? {};
      return {
        date: e.date,
        type: e.type as "INSIDER_BUY" | "INSIDER_SELL",
        shares: meta.shares ?? 0,
        price: meta.price ?? 0,
        insiderName: meta.insiderName ?? "",
        insiderTitle: meta.insiderTitle ?? "",
      };
    });

  return (
    <div className="max-w-5xl">
      {/* Back */}
      <div className="mb-6 pt-2 sm:pt-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-[#5C5C6E] transition-colors hover:text-[#1A1A2E]"
        >
          <ArrowLeft className="size-3.5" />
          全部股票
        </Link>
      </div>

      {/* Price header */}
      <div className="mb-6 border-b border-[#D4CCB8] pb-6">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
          {ticker.toUpperCase()}
        </p>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
          <p className="font-display text-4xl leading-none text-[#1A1A2E] tabular-nums sm:text-6xl md:text-7xl">
            ${stock.price.toFixed(2)}
          </p>
          <div className="max-w-full pb-1 sm:pb-2">
            <p
              className={`flex flex-wrap items-center gap-2 font-mono text-base sm:text-lg ${
                isPos ? "text-[#1B4332]" : "text-[#7C1D1D]"
              }`}
            >
              {isPos ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {isPos ? "+" : ""}{stock.changePct.toFixed(2)}%
            </p>
            <p className="mt-0.5 font-mono text-xs text-[#5C5C6E]">
              {isPos ? "+" : ""}{stock.changeAmt.toFixed(2)} 今日
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-8">
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C6E]">
          30 日走势
        </p>
        <StockChart
          ticker={stock.ticker}
          basePrice={stock.price}
          history={stock.history}
          insiderTrades={insiderTrades}
        />
      </div>

      {/* Events with filter tabs — reuse EventsFeed */}
      <div className="border-t border-[#D4CCB8]">
        <div className="border-b border-[#D4CCB8] py-5">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
            信号流
          </p>
          <h2 className="font-display text-xl text-[#1A1A2E] sm:text-2xl">
            近期事件
          </h2>
        </div>

        {tickerEvents.length === 0 ? (
          <p className="py-6 font-sans text-sm text-[#5C5C6E]">暂无近期事件</p>
        ) : (
          <EventsFeed events={tickerEvents} />
        )}
      </div>
    </div>
  );
}
