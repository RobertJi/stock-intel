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
    <div className={lg ? "w-full" : "w-48"}>
      <div className={"relative " + (lg ? "h-24" : "h-6")}>
        {/* 情景区间 */}
        <div
          className={"absolute rounded-full bg-surface-2 " + (lg ? "top-11 h-2.5" : "top-2.5 h-1.5")}
          style={{ left: `${x(bear)}%`, width: `${x(bull) - x(bear)}%` }}
        />
        <div
          className={"absolute rounded-l-full bg-up/25 " + (lg ? "top-11 h-2.5" : "top-2.5 h-1.5")}
          style={{ left: `${x(bear)}%`, width: `${Math.max(0, x(buy ?? bear) - x(bear))}%` }}
        />
        {/* 基准价值 */}
        <div
          className={"absolute w-0.5 bg-foreground/70 " + (lg ? "top-9 h-6" : "top-1 h-4")}
          style={{ left: `${x(base)}%` }}
          title={`基准情景 ${fmtUsd(base)}`}
        />
        {/* 买入价 */}
        {buy != null && (
          <div
            className={"absolute w-0.5 bg-up " + (lg ? "top-9 h-6" : "top-1 h-4")}
            style={{ left: `${x(buy)}%` }}
            title={`买入价 ${fmtUsd(buy)}`}
          />
        )}
        {/* EPV */}
        {lg && epv != null && (
          <div
            className="absolute top-10 h-4 w-0.5 bg-faint"
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
              (lg ? " top-[38px] size-4" : " top-1 size-3.5")
            }
            style={{ left: `${x(price)}%` }}
            title={`现价 ${fmtUsd(price)}`}
          />
        )}
        {lg &&
          placeLabels([
            { at: x(bear), text: `熊 ${fmtUsd(bear)}` },
            { at: x(base), text: `基准 ${fmtUsd(base)}` },
            { at: x(bull), text: `牛 ${fmtUsd(bull)}` },
            ...(buy != null ? [{ at: x(buy), text: `买入价 ${fmtUsd(buy)}`, tone: "text-up" }] : []),
            ...(epv != null ? [{ at: x(epv), text: `EPV ${fmtUsd(epv)}`, tone: "text-faint" }] : []),
          ]).map((l) => <Label key={l.text} {...l} />)}
      </div>
    </div>
  );
}

type Placed = { at: number; text: string; tone?: string; row: number };

/** 按位置从左到右放标签:与同一行已有标签太近(按文字宽度估算)就换一行,共 4 行(上 2 下 2)。 */
function placeLabels(items: { at: number; text: string; tone?: string }[]): Placed[] {
  const rows: number[][] = [[], [], [], []];
  const width = (t: string) => t.length * 1.15 + 2; // 容器宽度的 %,粗略估算
  return [...items]
    .sort((a, b) => a.at - b.at)
    .map((it) => {
      const w = width(it.text);
      const order = [1, 2, 0, 3]; // 优先贴近条的两行
      const row = order.find((r) => rows[r].every((c) => Math.abs(c - it.at) > w)) ?? 0;
      rows[row].push(it.at);
      return { ...it, row };
    });
}

const ROW_TOP = ["top-0", "top-[18px]", "top-[60px]", "top-[78px]"];

function Label({ at, text, row, tone = "text-muted-foreground" }: Placed) {
  const align = at < 12 ? "translate-x-0" : at > 88 ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <span
      className={`num absolute whitespace-nowrap font-mono text-[11px] ${tone} ${align} ${ROW_TOP[row]}`}
      style={{ left: `${at}%` }}
    >
      {text}
    </span>
  );
}
