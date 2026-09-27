import { createClient } from "@supabase/supabase-js";

// v4 价值投资视图的数据读取。所有数字由 scripts/value/model.py 计算,这里只读。
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Check = {
  key: string;
  label: string;
  value: number | null;
  pass: boolean | null;
  rule: string;
  fmt: "pct" | "pp" | "x";
};

export type Flag = {
  key: string;
  label: string;
  value: number;
  flag: boolean;
  rule: string;
  note: string;
};

export type Scenario = { g: number; margin: number; years: number; value: number };

export type Valuation = {
  model_version: string;
  method: string;
  discount_rate: number;
  terminal_growth: number;
  moat_proxy: "wide" | "narrow" | "none" | "unknown";
  stage_years: number;
  owner_earnings_base?: number;
  owner_earnings_latest?: number;
  growth_hist?: number | null;
  growth_base_rate?: number;
  scenarios?: { bear: Scenario; base: Scenario; bull: Scenario };
  bear?: number;
  base?: number;
  bull?: number;
  epv?: number;
  uncertainty?: "low" | "medium" | "high" | "very_high";
  uncertainty_label?: string;
  required_discount?: number;
  buy_price?: number;
  implied_growth?: number | null;
  implied_return?: number | null;
};

export type YearMetric = {
  fy_end: string;
  revenue: number | null;
  gross_margin: number | null;
  op_margin: number | null;
  net_income: number | null;
  fcf: number | null;
  owner_earnings: number | null;
  oe_margin: number | null;
  roic: number | null;
  gp_assets: number | null;
  diluted_shares: number | null;
  net_debt: number;
};

export type Analysis = {
  model_version: string;
  years: YearMetric[];
  market_cap: number | null;
  enterprise_value: number | null;
  revenue_cagr: number | null;
  moat_proxy: Valuation["moat_proxy"];
  roic_years_above_10: number;
  roic_years_counted: number;
  quality: Check[];
  quality_score: { passed: number; total: number };
  value: Check[];
  value_score: { passed: number; total: number };
  flags: Flag[];
  valuation: Valuation;
  zone: "buy" | "fair_low" | "fair_high" | "expensive" | null;
  is_financial: boolean;
  notes: string[];
};

export type Filing = { form?: string; accn?: string; filed?: string; period?: string; url?: string };

export type CompanyRow = {
  ticker: string;
  cik: number | null;
  name: string | null;
  sic: number | null;
  market: string;
  supported: boolean;
  unsupportedReason: string | null;
  latestFiling: Filing;
  asOf: string | null;
  price: number | null;
  analysis: Analysis | null;
};

type SnapshotRow = {
  ticker: string;
  as_of: string;
  price: number | null;
  analysis: Analysis;
};

export async function getValueOverview(): Promise<{ rows: CompanyRow[]; held: Set<string> }> {
  const [{ data: companies, error: e1 }, { data: positions }] = await Promise.all([
    supabase.from("value_companies").select("*"),
    supabase.from("positions").select("ticker"),
  ]);
  if (e1) throw e1;
  const tickers = (companies ?? []).map((c) => c.ticker as string);
  const latest = new Map<string, SnapshotRow>();
  if (tickers.length > 0) {
    // 每家公司取最新一条快照(按日期倒序,首次出现即最新)
    const { data: snaps, error: e2 } = await supabase
      .from("value_snapshots")
      .select("ticker,as_of,price,analysis")
      .in("ticker", tickers)
      .order("as_of", { ascending: false })
      .limit(tickers.length * 3);
    if (e2) throw e2;
    for (const s of (snaps ?? []) as SnapshotRow[]) if (!latest.has(s.ticker)) latest.set(s.ticker, s);
  }
  const rows: CompanyRow[] = (companies ?? []).map((c) => {
    const s = latest.get(c.ticker as string);
    return {
      ticker: c.ticker as string,
      cik: (c.cik as number) ?? null,
      name: (c.name as string) ?? null,
      sic: (c.sic as number) ?? null,
      market: (c.market as string) ?? "US",
      supported: Boolean(c.supported),
      unsupportedReason: (c.unsupported_reason as string) ?? null,
      latestFiling: (c.latest_filing as Filing) ?? {},
      asOf: s?.as_of ?? null,
      price: s?.price == null ? null : Number(s.price),
      analysis: s?.analysis ?? null,
    };
  });
  return { rows, held: new Set((positions ?? []).map((p) => p.ticker as string)) };
}

export type RawYear = Record<string, unknown> & { fy_end: string; filed: string | null; accn: string | null };

export type CompanyDetail = CompanyRow & {
  sharesSource: string | null;
  shares: number | null;
  financials: RawYear[];
  priceHistory: [number, number][];
  calls: {
    sealed_at: string;
    model_version: string;
    filing_accn: string | null;
    price: number | null;
    base: number | null;
    buy_price: number | null;
    zone: string | null;
  }[];
};

export async function getCompany(ticker: string): Promise<CompanyDetail | null> {
  const t = ticker.toUpperCase();
  const [{ data: c }, { data: snaps }, { data: calls }] = await Promise.all([
    supabase.from("value_companies").select("*").eq("ticker", t).maybeSingle(),
    supabase
      .from("value_snapshots")
      .select("as_of,price,shares,shares_source,analysis,financials,price_history")
      .eq("ticker", t)
      .order("as_of", { ascending: false })
      .limit(1),
    supabase
      .from("value_calls")
      .select("sealed_at,model_version,filing_accn,price,base,buy_price,zone")
      .eq("ticker", t)
      .order("sealed_at", { ascending: false })
      .limit(20),
  ]);
  if (!c) return null;
  const s = snaps?.[0];
  return {
    ticker: t,
    cik: (c.cik as number) ?? null,
    name: (c.name as string) ?? null,
    sic: (c.sic as number) ?? null,
    market: (c.market as string) ?? "US",
    supported: Boolean(c.supported),
    unsupportedReason: (c.unsupported_reason as string) ?? null,
    latestFiling: (c.latest_filing as Filing) ?? {},
    asOf: (s?.as_of as string) ?? null,
    price: s?.price == null ? null : Number(s.price),
    analysis: (s?.analysis as Analysis) ?? null,
    shares: s?.shares == null ? null : Number(s.shares),
    sharesSource: (s?.shares_source as string) ?? null,
    financials: (s?.financials as RawYear[]) ?? [],
    priceHistory: (s?.price_history as [number, number][]) ?? [],
    calls: (calls ?? []).map((r) => ({
      sealed_at: r.sealed_at as string,
      model_version: r.model_version as string,
      filing_accn: (r.filing_accn as string) ?? null,
      price: r.price == null ? null : Number(r.price),
      base: r.base == null ? null : Number(r.base),
      buy_price: r.buy_price == null ? null : Number(r.buy_price),
      zone: (r.zone as string) ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// 格式化
// ---------------------------------------------------------------------------

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

/** ROIC:现金很多的轻资产公司,扣现金后投入资本很小,比率会到几百%;超过 100% 统一显示为 >100% */
export function fmtRoic(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v > 1 ? ">100%" : fmtPct(v);
}

export function fmtSignedPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%`;
}

export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toFixed(2)}`;
}

export function fmtBig(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(0)}M`;
  return `${sign}$${a.toFixed(0)}`;
}

export function fmtCheck(c: Check): string {
  if (c.value == null) return "—";
  if (c.key.startsWith("roic")) return fmtRoic(c.value);
  if (c.fmt === "pct") return fmtPct(c.value);
  if (c.fmt === "pp") return `${(c.value * 100).toFixed(1)} pp`;
  if (c.key === "leverage" && c.value < 0) return "净现金";
  return `${c.value.toFixed(2)}×`;
}

export const ZONE_LABEL: Record<string, { label: string; tone: string; desc: string }> = {
  buy: { label: "买入区间", tone: "up", desc: "价格低于按不确定性打折后的买入价" },
  fair_low: { label: "低于价值", tone: "accent", desc: "价格低于基准价值，但安全边际不够" },
  fair_high: { label: "高于价值", tone: "muted", desc: "价格高于基准价值、低于乐观情景" },
  expensive: { label: "明显高估", tone: "down", desc: "价格高于乐观情景价值" },
};

export const MOAT_LABEL: Record<string, string> = {
  wide: "宽",
  narrow: "窄",
  none: "无迹象",
  unknown: "数据不足",
};
