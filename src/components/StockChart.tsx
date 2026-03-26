"use client";

import dynamic from "next/dynamic";
import {
  CartesianGrid,
  Line,
  LineChart,
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
  const color = isBuy ? "#1B4332" : "#7C1D1D";
  // Triangle pointing up (buy) or down (sell)
  const size = 8;
  const points = isBuy
    ? `${cx},${cy - size} ${cx - size * 0.8},${cy + size * 0.5} ${cx + size * 0.8},${cy + size * 0.5}`
    : `${cx},${cy + size} ${cx - size * 0.8},${cy - size * 0.5} ${cx + size * 0.8},${cy - size * 0.5}`;
  return <polygon points={points} fill={color} opacity={0.85} />;
}

function StockChartInner({ ticker, basePrice, history, insiderTrades = [] }: StockChartProps) {
  const data = history?.length
    ? history.map((point) => ({
        day: point.date.slice(5), // MM-DD
        fullDate: point.date,
        price: point.close,
      }))
    : generateSeries(ticker, basePrice).map(d => ({ ...d, fullDate: d.day }));

  // Map insider trades to chart x-axis labels (MM-DD)
  const tradeMarkers = insiderTrades
    .filter(t => data.some(d => d.fullDate === t.date || d.day === t.date.slice(5)))
    .map(t => ({
      ...t,
      xLabel: t.date.length >= 10 ? t.date.slice(5) : t.date,
      yPrice: data.find(d => d.fullDate === t.date || d.day === t.date.slice(5))?.price,
    }))
    .filter(t => t.yPrice !== undefined);

  return (
    <div className="h-[320px] w-full">
      {/* Legend */}
      {insiderTrades.length > 0 && (
        <div className="mb-2 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <polygon points="6,1 1,11 11,11" fill="#1B4332" opacity="0.85" />
            </svg>
            <span className="font-mono text-[10px] text-[#5C5C6E] uppercase tracking-wider">Insider Buy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <polygon points="6,11 1,1 11,1" fill="#7C1D1D" opacity="0.85" />
            </svg>
            <span className="font-mono text-[10px] text-[#5C5C6E] uppercase tracking-wider">Insider Sell</span>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={insiderTrades.length > 0 ? "90%" : "100%"}>
        <LineChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(26,26,46,0.08)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "#5C5C6E", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            domain={["dataMin - 5", "dataMax + 5"]}
            tick={{ fill: "#5C5C6E", fontSize: 11 }}
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
                <div className="rounded border border-[#1A1A2E]/10 bg-[#1A1A2E] px-4 py-3 shadow-lg min-w-[140px]">
                  <p className="font-mono text-xs text-[#E8E3D8]/70">{label}</p>
                  <p className="mt-1 font-mono text-sm text-[#E8E3D8]">
                    ${Number(payload[0].value).toFixed(2)}
                  </p>
                  {trade && (
                    <div className={`mt-2 border-t border-white/10 pt-2 font-mono text-[10px] ${
                      trade.type === "INSIDER_BUY" ? "text-[#86EFAC]" : "text-[#FCA5A5]"
                    }`}>
                      <p>{trade.type === "INSIDER_BUY" ? "▲ 内幕买入" : "▼ 内幕卖出"}</p>
                      <p className="text-[#E8E3D8]/60">{trade.insiderName?.split(" ").slice(-1)[0]}</p>
                      <p>{trade.shares.toLocaleString()} 股 @ ${trade.price}</p>
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#1B4332"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: "#B5882B", stroke: "#F5F0E8", strokeWidth: 2 }}
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
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export const StockChart = dynamic(() => Promise.resolve(StockChartInner), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full animate-pulse bg-[#EDE8DE]" />,
});
