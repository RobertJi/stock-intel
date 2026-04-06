import { getEvents, getStocks } from '@/lib/db'

export type {} // keep file as a module

const WATCHLIST = ['META', 'NFLX', 'NVDA', 'OXY']

export async function fetchStocks() {
  // Supabase is the source of truth; sync happens via GitHub Actions
  return getStocks()
}

export async function fetchEvents(ticker?: string) {
  return getEvents(ticker, 50)
}

export type StockData = Awaited<ReturnType<typeof getStocks>>[number]
export type EventData = Awaited<ReturnType<typeof getEvents>>[number]
