import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";

import { StockChart } from "@/components/StockChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventsByTicker, getStockByTicker } from "@/lib/data";

type StockDetailPageProps = {
  params: Promise<{
    ticker: string;
  }>;
};

const impactAccent = {
  BULLISH: "bg-emerald-400",
  BEARISH: "bg-rose-400",
  NEUTRAL: "bg-slate-400",
} as const;

export default async function StockDetailPage({ params }: StockDetailPageProps) {
  const { ticker } = await params;
  const stock = getStockByTicker(ticker);

  if (!stock) {
    notFound();
  }

  const events = getEventsByTicker(stock.ticker);
  const isPositive = stock.change >= 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-400"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-400/80">
              Stock Detail
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[#e8eaf0]">
              {stock.ticker}
            </h1>
            <p className="mt-2 text-base text-slate-400">{stock.name}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
          <p className="text-3xl font-semibold text-[#e8eaf0]">${stock.price.toFixed(2)}</p>
          <p
            className={`mt-2 flex items-center gap-2 text-sm ${
              isPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isPositive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            {isPositive ? "+" : ""}
            {stock.change.toFixed(2)}% ({isPositive ? "+" : ""}
            {stock.changeAmt.toFixed(2)})
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl text-[#e8eaf0]">30-Day Price Structure</CardTitle>
        </CardHeader>
        <CardContent>
          <StockChart ticker={stock.ticker} basePrice={stock.price} />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-400/80">
            Event Timeline
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#e8eaf0]">
            Recent Catalysts
          </h2>
        </div>

        <div className="space-y-4">
          {events.map((event) => (
            <Card
              key={event.id}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm"
            >
              <CardContent className="p-6">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`mt-1 size-3 rounded-full ${impactAccent[event.impact]}`} />
                    <div className="mt-2 h-full w-px bg-white/[0.08]" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                        {new Date(event.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                        {event.type.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-[#e8eaf0]">{event.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {event.description}
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr]">
                      <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                          AI Insight
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {event.aiInsight}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                          Win Rate
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-[#e8eaf0]">
                          {event.historicalWinRate}%
                        </p>
                        <p className="text-sm text-slate-400">
                          Avg return {event.avgReturn > 0 ? "+" : ""}
                          {event.avgReturn.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
