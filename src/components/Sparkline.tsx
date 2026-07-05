function hashData(data: number[]) {
  let h = 0;
  for (const v of data) h = ((h << 5) - h + Math.round(v * 100)) | 0;
  return Math.abs(h).toString(36);
}

export function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * 100,
    28 - ((v - min) / range) * 24 + 2,
  ]);
  const points = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPoints = `0,32 ${points} 100,32`;
  const up = data[data.length - 1] >= data[0];
  const color = up ? "#0ECB81" : "#F6465D";
  const gid = `spark-${hashData(data)}`;
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-28" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gid})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
