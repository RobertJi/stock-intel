import { getEvents, getOpportunities, getStocks, getTheses, getWatchlist } from '@/lib/db'

export type {} // keep file as a module

export async function fetchStocks() {
  const watchlist = await getWatchlist()
  const tickers = watchlist.map((w) => w.ticker)
  const stocks = await getStocks(tickers.length > 0 ? tickers : undefined)
  // Merge earnings_date from watchlist into each stock
  const earningsMap: Record<string, string> = {}
  for (const w of watchlist) {
    if (w.earnings_date) earningsMap[w.ticker] = w.earnings_date
  }
  return stocks.map((s) => ({ ...s, earningsDate: earningsMap[s.ticker] ?? null }))
}

export async function fetchEvents(ticker?: string, limit = 50) {
  return getEvents(ticker, limit)
}

export async function fetchOpportunities(limit = 6) {
  return getOpportunities(limit)
}

export async function fetchTheses(limit = 12) {
  return getTheses(limit)
}

export type StockData = Awaited<ReturnType<typeof getStocks>>[number]
export type EventData = Awaited<ReturnType<typeof getEvents>>[number]
export type OpportunityData = Awaited<ReturnType<typeof getOpportunities>>[number]
export type ThesisData = Awaited<ReturnType<typeof getTheses>>[number]
