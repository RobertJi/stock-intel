import { fmtBig, fmtUsd } from "@/lib/value";

/** 年度营收 + 所有者盈余柱状图(服务端渲染的 SVG,不依赖客户端)。 */
export function FundamentalsChart({
  years,
}: {
  years: { fy_end: string; revenue: number | null; owner_earnings: number | null }[];
}) {
  const W = 640;
  const H = 220;
  const padL = 56;
  const padB = 28;
  const padT = 12;
  const vals = years.flatMap((y) => [y.revenue ?? 0, y.owner_earnings ?? 0]);
  const max = Math.max(...vals, 1);
  const min = Math.min(0, ...vals);
  const y = (v: number) => padT + ((max - v) / (max - min)) * (H - padT - padB);
  const slot = (W - padL) / years.length;
  const bw = Math.min(18, slot / 3);
  const ticks = [max, max / 2, 0, ...(min < 0 ? [min] : [])];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="年度营收与所有者盈余">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? "" : "3 4"} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-[var(--faint)] font-mono text-[10px]">
            {fmtBig(t)}
          </text>
        </g>
      ))}
      {years.map((yr, i) => {
        const cx = padL + slot * i + slot / 2;
        const rev = yr.revenue ?? 0;
        const oe = yr.owner_earnings ?? 0;
        return (
          <g key={yr.fy_end}>
            <rect x={cx - bw - 1} y={y(Math.max(rev, 0))} width={bw} height={Math.abs(y(rev) - y(0))} fill="var(--muted-foreground)" fillOpacity={0.45}>
              <title>{`${yr.fy_end} 营收 ${fmtBig(yr.revenue)}`}</title>
            </rect>
            <rect x={cx + 1} y={y(Math.max(oe, 0))} width={bw} height={Math.abs(y(oe) - y(0))} fill={oe >= 0 ? "var(--up)" : "var(--down)"} fillOpacity={0.85}>
              <title>{`${yr.fy_end} 所有者盈余 ${fmtBig(yr.owner_earnings)}`}</title>
            </rect>
            <text x={cx} y={H - 8} textAnchor="middle" className="fill-[var(--faint)] font-mono text-[10px]">
              {yr.fy_end.slice(2, 4)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 5 年周线价格 + 基准价值 / 买入价水平线。 */
export function PriceChart({ history, base, buy }: { history: [number, number][]; base?: number; buy?: number }) {
  if (history.length < 2) return <p className="text-sm text-faint">暂无价格历史</p>;
  const W = 640;
  const H = 220;
  const padL = 56;
  const padB = 24;
  const padT = 12;
  const closes = history.map((h) => h[1]);
  const lines = [base, buy].filter((v): v is number => v != null);
  const max = Math.max(...closes, ...lines) * 1.05;
  const min = Math.min(...closes, ...lines) * 0.95;
  const x = (i: number) => padL + (i / (history.length - 1)) * (W - padL);
  const y = (v: number) => padT + ((max - v) / (max - min)) * (H - padT - padB);
  const path = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h[1]).toFixed(1)}`).join(" ");
  const years = history
    .map((h, i) => ({ i, d: new Date(h[0] * 1000) }))
    .filter((p, idx, arr) => idx === 0 || p.d.getUTCFullYear() !== arr[idx - 1].d.getUTCFullYear());

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="近 5 年股价与估值线">
      {[max / 1.05, (max / 1.05 + min / 0.95) / 2, min / 0.95].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-[var(--faint)] font-mono text-[10px]">
            {fmtUsd(t)}
          </text>
        </g>
      ))}
      {years.slice(1).map((p) => (
        <text key={p.i} x={x(p.i)} y={H - 6} textAnchor="middle" className="fill-[var(--faint)] font-mono text-[10px]">
          {p.d.getUTCFullYear()}
        </text>
      ))}
      {base != null && (
        <g>
          <line x1={padL} x2={W} y1={y(base)} y2={y(base)} stroke="var(--foreground)" strokeOpacity={0.5} strokeDasharray="6 4" />
          <text x={W - 4} y={y(base) - 5} textAnchor="end" className="fill-[var(--muted-foreground)] font-mono text-[10px]">
            基准价值 {fmtUsd(base)}
          </text>
        </g>
      )}
      {buy != null && (
        <g>
          <line x1={padL} x2={W} y1={y(buy)} y2={y(buy)} stroke="var(--up)" strokeDasharray="6 4" />
          <text x={W - 4} y={y(buy) - 5} textAnchor="end" className="fill-[var(--up)] font-mono text-[10px]">
            买入价 {fmtUsd(buy)}
          </text>
        </g>
      )}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
    </svg>
  );
}
