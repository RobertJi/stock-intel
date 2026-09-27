import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { ValueRangeBar } from "@/components/value/ValueRangeBar";
import {
  getValueOverview,
  fmtPct,
  fmtUsd,
  MOAT_LABEL,
  ZONE_LABEL,
  type CompanyRow,
} from "@/lib/value";

export const revalidate = 300;

const TONE: Record<string, string> = {
  up: "border-up/30 bg-up/10 text-up",
  accent: "border-accent/30 bg-accent/10 text-accent",
  muted: "border-border bg-surface-2 text-muted-foreground",
  down: "border-down/30 bg-down/10 text-down",
};

const ZONE_ORDER: Record<string, number> = { buy: 0, fair_low: 1, fair_high: 2, expensive: 3 };

function sortRows(rows: CompanyRow[]) {
  return [...rows].sort((a, b) => {
    const za = ZONE_ORDER[a.analysis?.zone ?? ""] ?? 9;
    const zb = ZONE_ORDER[b.analysis?.zone ?? ""] ?? 9;
    if (za !== zb) return za - zb;
    const ra = a.price && a.analysis?.valuation.base ? a.price / a.analysis.valuation.base : 99;
    const rb = b.price && b.analysis?.valuation.base ? b.price / b.analysis.valuation.base : 99;
    return ra - rb;
  });
}

function Score({ passed, total }: { passed: number; total: number }) {
  if (!total) return <span className="text-faint">—</span>;
  const ratio = passed / total;
  const tone = ratio >= 0.8 ? "text-up" : ratio >= 0.5 ? "text-foreground" : "text-down";
  return (
    <span className={"num font-mono " + tone}>
      {passed}
      <span className="text-faint">/{total}</span>
    </span>
  );
}

export default async function ValueHome() {
  let rows: CompanyRow[] = [];
  let held = new Set<string>();
  let loadError = false;
  try {
    const r = await getValueOverview();
    rows = r.rows;
    held = r.held;
  } catch {
    loadError = true;
  }
  const supported = sortRows(rows.filter((r) => r.supported && r.analysis));
  const unsupported = rows.filter((r) => !r.supported);
  const asOf = supported.map((r) => r.asOf).filter(Boolean).sort().at(-1);
  const inBuy = supported.filter((r) => r.analysis?.zone === "buy").length;
  const flagged = supported.filter((r) => r.analysis?.flags.some((f) => f.flag)).length;

  return (
    <div className="w-full">
      <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">Long-term Value</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">组合与观察池</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            每家公司回答三个问题：生意好不好（质量）、值多少钱（三情景估值）、现在够不够便宜（买入价）。
            数字全部由 SEC 财报原始数据计算{asOf ? `，价格截至 ${asOf}` : ""}。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {[
            { label: "覆盖公司", value: supported.length, tone: "text-foreground" },
            { label: "进入买入区间", value: inBuy, tone: inBuy ? "text-up" : "text-foreground" },
            { label: "有排雷警示", value: flagged, tone: flagged ? "text-warn" : "text-foreground" },
          ].map((s) => (
            <div key={s.label} className="bg-surface px-5 py-3">
              <p className="text-xs text-faint">{s.label}</p>
              <p className={"num mt-1 font-mono text-2xl font-semibold " + s.tone}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          价值数据读取失败。确认已执行数据库迁移 008，并运行过一次价值管道（Actions → Value Pipeline）。
        </div>
      )}

      {supported.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="px-4 py-3 font-normal">公司</th>
                <th className="px-3 py-3 text-right font-normal">现价</th>
                <th className="px-3 py-3 font-normal">价值区间（熊 · 基准 · 牛 / 买入价）</th>
                <th className="px-3 py-3 font-normal">状态</th>
                <th className="px-3 py-3 text-right font-normal" title="按基准情景、以现价买入的隐含年化回报">隐含回报</th>
                <th className="px-3 py-3 text-right font-normal" title="现价隐含的前 5 年增长 vs 过去 5 年营收增长">隐含增长 / 历史</th>
                <th className="px-3 py-3 text-center font-normal">质量</th>
                <th className="px-3 py-3 text-center font-normal">估值</th>
                <th className="px-3 py-3 font-normal">护城河</th>
                <th className="px-3 py-3 font-normal">排雷</th>
              </tr>
            </thead>
            <tbody>
              {supported.map((r) => {
                const a = r.analysis!;
                const v = a.valuation;
                const zone = a.zone ? ZONE_LABEL[a.zone] : null;
                const flags = a.flags.filter((f) => f.flag);
                return (
                  <tr key={r.ticker} className="border-b border-border/60 last:border-b-0 hover:bg-surface-2/40">
                    <td className="px-4 py-3">
                      <Link href={`/company/${r.ticker}`} className="group block">
                        <span className="font-mono text-base font-semibold text-foreground group-hover:text-accent">{r.ticker}</span>
                        {held.has(r.ticker) && (
                          <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">持有</span>
                        )}
                        <span className="mt-0.5 block max-w-52 truncate text-xs text-muted-foreground">{r.name}</span>
                      </Link>
                    </td>
                    <td className="num px-3 py-3 text-right font-mono">{fmtUsd(r.price)}</td>
                    <td className="px-3 py-3">
                      <ValueRangeBar price={r.price} bear={v.bear} base={v.base} bull={v.bull} buy={v.buy_price} />
                      {v.base != null && (
                        <p className="num mt-0.5 font-mono text-[11px] text-faint">
                          基准 {fmtUsd(v.base)} · 买入 {fmtUsd(v.buy_price)} · 不确定性{v.uncertainty_label}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {zone ? (
                        <span className={"rounded-md border px-2 py-0.5 text-xs " + TONE[zone.tone]} title={zone.desc}>
                          {zone.label}
                        </span>
                      ) : (
                        <span className="text-xs text-faint">估值暂缺</span>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono">
                      <span className={(v.implied_return ?? 0) >= 0.1 ? "text-up" : (v.implied_return ?? 0) < 0.06 ? "text-down" : ""}>
                        {fmtPct(v.implied_return)}
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-xs">
                      <span className="text-foreground">{fmtPct(v.implied_growth)}</span>
                      <span className="text-faint"> / {fmtPct(a.revenue_cagr)}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Score {...a.quality_score} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Score {...a.value_score} />
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{MOAT_LABEL[a.moat_proxy]}</td>
                    <td className="px-3 py-3 text-xs">
                      {flags.length ? (
                        <span className="text-warn" title={flags.map((f) => f.label).join("、")}>
                          {flags.length} 项
                        </span>
                      ) : (
                        <span className="text-faint">无</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {supported.length === 0 && !loadError && (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-5 py-14 text-center text-sm text-muted-foreground">
          还没有估值数据。在设置里添加观察的公司后，运行一次价值管道。
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-faint">
        <p>
          隐含回报 ≥ 10% 标绿，&lt; 6% 标红。估值是自动模型的结果，要求回报率 9%；看具体假设请点公司名。这是决策辅助，不是投资建议。
        </p>
        <Link href="/settings" className="inline-flex items-center gap-1 text-accent hover:underline">
          <Plus className="size-3.5" /> 添加观察公司
        </Link>
      </div>

      {unsupported.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-sm font-medium text-muted-foreground">暂不支持的标的</p>
          <ul className="space-y-1 text-sm text-faint">
            {unsupported.map((r) => (
              <li key={r.ticker}>
                <span className="font-mono text-muted-foreground">{r.ticker}</span> · {r.unsupportedReason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
