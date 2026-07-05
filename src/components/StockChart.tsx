"use client";

import dynamic from "next/dynamic";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface InsiderTrade {
  date: string;       // YYYY-MM-DD
  type: "INSIDER_BUY" | "INSIDER_SELL";
  shares: number;
  price: number;
  insiderName: string;
  insiderTitle: string;
}

type StockChartProps = {
  ticker: string;
  basePrice: number;
  history?: { date: string; close: number }[];
  insiderTrades?: InsiderTrade[];
};

const UP = "#0ECB81";
const DOWN = "#F6465D";

function generateSeries(ticker: string, basePrice: number) {
  return Array.from({ length: 30 }, (_, index) => {
    const drift = (index - 15) * 0.85;
    const signal = Math.sin((index + ticker.charCodeAt(0)) / 3) * (basePrice * 0.012);
    const recoil = Math.cos((index + ticker.charCodeAt(1)) / 4) * (basePrice * 0.006);
    return {
      day: `D-${29 - index}`,
      price: Number((basePrice + drift + signal + recoil).toFixed(2)),
    };
  });
}

// Custom dot for insider trade markers on the chart
function InsiderDot({ cx, cy, type }: { cx?: number; cy?: number; type: "BUY" | "SELL" }) {
  if (cx === undefined || cy === undefined) return null;
  const isBuy = type === "BUY";
  const color = isBuy ? UP : DOWN;
  // Triangle pointing up (buy) or down (sell)
  const size = 8;
  const points = isBuy
    ? `${cx},${cy - size} ${cx - size * 0.8},${cy + size * 0.5} ${cx + size * 0.8},${cy + size * 0.5}`
    : `${cx},${cy + size} ${cx - size * 0.8},${cy - size * 0.5} ${cx + size * 0.8},${cy - size * 0.5}`;
  return <polygon points={points} fill={color} opacity={0.9} />;
}

function StockChartInner({ ticker, basePrice, history, insiderTrades = [] }: StockChartProps) {
  const data = history?.length
    ? history.map((point) => ({
        day: point.date.slice(5), // MM-DD
        fullDate: point.date,
        price: point.close,
      }))
    : generateSeries(ticker, basePrice).map(d => ({ ...d, fullDate: d.day }));

  const trendUp = data.length > 1 && data[data.length - 1].price >= data[0].price;
  const lineColor = trendUp ? UP : DOWN;
  const gradientId = `price-fill-${ticker}`;

  // Map insider trades to chart x-axis labels (MM-DD)
  const tradeMarkers = insiderTrades
    .filter(t => data.some(d => d.fullDate === t.date || d.day === t.date.slice(5)))
    .map(t => ({
      ...t,
      xLabel: t.date.length >= 10 ? t.date.slice(5) : t.date,
      yPrice: data.find(d => d.fullDate === t.date || d.day === t.date.slice(5))?.price,
    }))
    .filter(t => t.yPrice !== undefined);

  const hasBuy = insiderTrades.some((trade) => trade.type === "INSIDER_BUY");
  const hasSell = insiderTrades.some((trade) => trade.type === "INSIDER_SELL");

  return (
    <div className="h-[320px] w-full rounded-xl border border-border bg-surface p-4">
      {/* Legend */}
      {insiderTrades.length > 0 && (
        <div className="mb-2 flex items-center gap-4">
          {hasBuy && (
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <polygon points="6,1 1,11 11,11" fill={UP} opacity="0.9" />
              </svg>
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">内幕买入</span>
            </div>
          )}
          {hasSell && (
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <polygon points="6,11 1,1 11,1" fill={DOWN} opacity="0.9" />
              </svg>
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">内幕卖出</span>
            </div>
          )}
        </div>
      )}

      <ResponsiveContainer width="100%" height={insiderTrades.length > 0 ? "88%" : "100%"}>
        <ComposedChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(230,236,245,0.06)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "#5C6A80", fontSize: 13.5 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            domain={["dataMin - 5", "dataMax + 5"]}
            tick={{ fill: "#5C6A80", fontSize: 13.5 }}
            axisLine={false}
            tickLine={false}
            width={60}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              // Check if there's an insider trade on this date
              const trade = tradeMarkers.find(t => t.xLabel === label);
              return (
                <div className="min-w-[140px] rounded-lg border border-border bg-[#161D2A] px-4 py-3 shadow-xl shadow-black/40">
                  <p className="font-mono text-xs text-muted-foreground">{label}</p>
                  <p className="num mt-1 font-mono text-sm font-semibold text-foreground">
                    ${Number(payload[0].value).toFixed(2)}
                  </p>
                  {trade && (
                    <div className={`mt-2 border-t border-white/10 pt-2 font-mono text-xs ${
                      trade.type === "INSIDER_BUY" ? "text-up" : "text-down"
                    }`}>
                      <p>{trade.type === "INSIDER_BUY" ? "▲ 内幕买入" : "▼ 内幕卖出"}</p>
                      <p className="text-muted-foreground">{trade.insiderName}</p>
                      <p>{trade.shares.toLocaleString()} 股 @ ${trade.price}</p>
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={lineColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: "#F0B429", stroke: "#0A0E16", strokeWidth: 2 }}
          />

          {/* Insider trade markers */}
          {tradeMarkers.map((t, i) => (
            <ReferenceDot
              key={i}
              x={t.xLabel}
              y={t.yPrice}
              shape={<InsiderDot type={t.type === "INSIDER_BUY" ? "BUY" : "SELL"} />}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export const StockChart = dynamic(() => Promise.resolve(StockChartInner), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full animate-pulse rounded-xl border border-border bg-surface" />,
});
