import { createClient } from "@supabase/supabase-js";

// v5 波段信号的数据读取。信号由 scripts/swing/run.py 生成,这里只读。
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type RiskFlag = { key: string; label: string; severity: "high" | "medium" | "info"; detail: string };

export type Trade = {
  status: "stop" | "time" | "entered";
  entry?: number;
  entry_date?: string;
  exit?: number;
  exit_date?: string;
  last?: number;
  days?: number;
  ret?: number;
  spy_ret?: number | null;
  excess?: number | null;
};

export type SwingSignal = {
  id: string;
  ticker: string;
  name: string | null;
  as_of: string;
  created_at: string;
  kind: "rebound" | "hot";
  score: number;
  attention: {
    mentions?: number;
    base7?: number;
    accel?: number;
    sentiment?: number | null;
    bullish_pct?: number | null;
    bearish_pct?: number | null;
    trading_share?: number;
    top_sub?: string;
    reasons?: string[];
  };
  market: {
    close?: number;
    ret1?: number;
    ret5?: number;
    ret20?: number;
    atr_pct?: number;
    vol_ratio?: number;
    dollar_vol20?: number;
  };
  plan: { ref_close?: number; entry?: string; stop?: number; hold_days?: number; exit?: string; risk_pct?: number };
  risk_flags: RiskFlag[];
  why: string | null;
  status: string;
  outcome: {
    trade?: Trade;
    t1?: { ret: number; excess: number | null };
    t3?: { ret: number; excess: number | null };
    t5?: { ret: number; excess: number | null };
    t10?: { ret: number; excess: number | null };
  };
};

export type HeatRow = { ticker: string; name: string; mentions: number; mentions_prev: number | null; rank: number | null };

const COLS = "id,ticker,name,as_of,created_at,kind,score,attention,market,plan,risk_flags,why,status,outcome";

export async function getSwing(): Promise<{
  latestDate: string | null;
  rebound: SwingSignal[];
  hot: SwingSignal[];
  open: SwingSignal[];
  closed: SwingSignal[];
  hotHistory: SwingSignal[];
  mine: Set<string>;
  heat: { capturedAt: string | null; rows: HeatRow[] };
}> {
  if (process.env.NODE_ENV !== "production" && process.env.SWING_FIXTURE) {
    // 本地看界面用:读回测生成的样例数据,不连数据库
    const fs = await import("node:fs");
    const fx = JSON.parse(fs.readFileSync(process.env.SWING_FIXTURE, "utf8"));
    return { ...fx, mine: new Set<string>(fx.mine ?? []) };
  }
  const since = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
  const [{ data: sigs, error }, { data: pos }, { data: wl }, { data: lastSnap }] = await Promise.all([
    supabase.from("swing_signals").select(COLS).gte("as_of", since).order("as_of", { ascending: false }).order("score", { ascending: false }).limit(1000),
    supabase.from("positions").select("ticker"),
    supabase.from("watchlist").select("ticker"),
    supabase.from("attention_snapshots").select("captured_at").eq("source", "apewisdom").order("captured_at", { ascending: false }).limit(1),
  ]);
  if (error) throw error;
  const all = (sigs ?? []) as SwingSignal[];
  const latestDate = all[0]?.as_of ?? null;
  const mine = new Set<string>([...(pos ?? []), ...(wl ?? [])].map((r) => String(r.ticker).toUpperCase()));

  let heat: { capturedAt: string | null; rows: HeatRow[] } = { capturedAt: null, rows: [] };
  const capturedAt = lastSnap?.[0]?.captured_at as string | undefined;
  if (capturedAt) {
    const { data: rows } = await supabase
      .from("attention_snapshots")
      .select("ticker,mentions,mentions_prev,rank,extra")
      .eq("source", "apewisdom")
      .eq("captured_at", capturedAt)
      .order("mentions", { ascending: false })
      .limit(60);
    heat = {
      capturedAt,
      rows: (rows ?? []).map((r) => ({
        ticker: r.ticker as string,
        name: ((r.extra as { name?: string }) ?? {}).name ?? "",
        mentions: Number(r.mentions ?? 0),
        mentions_prev: r.mentions_prev == null ? null : Number(r.mentions_prev),
        rank: (r.rank as number) ?? null,
      })),
    };
  }

  const rebounds = all.filter((s) => s.kind === "rebound");
  return {
    latestDate,
    rebound: rebounds.filter((s) => s.as_of === latestDate),
    hot: all.filter((s) => s.kind === "hot" && s.as_of === latestDate),
    open: rebounds.filter((s) => s.as_of !== latestDate && (s.status === "open" || s.status === "entered")),
    closed: rebounds.filter((s) => s.status === "time" || s.status === "stop"),
    hotHistory: all.filter((s) => s.kind === "hot" && s.outcome?.t5),
    mine,
    heat,
  };
}

// 回测结论(scripts/swing/backtest.py,2026-07-01 至 09-26,全市场 7132 只美股)
export const BACKTEST = {
  period: "2026-07-01 至 2026-09-26",
  universe: "SEC 登记的全部纽交所 / 纳斯达克股票（7132 只，不按当前热度挑）",
  rebound: { n: 217, win: 0.65, avg: 0.0402, excess: 0.0339, pf: 2.73, perDayExcess: 0.0129, exTop5Avg: 0.0022 },
  hot: { n: 415, t5Excess: -0.0133, t10Excess: -0.0189, beat: 0.46 },
  spikeOnly: { n: 2842, t5Excess: -0.0029, beat: 0.45 },
};

export function pct(v: number | null | undefined, digits = 1, signed = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = (v * 100).toFixed(digits);
  return signed && v > 0 ? `+${s}%` : `${s}%`;
}

export function usd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toFixed(2)}`;
}
