"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";

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

  const total = stocks.length;
  const cols = 4;
  const smCols = 2;

  return (
    <div className="mb-10 grid gap-y-0 sm:grid-cols-2 lg:grid-cols-4">
      {stocks.map((stock, index) => {
        const isPos = stock.changePct >= 0;
        const isLastInLgRow = (index + 1) % cols === 0 || index === total - 1;
        const smRowCount = Math.ceil(total / smCols);
        const itemSmRow = Math.floor(index / smCols) + 1;
        const isLastSmRow = itemSmRow === smRowCount;
        const borderClass = !isLastInLgRow
          ? "lg:border-r lg:border-[#D4CCB8]"
          : "";
        const rowBorderClass = isLastSmRow ? "sm:border-b-0" : "";
        const isFresh = freshTickers.has(stock.ticker);
        const badge = getEarningsBadge(stock.earningsDate);

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
              <div className="flex items-center gap-1.5">
                {/* Fresh pulse dot — shows for 3s after data refreshes */}
                {isFresh && (
                  <span className="size-1.5 rounded-full bg-[#1B4332] animate-pulse" />
                )}
                {isPos ? (
                  <TrendingUp className="size-3.5 text-[#1B4332]" />
                ) : (
                  <TrendingDown className="size-3.5 text-[#7C1D1D]" />
                )}
              </div>
            </div>
            <p className="mb-1 font-display text-[2rem] leading-none text-[#1A1A2E] tabular-nums sm:text-4xl">
              ${stock.price.toFixed(2)}
            </p>
            <p
              className={`tabular-nums font-mono text-xs ${
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
            {badge && (
              <p
                className={`mt-2 font-mono text-[11px] ${
                  badge.daysLeft <= 3 ? "text-[#B5882B]" : "text-[#5C5C6E]"
                }`}
              >
                📅 {badge.label}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
