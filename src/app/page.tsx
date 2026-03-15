import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchStocks, fetchEvents } from "@/lib/server-data";

export const revalidate = 60;

export default async function Home() {
  const [stocks, events] = await Promise.all([fetchStocks(), fetchEvents()]);

  return (
    <div className="space-y-8">
      {/* Watchlist */}
      <section className="space-y-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-400/80">Market Pulse</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#e8eaf0]">Watchlist</h1>
        </div>
        <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
          {stocks.filter(s => !s.error).map((stock) => {
            const isPos = stock.changePct >= 0;
            return (
              <Link key={stock.ticker} href={`/stock/${stock.ticker}`}>
                <Card className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm transition duration-200 hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-xl tracking-tight text-[#e8eaf0]">{stock.ticker}</CardTitle>
                      </div>
                      {isPos ? <TrendingUp className="size-5 text-emerald-400" /> : <TrendingDown className="size-5 text-rose-400" />}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-3xl font-semibold text-[#e8eaf0]">${stock.price.toFixed(2)}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className={isPos ? "text-emerald-400" : "text-rose-400"}>
                        {isPos ? "+" : ""}{stock.changePct.toFixed(2)}%
                      </span>
                      <span className="text-slate-500">
                        {isPos ? "+" : ""}{stock.changeAmt.toFixed(2)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Events Feed */}
      <section className="space-y-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-400/80">Signal Stream</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#e8eaf0]">SEC Events Feed</h2>
          <p className="mt-1 text-sm text-slate-500">Real-time 8-K filings from SEC EDGAR</p>
        </div>
        <div className="space-y-3">
          {events.filter(e => !e.error).map((event, i) => (
            <Card key={i} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="mt-1.5 size-2.5 shrink-0 rounded-full bg-slate-400" />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-300 font-mono text-[10px]">
                        8-K
                      </Badge>
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">{event.ticker}</span>
                      <span className="font-mono text-xs text-slate-600">{event.date}</span>
                    </div>
                    <p className="text-sm text-[#e8eaf0]">{event.title}</p>
                  </div>
                  {event.link && (
                    <a href={event.link} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 text-slate-500 transition hover:text-cyan-400">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
