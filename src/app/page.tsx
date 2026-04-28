import { fetchEvents, fetchStocks } from "@/lib/server-data";
import { EventsFeed } from "@/components/EventsFeed";
import { StockGrid } from "@/components/StockGrid";

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
              Market Overview
            </p>
            <h1 className="font-display text-4xl text-[#1A1A2E] sm:text-5xl">
              Watchlist
            </h1>
          </div>
          {updatedAt && (
            <p className="font-mono text-[10px] text-[#5C5C6E] sm:pb-1">
              Updated {updatedAt}
            </p>
          )}
        </div>
      </div>

      <StockGrid initialStocks={stocks} />

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
