/**
 * Financial Modeling Prep 接入 (https://site.financialmodelingprep.com)
 * 免费层 250 请求/天;未配置 FMP_API_KEY 时所有函数返回 null,页面降级。
 * 在 .env.local 中加入: FMP_API_KEY=xxx
 */

const FMP_KEY = process.env.FMP_API_KEY;
const BASE = "https://financialmodelingprep.com/stable";

export function hasFmpKey(): boolean {
  return Boolean(FMP_KEY);
}

export type EarningsEvent = {
  symbol: string;
  date: string; // YYYY-MM-DD
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseRow(row: Record<string, unknown>): EarningsEvent {
  return {
    symbol: String(row.symbol ?? ""),
    date: String(row.date ?? "").slice(0, 10),
    // stable 用 epsEstimated/epsActual;legacy v3 用 epsEstimated/eps
    epsEstimate: num(row.epsEstimated ?? row.epsEstimate),
    epsActual: num(row.epsActual ?? row.eps),
    revenueEstimate: num(row.revenueEstimated ?? row.revenueEstimate),
    revenueActual: num(row.revenueActual ?? row.revenue),
  };
}

/** 单个标的的财报记录(含未来预告与历史实际),6 小时缓存 */
export async function fetchEarningsForSymbol(symbol: string): Promise<EarningsEvent[] | null> {
  if (!FMP_KEY) return null;
  // 免费层 limit 上限为 5(返回按日期倒序:最近的未来预告 + 过去几季实际)
  const url = `${BASE}/earnings?symbol=${encodeURIComponent(symbol)}&limit=5&apikey=${FMP_KEY}`;
  const res = await fetch(url, { next: { revalidate: 21600 } });
  if (!res.ok) throw new Error(`FMP earnings ${symbol}: HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>[];
  if (!Array.isArray(data)) return [];
  return data.map(parseRow).filter((e) => e.symbol && e.date);
}

/** 批量拉取多个标的;单个失败不影响整体 */
export async function fetchEarningsForSymbols(
  symbols: string[]
): Promise<Record<string, EarningsEvent[]> | null> {
  if (!FMP_KEY) return null;
  const results = await Promise.allSettled(symbols.map((s) => fetchEarningsForSymbol(s)));
  const map: Record<string, EarningsEvent[]> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) map[symbols[i]] = r.value;
  });
  return map;
}
