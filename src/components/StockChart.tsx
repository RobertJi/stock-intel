"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  type TooltipProps,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

type StockChartProps = {
  ticker: string;
  basePrice: number;
};

function generateSeries(ticker: string, basePrice: number) {
  return Array.from({ length: 30 }, (_, index) => {
    const drift = (index - 15) * 0.85;
    const signal = Math.sin((index + ticker.charCodeAt(0)) / 3) * (basePrice * 0.012);
    const recoil = Math.cos((index + ticker.charCodeAt(1)) / 4) * (basePrice * 0.006);
    const price = Number((basePrice + drift + signal + recoil).toFixed(2));

    return {
      day: `D-${29 - index}`,
      price,
    };
  });
}

export function StockChart({ ticker, basePrice }: StockChartProps) {
  const data = generateSeries(ticker, basePrice);

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "#64748b", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={["dataMin - 10", "dataMax + 10"]}
            tick={{ fill: "#64748b", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#00e5ff"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, fill: "#00e5ff", stroke: "#080b14", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0f1524] px-4 py-3 shadow-2xl shadow-cyan-950/20 backdrop-blur-sm">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-300">
        Price{" "}
        <span className="font-semibold text-[#e8eaf0]">
          ${Number(payload[0].value).toFixed(2)}
        </span>
      </p>
    </div>
  );
}
