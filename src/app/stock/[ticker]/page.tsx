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

  const detailEvents = tickerEvents;
  const isPos = stock.changePct >= 0;

  return (
    <div className="w-full">
      <div className="mb-6 pt-2 sm:pt-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          全部股票
        </Link>
      </div>

      <div className="mb-8 rounded-2xl border border-border bg-surface px-6 py-6">
        <p className="mb-3 inline-block rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          {ticker.toUpperCase()}
        </p>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
          <p className="num font-mono text-5xl font-bold leading-none text-foreground sm:text-6xl md:text-7xl">
            ${stock.price.toFixed(2)}
          </p>
          <div className="max-w-full pb-1 sm:pb-2">
            <p
              className={`num flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-base font-semibold sm:text-lg ${
                isPos ? "bg-up/10 text-up" : "bg-down/10 text-down"
              }`}
            >
              {isPos ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {isPos ? "+" : ""}
              {stock.changePct.toFixed(2)}%
            </p>
            <p className="num mt-1.5 px-1 font-mono text-xs text-faint">
              {isPos ? "+" : ""}
              {stock.changeAmt.toFixed(2)} 今日
            </p>
          </div>
        </div>
      </div>

      {detailEvents.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">暂无近期事件或市场动态</p>
      ) : (
        <ExecutiveInsights stock={stock} events={detailEvents} />
      )}
    </div>
  );
}
