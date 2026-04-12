import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";

// Upcoming earnings dates (YYYY-MM-DD). Update each quarter.
const EARNINGS_DATES: Record<string, string> = {
  META: "2026-04-29",
  NFLX: "2026-04-15",
  NVDA: "2026-05-28",
  OXY: "2026-05-05",
};

function getEarningsBadge(ticker: string): { label: string; daysLeft: number } | null {
  const dateStr = EARNINGS_DATES[ticker];
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earningsDate = new Date(dateStr + "T00:00:00");
  const daysLeft = Math.round((earningsDate.getTime() - today.getTime()) / 86400000);
  if (daysLeft < 0 || daysLeft > 30) return null;
  const month = earningsDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { label: `财报 in ${daysLeft}d · ${month}`, daysLeft };
}

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
          const total = stocks.length;
          const cols = 4;
          const smCols = 2;
          // lg: only add right border if not the last in the row
          const isLastInLgRow = (index + 1) % cols === 0 || index === total - 1;
          // sm: hide bottom border for last row items
          const smRowCount = Math.ceil(total / smCols);
          const itemSmRow = Math.floor(index / smCols) + 1;
          const isLastSmRow = itemSmRow === smRowCount;
          const borderClass = !isLastInLgRow ? "lg:border-r lg:border-[#D4CCB8]" : "";
          const rowBorderClass = isLastSmRow ? "sm:border-b-0" : "";

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
              <p className="mb-1 font-display text-[2rem] leading-none text-[#1A1A2E] sm:text-4xl tabular-nums">
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
              {(() => {
                const badge = getEarningsBadge(stock.ticker);
                if (!badge) return null;
                return (
                  <p className={`mt-2 font-mono text-[10px] ${
                    badge.daysLeft <= 3 ? "text-[#B5882B]" : "text-[#5C5C6E]"
                  }`}>
                    📅 {badge.label}
                  </p>
                );
              })()}
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
            Events & News
          </h2>
        </div>
        <EventsFeed events={events} />
      </div>
    </div>
  );
}
