import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type StockData = {
  ticker: string
  price: number
  changePct: number
  changeAmt: number
  prevClose: number
  history: { date: string; close: number }[]
  updatedAt: number
}

export type EventData = {
  id: number
  ticker: string
  type: string
  title: string
  date: string
  source: string
  link?: string
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  description?: string
  descriptionZh?: string
  metadata: Record<string, unknown>
}

export async function getStocks(): Promise<StockData[]> {
  const { data, error } = await supabase
    .from('stocks')
    .select('*')
    .order('ticker', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    ticker: row.ticker,
    price: row.price,
    changePct: row.change_pct,
    changeAmt: row.change_amt,
    prevClose: row.prev_close,
    history: row.history ?? [],
    updatedAt: row.updated_at,
  }))
}

export async function getEvents(ticker?: string, limit = 50): Promise<EventData[]> {
  const mapRow = (row: Record<string, unknown>): EventData => ({
    id: row.id as number,
    ticker: row.ticker as string,
    type: row.type as string,
    title: row.title as string,
    date: row.date as string,
    source: row.source as string,
    link: (row.link as string) ?? undefined,
    impact: (row.impact as 'BULLISH' | 'BEARISH' | 'NEUTRAL') ?? 'NEUTRAL',
    description: (row.description as string) ?? undefined,
    descriptionZh: (row.description_zh as string) ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  })

  if (ticker) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('ticker', ticker)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(mapRow)
  }

  // Homepage: SEC events + market news fetched separately to avoid crowding each other
  const [secResult, newsResult] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .neq('type', 'MARKET_NEWS')
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit),
    supabase
      .from('events')
      .select('*')
      .eq('type', 'MARKET_NEWS')
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(30),
  ])

  if (secResult.error) throw secResult.error
  if (newsResult.error) throw newsResult.error

  return [...(secResult.data ?? []).map(mapRow), ...(newsResult.data ?? []).map(mapRow)]
}

export async function isStockFresh(ticker: string, maxAgeSeconds = 60): Promise<boolean> {
  const { data } = await supabase
    .from('stocks')
    .select('updated_at')
    .eq('ticker', ticker)
    .single()
  if (!data) return false
  return Date.now() / 1000 - data.updated_at < maxAgeSeconds
}

export async function areAllStocksFresh(tickers: string[], maxAgeSeconds = 60): Promise<boolean> {
  const results = await Promise.all(tickers.map((t) => isStockFresh(t, maxAgeSeconds)))
  return results.every(Boolean)
}

export async function isSyncFresh(type: string, maxAgeSeconds: number): Promise<boolean> {
  const { data } = await supabase
    .from('sync_log')
    .select('ran_at')
    .eq('type', type)
    .eq('status', 'ok')
    .order('ran_at', { ascending: false })
    .limit(1)
    .single()
  if (!data) return false
  return Date.now() / 1000 - data.ran_at < maxAgeSeconds
}
