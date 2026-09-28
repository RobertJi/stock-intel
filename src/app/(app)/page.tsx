import { AlertTriangle, Flame, RotateCcw } from "lucide-react";
import { BACKTEST, getSwing, pct, usd, type SwingSignal } from "@/lib/swing";

export const revalidate = 300;

function Mine({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">持有/关注</span>;
}

function Flags({ s }: { s: SwingSignal }) {
  const flags = (s.risk_flags ?? []).filter((f) => f.severity !== "info");
  const info = (s.risk_flags ?? []).filter((f) => f.severity === "info");
  if (!flags.length && !info.length) return <p className="text-xs text-faint">排雷：未发现增发申报、财务困境等问题</p>;
  return (
    <ul className="space-y-1">
      {flags.map((f) => (
        <li key={f.key} className={"text-xs " + (f.severity === "high" ? "text-down" : "text-warn")}>
          {f.severity === "high" ? "✕ " : "! "}
          {f.label}
          <span className="text-faint"> · {f.detail}</span>
        </li>
      ))}
      {info.map((f) => (
        <li key={f.key} className="text-xs text-faint">
          {f.label} · {f.detail}
        </li>
      ))}
    </ul>
  );
}

function ReboundCard({ s, mine }: { s: SwingSignal; mine: boolean }) {
  const a = s.attention ?? {};
  const m = s.market ?? {};
  const p = s.plan ?? {};
  const skip = (s.risk_flags ?? []).some((f) => f.severity === "high");
  const t = s.outcome?.trade;
  return (
    <div className={"rounded-xl border bg-surface p-5 " + (skip ? "border-down/30" : "border-up/25")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-lg font-semibold text-foreground">
            {s.ticker}
            <Mine on={mine} />
          </p>
          <p className="truncate text-xs text-muted-foreground">{s.name}</p>
        </div>
        <div className="text-right">
          <p className="num font-mono text-lg text-down">{pct(m.ret1)}</p>
          <p className="text-[11px] text-faint">信号日收盘 {usd(m.close)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Reddit 提及 <span className="num font-mono text-foreground">{a.mentions?.toFixed(0)}</span> 次，是前 7 天的{" "}
        <span className="num font-mono text-foreground">{a.accel?.toFixed(1)}×</span>
        {m.ret20 != null && (
          <>
            {" "}
            · 20 日 <span className="num font-mono">{pct(m.ret20, 0)}</span>
          </>
        )}
      </p>
      {s.why && <p className="mt-2 text-sm leading-relaxed text-foreground/90">{s.why}</p>}
      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
        <div className="bg-surface-2/60 px-3 py-2">
          <p className="text-faint">买入</p>
          <p className="mt-0.5 text-foreground">{p.entry ?? "次日开盘"}</p>
        </div>
        <div className="bg-surface-2/60 px-3 py-2">
          <p className="text-faint">卖出</p>
          <p className="mt-0.5 text-foreground">{p.exit ?? "第 5 个交易日收盘"}</p>
        </div>
        <div className="bg-surface-2/60 px-3 py-2">
          <p className="text-faint">止损（防极端）</p>
          <p className="num mt-0.5 font-mono text-foreground">
            {usd(p.stop)} <span className="text-faint">{pct(p.risk_pct != null ? -p.risk_pct : null, 0)}</span>
          </p>
        </div>
      </div>
      <div className="mt-3">
        {skip && <p className="mb-1 text-xs font-medium text-down">有高风险项，这条建议跳过</p>}
        <Flags s={s} />
      </div>
      {t && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          纸面持仓：{t.entry_date} 开盘 {usd(t.entry)} 买入，第 {t.days} 天，收益{" "}
          <span className={"num font-mono " + ((t.ret ?? 0) >= 0 ? "text-up" : "text-down")}>{pct(t.ret)}</span>
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "text-foreground", sub }: { label: string; value: string | number; tone?: string; sub?: string }) {
  return (
    <div className="bg-surface px-5 py-3">
      <p className="whitespace-nowrap text-xs text-faint">{label}</p>
      <p className={"num mt-1 font-mono text-2xl font-semibold " + tone}>{value}</p>
      {sub && <p className="mt-0.5 whitespace-nowrap text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

export default async function SwingHome() {
  let data: Awaited<ReturnType<typeof getSwing>> | null = null;
  try {
    data = await getSwing();
  } catch {
    data = null;
  }
  const closed = data?.closed ?? [];
  const rets = closed.map((s) => s.outcome?.trade?.ret).filter((v): v is number => v != null);
  const exc = closed.map((s) => s.outcome?.trade?.excess).filter((v): v is number => v != null);
  const winRate = rets.length ? rets.filter((r) => r > 0).length / rets.length : null;
  const avgExc = exc.length ? exc.reduce((a, b) => a + b, 0) / exc.length : null;
  const hotT5 = (data?.hotHistory ?? []).map((s) => s.outcome?.t5?.excess).filter((v): v is number => v != null);
  const hotAvg = hotT5.length ? hotT5.reduce((a, b) => a + b, 0) / hotT5.length : null;

  return (
    <div className="w-full">
      <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">Swing · Social Attention</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">波段机会</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            社媒热度 × 价格。只给回测里站得住的两类信号：<span className="text-up">恐慌反弹</span>（可以买，拿 5 个交易日）和{" "}
            <span className="text-down">过热</span>（别追）。每个交易日美股开盘前更新
            {data?.latestDate ? `，当前信号日 ${data.latestDate}` : ""}。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <Stat label="今日恐慌反弹" value={data?.rebound.length ?? 0} tone={data?.rebound.length ? "text-up" : "text-foreground"} />
          <Stat label="今日过热" value={data?.hot.length ?? 0} tone={data?.hot.length ? "text-down" : "text-foreground"} />
          <Stat
            label="纸面战绩"
            value={rets.length ? pct(winRate, 0, false) : "—"}
            sub={rets.length ? `${rets.length} 笔 · 跑赢 ${pct(avgExc)}` : "尚无平仓"}
          />
        </div>
      </div>

      {!data && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          波段数据读取失败。确认已执行数据库迁移 009，并运行过一次波段管道（Actions → Swing Pipeline）。
        </div>
      )}

      {/* 恐慌反弹 */}
      <section className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <RotateCcw className="size-4 text-up" />
          <h2 className="text-lg font-semibold text-foreground">恐慌反弹</h2>
          <span className="text-xs text-faint">当天跌 5% 以上、Reddit 讨论放大 2 倍以上、日均成交 1 亿美元以上</span>
        </div>
        {data && data.rebound.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {data.rebound.map((s) => (
              <ReboundCard key={s.id} s={s} mine={data!.mine.has(s.ticker)} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface/50 px-5 py-8 text-center text-sm text-muted-foreground">
            今天没有恐慌反弹信号。这类机会不是天天有：回测的 3 个月里只出现在 58 个交易日，而且常常扎堆出现在大盘急跌的日子。
          </div>
        )}
      </section>

      {/* 进行中 */}
      {data && data.open.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-foreground">纸面持仓中</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-border text-left text-xs text-faint">
                  <th className="px-4 py-3 font-normal">股票</th>
                  <th className="px-3 py-3 font-normal">信号日</th>
                  <th className="px-3 py-3 text-right font-normal">买入价</th>
                  <th className="px-3 py-3 text-right font-normal">持有天数</th>
                  <th className="px-3 py-3 text-right font-normal">当前收益</th>
                </tr>
              </thead>
              <tbody>
                {data.open.map((s) => {
                  const t = s.outcome?.trade;
                  return (
                    <tr key={s.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{s.ticker}</td>
                      <td className="num px-3 py-2.5 font-mono text-muted-foreground">{s.as_of}</td>
                      <td className="num px-3 py-2.5 text-right font-mono">{usd(t?.entry)}</td>
                      <td className="num px-3 py-2.5 text-right font-mono">{t?.days ?? "待开盘"}</td>
                      <td className={"num px-3 py-2.5 text-right font-mono " + ((t?.ret ?? 0) >= 0 ? "text-up" : "text-down")}>{pct(t?.ret)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 过热 */}
      <section className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <Flame className="size-4 text-down" />
          <h2 className="text-lg font-semibold text-foreground">过热，别追</h2>
          <span className="text-xs text-faint">讨论放大的同时已经大涨（当天 +5% 或 5 天 +15% 以上）</span>
        </div>
        {data && data.hot.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-border text-left text-xs text-faint">
                  <th className="px-4 py-3 font-normal">股票</th>
                  <th className="px-3 py-3 text-right font-normal">当天</th>
                  <th className="px-3 py-3 text-right font-normal">5 天</th>
                  <th className="px-3 py-3 text-right font-normal">讨论放大</th>
                  <th className="px-3 py-3 font-normal">为什么热</th>
                </tr>
              </thead>
              <tbody>
                {data.hot.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 align-top last:border-b-0">
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-foreground">{s.ticker}</span>
                      <Mine on={data!.mine.has(s.ticker)} />
                      <span className="mt-0.5 block max-w-44 truncate text-xs text-muted-foreground">{s.name}</span>
                    </td>
                    <td className={"num px-3 py-3 text-right font-mono " + ((s.market?.ret1 ?? 0) >= 0 ? "text-up" : "text-down")}>{pct(s.market?.ret1)}</td>
                    <td className={"num px-3 py-3 text-right font-mono " + ((s.market?.ret5 ?? 0) >= 0 ? "text-up" : "text-down")}>{pct(s.market?.ret5)}</td>
                    <td className="num px-3 py-3 text-right font-mono">{s.attention?.accel?.toFixed(1)}×</td>
                    <td className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">{s.why ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface/50 px-5 py-6 text-center text-sm text-muted-foreground">今天没有过热信号。</div>
        )}
      </section>

      {/* 战绩 */}
      <section className="mb-10 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">纸面战绩 vs 回测</h2>
          <p className="mb-4 text-xs text-faint">每条恐慌反弹信号都按计划自动记账：次日开盘买、第 5 天收盘卖，和同期标普 500 比。</p>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
            <div className="bg-surface-2/50 px-4 py-3">
              <p className="text-xs text-faint">实盘纸面（{rets.length} 笔）</p>
              <p className="mt-1 text-foreground">
                胜率 <span className="num font-mono">{pct(winRate, 0, false)}</span> · 平均跑赢 <span className="num font-mono">{pct(avgExc)}</span>
              </p>
              <p className="mt-1 text-xs text-faint">过热信号 5 天后平均 {pct(hotAvg)}（{hotT5.length} 条）</p>
            </div>
            <div className="bg-surface-2/50 px-4 py-3">
              <p className="text-xs text-faint">回测（{BACKTEST.rebound.n} 笔）</p>
              <p className="mt-1 text-foreground">
                胜率 <span className="num font-mono">{pct(BACKTEST.rebound.win, 0, false)}</span> · 平均跑赢{" "}
                <span className="num font-mono">{pct(BACKTEST.rebound.excess)}</span>
              </p>
              <p className="mt-1 text-xs text-faint">过热信号 5 天后平均 {pct(BACKTEST.hot.t5Excess)}</p>
            </div>
          </div>
          {closed.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-faint">
                  <th className="py-2 font-normal">股票</th>
                  <th className="py-2 font-normal">信号日</th>
                  <th className="py-2 text-right font-normal">收益</th>
                  <th className="py-2 text-right font-normal">跑赢大盘</th>
                  <th className="py-2 text-right font-normal">出场</th>
                </tr>
              </thead>
              <tbody>
                {closed.slice(0, 20).map((s) => {
                  const t = s.outcome?.trade;
                  return (
                    <tr key={s.id} className="border-b border-border/50 last:border-b-0">
                      <td className="py-2 font-mono text-foreground">{s.ticker}</td>
                      <td className="num py-2 font-mono text-muted-foreground">{s.as_of}</td>
                      <td className={"num py-2 text-right font-mono " + ((t?.ret ?? 0) >= 0 ? "text-up" : "text-down")}>{pct(t?.ret)}</td>
                      <td className="num py-2 text-right font-mono">{pct(t?.excess)}</td>
                      <td className="py-2 text-right text-xs text-faint">{t?.status === "stop" ? "止损" : "到期"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 text-sm leading-relaxed text-muted-foreground">
          <h2 className="mb-3 text-base font-semibold text-foreground">这些规则是怎么来的</h2>
          <p>
            用 {BACKTEST.universe}在 {BACKTEST.period} 的 Reddit 日度讨论量，找出「讨论量是前 7 天 2 倍以上」的 {BACKTEST.spikeOnly.n.toLocaleString()} 次，
            看之后 5 天相对标普 500 的表现：
          </p>
          <ul className="mt-2 space-y-1.5">
            <li>
              · <span className="text-foreground">光看热度没有用</span>：平均 {pct(BACKTEST.spikeOnly.t5Excess)}，只有 {pct(BACKTEST.spikeOnly.beat, 0, false)} 跑赢大盘。追「热度 + 放量突破」也一样。
            </li>
            <li>
              · <span className="text-down">热度 + 已经大涨</span>：5 天后平均 {pct(BACKTEST.hot.t5Excess)}，10 天 {pct(BACKTEST.hot.t10Excess)}。
            </li>
            <li>
              · <span className="text-up">热度 + 当天大跌</span>（流动性好的）：拿 5 天平均 {pct(BACKTEST.rebound.avg)}，跑赢大盘 {pct(BACKTEST.rebound.excess)}，胜率{" "}
              {pct(BACKTEST.rebound.win, 0, false)}。7、8、9 月分别都是正的；同期没有热度放大的大跌股只有约 +1%。
            </li>
          </ul>
          <p className="mt-3 text-xs text-faint">
            要知道的局限：收益集中在少数几个大盘急跌日，去掉最好的 5 天后每笔平均只剩 {pct(BACKTEST.rebound.exTop5Avg)}；按天平均是每天{" "}
            {pct(BACKTEST.rebound.perDayExcess)}。只有 3 个月数据、一种市场环境。先纸面跟踪，攒够 30 笔再和回测对比决定要不要用真钱。这是决策辅助，不是投资建议。
          </p>
        </div>
      </section>

      {/* 热度榜 */}
      {data && data.heat.rows.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold text-foreground">Reddit 24 小时热度榜</h2>
          <p className="mb-3 text-xs text-faint">
            ApeWisdom · {data.heat.capturedAt?.slice(0, 16).replace("T", " ")} UTC · 只作参考，热度本身不构成买点
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-border bg-surface p-4 text-sm sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {data.heat.rows.slice(0, 36).map((r) => {
              const ch = r.mentions_prev ? r.mentions / r.mentions_prev : null;
              return (
                <div key={r.ticker} className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1">
                  <span className="font-mono text-foreground">{r.ticker}</span>
                  <span className="num font-mono text-xs text-muted-foreground">
                    {r.mentions}
                    {ch != null && ch >= 2 && <span className="ml-1 text-warn">{ch.toFixed(1)}×</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
