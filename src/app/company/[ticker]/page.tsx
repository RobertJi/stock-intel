import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, CircleCheck, CircleMinus, CircleX, ExternalLink } from "lucide-react";
import { ValueRangeBar } from "@/components/value/ValueRangeBar";
import { FundamentalsChart, PriceChart } from "@/components/value/Charts";
import {
  getCompany,
  fmtBig,
  fmtCheck,
  fmtPct,
  fmtSignedPct,
  fmtUsd,
  MOAT_LABEL,
  ZONE_LABEL,
  type Check,
} from "@/lib/value";

export const revalidate = 300;

const TONE: Record<string, string> = {
  up: "border-up/30 bg-up/10 text-up",
  accent: "border-accent/30 bg-accent/10 text-accent",
  muted: "border-border bg-surface-2 text-muted-foreground",
  down: "border-down/30 bg-down/10 text-down",
};

function CheckRow({ c }: { c: Check }) {
  const Icon = c.pass == null ? CircleMinus : c.pass ? CircleCheck : CircleX;
  const tone = c.pass == null ? "text-faint" : c.pass ? "text-up" : "text-down";
  return (
    <li className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <Icon className={"mt-0.5 size-4 shrink-0 " + tone} />
      <span className="flex-1 text-sm text-foreground/90">{c.label}</span>
      <span className="num w-20 text-right font-mono text-sm">{fmtCheck(c)}</span>
      <span className="w-40 text-right text-xs text-faint">{c.rule}</span>
    </li>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {aside && <span className="text-xs text-faint">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const c = await getCompany(ticker).catch(() => null);
  if (!c) notFound();

  if (!c.supported || !c.analysis) {
    return (
      <div className="w-full">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> 组合与观察池
        </Link>
        <h1 className="font-display text-3xl font-semibold">{c.ticker}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{c.unsupportedReason ?? "暂无数据，等待下一次价值管道运行。"}</p>
      </div>
    );
  }

  const a = c.analysis;
  const v = a.valuation;
  const zone = a.zone ? ZONE_LABEL[a.zone] : null;
  const years = a.years.slice(-10);
  const cikPath = c.cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=10-K&dateb=&owner=include&count=40` : null;
  const flags = a.flags;
  const sc = v.scenarios;

  return (
    <div className="w-full">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> 组合与观察池
      </Link>

      {/* 头部 */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">{c.ticker} · SIC {c.sic ?? "—"}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{c.name}</h1>
        </div>
        <div className="text-right">
          <p className="num font-mono text-3xl font-semibold">{fmtUsd(c.price)}</p>
          <p className="text-xs text-faint">
            收盘价 · {c.asOf} · 市值 {fmtBig(a.market_cap)}
          </p>
        </div>
      </div>

      {/* 结论 */}
      <section className="mb-6 rounded-2xl border border-border bg-surface px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {zone && <span className={"rounded-md border px-2.5 py-1 text-sm font-medium " + TONE[zone.tone]}>{zone.label}</span>}
          <span className="text-sm text-muted-foreground">{zone?.desc}</span>
          <span className="ml-auto text-xs text-faint">
            不确定性 {v.uncertainty_label ?? "—"} · 要求折扣 {v.required_discount != null ? fmtPct(v.required_discount, 0) : "—"} · 护城河 {MOAT_LABEL[a.moat_proxy]}
          </span>
        </div>
        {v.base != null ? (
          <>
            <ValueRangeBar size="lg" price={c.price} bear={v.bear} base={v.base} bull={v.bull} buy={v.buy_price} epv={v.epv} />
            <div className="mt-5 grid gap-4 text-sm leading-relaxed text-foreground/90 md:grid-cols-2">
              <p>
                <span className="text-muted-foreground">市场在赌什么：</span>
                现价 {fmtUsd(c.price)} 隐含未来 5 年现金流年增约 <b className="num font-mono">{fmtPct(v.implied_growth)}</b>，
                之后逐步放缓。对照：过去 5 年营收年增 <span className="num font-mono">{fmtPct(v.growth_hist)}</span>，
                同规模公司的基准增速约 <span className="num font-mono">{fmtPct(v.growth_base_rate, 0)}</span>。
              </p>
              <p>
                <span className="text-muted-foreground">现价买入能赚多少：</span>
                如果按基准情景兑现，以现价买入的隐含年化回报约 <b className="num font-mono">{fmtPct(v.implied_return)}</b>
                （模型要求回报率 {fmtPct(v.discount_rate, 0)}）。
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">DCF 估值不适用或数据不足，见下方说明。</p>
        )}
        {a.notes.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-warn">
            {a.notes.map((n) => (
              <li key={n} className="flex gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {n}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card title="质量" aside={`${a.quality_score.passed}/${a.quality_score.total} 项通过`}>
          <ul>{a.quality.map((q) => <CheckRow key={q.key} c={q} />)}</ul>
        </Card>
        <Card title="估值" aside={`${a.value_score.passed}/${a.value_score.total} 项通过`}>
          <ul>{a.value.map((q) => <CheckRow key={q.key} c={q} />)}</ul>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card title="估值假设（三情景 DCF）" aside={`模型 ${v.model_version} · 终值增长 ${fmtPct(v.terminal_growth)}`}>
          {sc ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-faint">
                  <th className="pb-2 font-normal">情景</th>
                  <th className="pb-2 text-right font-normal">前 5 年增速</th>
                  <th className="pb-2 text-right font-normal">现金流水平</th>
                  <th className="pb-2 text-right font-normal">高增长期</th>
                  <th className="pb-2 text-right font-normal">每股价值</th>
                </tr>
              </thead>
              <tbody className="num font-mono">
                {(["bear", "base", "bull"] as const).map((k) => (
                  <tr key={k} className="border-t border-border/60">
                    <td className="py-2 font-sans">{{ bear: "熊（25%）", base: "基准（50%）", bull: "牛（25%）" }[k]}</td>
                    <td className="py-2 text-right">{fmtSignedPct(sc[k].g)}</td>
                    <td className="py-2 text-right">×{sc[k].margin.toFixed(2)}</td>
                    <td className="py-2 text-right">{sc[k].years} 年</td>
                    <td className="py-2 text-right">{fmtUsd(sc[k].value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-faint">不适用</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-faint">
            起点现金流 = 近 5 年所有者盈余率中位数 × 最新营收 = {fmtBig(v.owner_earnings_base)}（最新一年 {fmtBig(v.owner_earnings_latest)}）。
            所有者盈余 = 经营现金流 − 资本开支 − 股权激励。基准增速 = 一半取过去 5 年营收增速、一半取同规模公司基准。
            高增长期长度由 ROIC 持续性决定（宽 15 年 / 窄 10 年 / 无 7 年），之后线性回落到终值增长。
            EPV（零增长价值）{fmtUsd(v.epv)} 作为下限参考。
          </p>
        </Card>
        <Card title="排雷" aside="命中不代表一定有问题，但需要人工看一眼">
          {flags.length ? (
            <ul>
              {flags.map((f) => (
                <li key={f.key} className="border-b border-border/60 py-2.5 last:border-b-0">
                  <div className="flex items-start gap-3">
                    {f.flag ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-up" />}
                    <span className="flex-1 text-sm">{f.label}</span>
                    <span className="num w-20 text-right font-mono text-sm">
                      {f.key === "issuance" || f.key === "accruals" ? fmtPct(f.value) : f.value.toFixed(2)}
                    </span>
                    <span className="w-40 text-right text-xs text-faint">{f.rule}</span>
                  </div>
                  {f.note && <p className="ml-7 mt-1 text-xs text-faint">{f.note}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">数据不足</p>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card title="营收与所有者盈余" aside="灰：营收 · 绿：所有者盈余">
          <FundamentalsChart years={years} />
        </Card>
        <Card title="近 5 年股价" aside="周线收盘价">
          <PriceChart history={c.priceHistory} base={v.base} buy={v.buy_price} />
        </Card>
      </div>

      <Card title="十年财务" aside="单位：美元 · 财年 · 来自 10-K">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-right text-xs text-faint">
                <th className="pb-2 text-left font-normal">财年截止</th>
                <th className="pb-2 font-normal">营收</th>
                <th className="pb-2 font-normal">毛利率</th>
                <th className="pb-2 font-normal">营业利润率</th>
                <th className="pb-2 font-normal">所有者盈余</th>
                <th className="pb-2 font-normal">盈余率</th>
                <th className="pb-2 font-normal">ROIC</th>
                <th className="pb-2 font-normal">稀释股本</th>
                <th className="pb-2 font-normal">净负债</th>
              </tr>
            </thead>
            <tbody className="num font-mono">
              {[...years].reverse().map((y) => (
                <tr key={y.fy_end} className="border-t border-border/60 text-right">
                  <td className="py-2 text-left">{y.fy_end}</td>
                  <td className="py-2">{fmtBig(y.revenue)}</td>
                  <td className="py-2">{fmtPct(y.gross_margin)}</td>
                  <td className="py-2">{fmtPct(y.op_margin)}</td>
                  <td className="py-2">{fmtBig(y.owner_earnings)}</td>
                  <td className="py-2">{fmtPct(y.oe_margin)}</td>
                  <td className="py-2">{fmtPct(y.roic)}</td>
                  <td className="py-2">{y.diluted_shares ? `${(y.diluted_shares / 1e9).toFixed(2)}B` : "—"}</td>
                  <td className="py-2">{fmtBig(y.net_debt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="数据出处">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              财务：SEC EDGAR XBRL（每个财年取最新申报值，并记录首次申报日期）
              {cikPath && (
                <a href={cikPath} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-accent hover:underline">
                  全部 10-K <ExternalLink className="size-3" />
                </a>
              )}
            </li>
            {c.latestFiling?.url && (
              <li>
                最新申报：{c.latestFiling.form} · 报告期 {c.latestFiling.period} · 申报于 {c.latestFiling.filed}
                <a href={c.latestFiling.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-accent hover:underline">
                  原文 <ExternalLink className="size-3" />
                </a>
              </li>
            )}
            <li>股本：{c.shares ? `${(c.shares / 1e9).toFixed(3)}B` : "—"}（{c.sharesSource ?? "—"}）</li>
            <li>价格：Yahoo Finance 收盘价</li>
          </ul>
        </Card>
        <Card title="估值记录（封存，只追加）" aside="每份新财报或模型版本变更时写一条，用于事后对账">
          {c.calls.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-faint">
                  <th className="pb-2 text-left font-normal">封存时间</th>
                  <th className="pb-2 font-normal">当时价格</th>
                  <th className="pb-2 font-normal">基准价值</th>
                  <th className="pb-2 font-normal">买入价</th>
                  <th className="pb-2 font-normal">模型</th>
                </tr>
              </thead>
              <tbody className="num font-mono">
                {c.calls.map((r) => (
                  <tr key={r.sealed_at} className="border-t border-border/60 text-right">
                    <td className="py-2 text-left">{r.sealed_at.slice(0, 10)}</td>
                    <td className="py-2">{fmtUsd(r.price)}</td>
                    <td className="py-2">{fmtUsd(r.base)}</td>
                    <td className="py-2">{fmtUsd(r.buy_price)}</td>
                    <td className="py-2">{r.model_version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-faint">暂无</p>
          )}
        </Card>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-faint">
        本页是自动模型的结果，所有数字由 SEC 财报原始数据计算，未经人工复核。它是决策辅助，不是投资建议；买不买、买多少请结合你自己的判断。
      </p>
    </div>
  );
}
