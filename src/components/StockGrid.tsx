"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { CalendarClock, TrendingDown, TrendingUp } from "lucide-react";

type Stock = {
  ticker: string;
  price: number;
  changePct: number;
  changeAmt: number;
  updatedAt: number;
  earningsDate?: string | null;
};

function getEarningsBadge(
  earningsDate: string | null | undefined
): { label: string; daysLeft: number } | null {
  if (!earningsDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ed = new Date(earningsDate + "T00:00:00");
  const daysLeft = Math.round((ed.getTime() - today.getTime()) / 86400000);
  if (daysLeft < 0 || daysLeft > 30) return null;
  const month = ed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const label = daysLeft === 0 ? "今日财报！" : `财报 in ${daysLeft}d · ${month}`;
  return { label, daysLeft };
}

export function StockGrid({ initialStocks }: { initialStocks: Stock[] }) {
  const [stocks, setStocks] = useState(initialStocks);
  const [freshTickers, setFreshTickers] = useState<Set<string>>(new Set());
  const prevUpdatedAt = useRef<Record<string, number>>(
    Object.fromEntries(initialStocks.map((s) => [s.ticker, s.updatedAt]))
  );

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/stocks", { cache: "no-store" });
        if (!res.ok) return;
        const data: Stock[] = await res.json();
        const changed = new Set<string>();
        for (const s of data) {
          if ((prevUpdatedAt.current[s.ticker] ?? 0) !== s.updatedAt) {
            changed.add(s.ticker);
          }
        }
        if (changed.size > 0) {
          setStocks(data);
          setFreshTickers(changed);
          prevUpdatedAt.current = Object.fromEntries(
            data.map((s) => [s.ticker, s.updatedAt])
          );
          setTimeout(() => setFreshTickers(new Set()), 3000);
        }
      } catch {
        // silently ignore
      }
    };

    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stocks.map((stock) => {
        const isPos = stock.changePct >= 0;
        const isFresh = freshTickers.has(stock.ticker);
        const badge = getEarningsBadge(stock.earningsDate);

        return (
          <Link
            key={stock.ticker}
            href={`/stock/${stock.ticker}`}
            className="group rounded-xl border border-border bg-surface px-5 py-4 transition-all hover:border-faint/50 hover:bg-surface-2"
          >
            <div className="mb-3 flex items-start justify-between">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-foreground/90 group-hover:bg-background">
                {stock.ticker}
              </span>
              <div className="flex items-center gap-1.5">
                {/* Fresh pulse dot — shows for 3s after data refreshes */}
                {isFresh && (
                  <span className="size-1.5 animate-pulse rounded-full bg-up" />
                )}
                {isPos ? (
                  <TrendingUp className="size-3.5 text-up" />
                ) : (
                  <TrendingDown className="size-3.5 text-down" />
                )}
              </div>
            </div>
            <p className="num mb-1.5 font-mono text-[1.75rem] font-semibold leading-none text-foreground">
              ${stock.price.toFixed(2)}
            </p>
            <p className="flex items-center gap-2 font-mono text-xs">
              <span
                className={`num rounded px-1.5 py-0.5 font-semibold ${
                  isPos ? "bg-up/10 text-up" : "bg-down/10 text-down"
                }`}
              >
                {isPos ? "+" : ""}
                {stock.changePct.toFixed(2)}%
              </span>
              <span className="num text-faint">
                {isPos ? "+" : ""}
                {stock.changeAmt.toFixed(2)}
              </span>
            </p>
            {badge && (
              <p
                className={`mt-2.5 flex items-center gap-1.5 font-mono text-xs ${
                  badge.daysLeft <= 3 ? "text-warn" : "text-faint"
                }`}
              >
                <CalendarClock className="size-3" />
                {badge.label}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
