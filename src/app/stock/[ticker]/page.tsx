import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";

import { ExecutiveInsights } from "@/components/ExecutiveInsights";
import { fetchEvents, fetchStocks } from "@/lib/server-data";

type Props = { params: Promise<{ ticker: string }> };

export default async function StockDetailPage({ params }: Props) {
  const { ticker } = await params;
  const [stocks, tickerEvents] = await Promise.all([
    fetchStocks(),
    fetchEvents(ticker.toUpperCase(), 200),
  ]);
  const stock = stocks.find((entry) => entry.ticker === ticker.toUpperCase());

  if (!stock) notFound();

  const detailEvents = tickerEvents.filter((event) => event.type !== "MARKET_NEWS");
  const isPos = stock.changePct >= 0;

  return (
    <div className="max-w-5xl">
      <div className="mb-6 pt-2 sm:pt-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-[#5C5C6E] transition-colors hover:text-[#1A1A2E]"
        >
          <ArrowLeft className="size-3.5" />
          全部股票
        </Link>
      </div>

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
              {isPos ? "+" : ""}
              {stock.changePct.toFixed(2)}%
            </p>
            <p className="mt-0.5 font-mono text-xs text-[#5C5C6E]">
              {isPos ? "+" : ""}
              {stock.changeAmt.toFixed(2)} 今日
            </p>
          </div>
        </div>
      </div>

      {detailEvents.length === 0 ? (
        <p className="py-6 font-sans text-sm text-[#5C5C6E]">暂无近期事件</p>
      ) : (
        <ExecutiveInsights stock={stock} events={detailEvents} />
      )}
    </div>
  );
}
