import { fmtUsd } from "@/lib/value";

/**
 * 价值区间条:熊 —— 基准 —— 牛 三情景价值,买入价刻度,现价标记。
 * 横轴按数值线性映射,两端各留 8% 余量,保证现价在区间外时也能画出来。
 */
export function ValueRangeBar({
  price,
  bear,
  base,
  bull,
  buy,
  epv,
  size = "sm",
}: {
  price: number | null;
  bear?: number;
  base?: number;
  bull?: number;
  buy?: number;
  epv?: number;
  size?: "sm" | "lg";
}) {
  if (base == null || bear == null || bull == null) {
    return <span className="text-xs text-faint">估值暂缺</span>;
  }
  const pts = [bear, bull, base, buy ?? base, price ?? base, ...(size === "lg" && epv ? [epv] : [])];
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const pad = (hi - lo) * 0.08 || 1;
  const min = Math.max(0, lo - pad);
  const max = hi + pad;
  const x = (v: number) => ((v - min) / (max - min)) * 100;
  const zoneTone =
    price == null
      ? "bg-faint"
      : buy != null && price <= buy
        ? "bg-up"
        : price <= base
          ? "bg-accent"
          : price >= bull
            ? "bg-down"
            : "bg-muted-foreground";
  const lg = size === "lg";

  return (
    <div className={lg ? "w-full" : "w-56"}>
      <div className={"relative " + (lg ? "h-16" : "h-6")}>
        {/* 情景区间 */}
        <div
          className={"absolute rounded-full bg-surface-2 " + (lg ? "top-7 h-2.5" : "top-2.5 h-1.5")}
          style={{ left: `${x(bear)}%`, width: `${x(bull) - x(bear)}%` }}
        />
        <div
          className={"absolute rounded-l-full bg-up/25 " + (lg ? "top-7 h-2.5" : "top-2.5 h-1.5")}
          style={{ left: `${x(bear)}%`, width: `${Math.max(0, x(buy ?? bear) - x(bear))}%` }}
        />
        {/* 基准价值 */}
        <div
          className={"absolute w-0.5 bg-foreground/70 " + (lg ? "top-5 h-6" : "top-1 h-4")}
          style={{ left: `${x(base)}%` }}
          title={`基准情景 ${fmtUsd(base)}`}
        />
        {/* 买入价 */}
        {buy != null && (
          <div
            className={"absolute w-0.5 bg-up " + (lg ? "top-5 h-6" : "top-1 h-4")}
            style={{ left: `${x(buy)}%` }}
            title={`买入价 ${fmtUsd(buy)}`}
          />
        )}
        {/* EPV */}
        {lg && epv != null && (
          <div
            className="absolute top-6 h-4 w-0.5 bg-faint"
            style={{ left: `${x(epv)}%` }}
            title={`EPV（零增长价值）${fmtUsd(epv)}`}
          />
        )}
        {/* 现价 */}
        {price != null && (
          <div
            className={
              "absolute -translate-x-1/2 rounded-full border-2 border-background " +
              zoneTone +
              (lg ? " top-[22px] size-4" : " top-1 size-3.5")
            }
            style={{ left: `${x(price)}%` }}
            title={`现价 ${fmtUsd(price)}`}
          />
        )}
        {lg && (
          <>
            <Label at={x(bear)} text={`熊 ${fmtUsd(bear)}`} row="bottom" />
            <Label at={x(base)} text={`基准 ${fmtUsd(base)}`} row="top" />
            <Label at={x(bull)} text={`牛 ${fmtUsd(bull)}`} row="bottom" />
            {buy != null && <Label at={x(buy)} text={`买入价 ${fmtUsd(buy)}`} row="top" tone="text-up" />}
            {epv != null && <Label at={x(epv)} text={`EPV ${fmtUsd(epv)}`} row="bottom" tone="text-faint" />}
          </>
        )}
      </div>
    </div>
  );
}

function Label({ at, text, row, tone = "text-muted-foreground" }: { at: number; text: string; row: "top" | "bottom"; tone?: string }) {
  const align = at < 12 ? "translate-x-0" : at > 88 ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <span
      className={`num absolute whitespace-nowrap font-mono text-[11px] ${tone} ${align} ${row === "top" ? "top-0" : "top-11"}`}
      style={{ left: `${at}%` }}
    >
      {text}
    </span>
  );
}
