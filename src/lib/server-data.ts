import { getEvents, getStocks, getWatchlist } from '@/lib/db'

export type {} // keep file as a module

const WATCHLIST = ['META', 'NFLX', 'NVDA', 'OXY']

export async function fetchStocks() {
  const watchlist = await getWatchlist()
  const tickers = watchlist.map((w) => w.ticker)
  return getStocks(tickers.length > 0 ? tickers : undefined)
}

export async function fetchEvents(ticker?: string, limit = 50) {
  return getEvents(ticker, limit)
}

export type StockData = Awaited<ReturnType<typeof getStocks>>[number]
export type EventData = Awaited<ReturnType<typeof getEvents>>[number]
