import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";

import { fetchEvents, fetchStocks } from "@/lib/server-data";
import { EventsFeed } from "@/components/EventsFeed";

export const revalidate = 60;

export default async function Home() {
  const [stocks, events] = await Promise.all([fetchStocks(), fetchEvents()]);

  // Price freshness: use updatedAt from first stock
  const updatedAt = stocks[0]?.updatedAt
    ? new Date(stocks[0].updatedAt * 1000).toLocaleTimeString("zh-CN", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/New_York"
      }) + " ET"
    : null;

  return (
    <div className="max-w-6xl">
      <div className="mb-8 border-b border-[#D4CCB8] pb-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
              Market Overview
            </p>
            <h1 className="font-display text-4xl text-[#1A1A2E] sm:text-5xl">
              Watchlist
            </h1>
          </div>
          {updatedAt && (
            <p className="font-mono text-[10px] text-[#5C5C6E] pb-1">
              Updated {updatedAt}
            </p>
          )}
        </div>
      </div>

      <div className="mb-10 grid gap-y-0 sm:grid-cols-2 lg:grid-cols-4">
        {stocks.map((stock, index) => {
          const isPos = stock.changePct >= 0;
          const isLastRowOnTablet = index >= stocks.length - (stocks.length % 2 || 2);
          const borderClass =
            index < stocks.length - 1 ? "lg:border-r lg:border-[#D4CCB8]" : "";
          const rowBorderClass = isLastRowOnTablet ? "sm:border-b-0" : "";

          return (
            <Link
              key={stock.ticker}
              href={`/stock/${stock.ticker}`}
              className={`group border-b border-[#D4CCB8] px-5 py-5 transition-colors hover:bg-[#EDE8DE] sm:px-6 lg:border-b-0 ${borderClass} ${rowBorderClass}`}
            >
              <div className="mb-3 flex items-start justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#5C5C6E]">
                  {stock.ticker}
                </span>
                {isPos ? (
                  <TrendingUp className="size-3.5 text-[#1B4332]" />
                ) : (
                  <TrendingDown className="size-3.5 text-[#7C1D1D]" />
                )}
              </div>
              <p className="mb-1 break-words font-display text-[2rem] leading-none text-[#1A1A2E] sm:text-4xl">
                ${stock.price.toFixed(2)}
              </p>
              <p
                className={`font-mono text-xs ${
                  isPos ? "text-[#1B4332]" : "text-[#7C1D1D]"
                }`}
              >
                {isPos ? "+" : ""}
                {stock.changePct.toFixed(2)}%
                <span className="ml-2 text-[#9A9AAA]">
                  {isPos ? "+" : ""}
                  {stock.changeAmt.toFixed(2)}
                </span>
              </p>
            </Link>
          );
        })}
      </div>

      <div className="border-t border-[#D4CCB8]">
        <div className="py-6 border-b border-[#D4CCB8]">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
            Signal Stream
          </p>
          <h2 className="font-display text-2xl text-[#1A1A2E] sm:text-3xl">
            SEC Filings
          </h2>
        </div>
        <EventsFeed events={events} />
      </div>
    </div>
  );
}
