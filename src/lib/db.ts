import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const COMPANY_ALIASES: Record<string, string[]> = {
  META: ['meta', 'facebook', 'instagram', 'whatsapp', 'threads'],
  NFLX: ['netflix', 'nflx'],
  NVDA: ['nvidia', 'nvda', 'geforce', 'cuda', 'jensen huang'],
  OXY: ['occidental', 'occidental petroleum', 'oxy'],
}

const GENERIC_PATTERNS = [
  'stock market today',
  'dow jones',
  's&p 500',
  'nasdaq',
  'best stocks',
  'millionaire',
  'dividend',
  'buying opportunity',
  'etf',
  'bitcoin',
  'ethereum',
  'cryptocurrency',
  'market dip',
  'bull case',
]

function isRelevantDetailNews(ticker: string, row: Record<string, unknown>): boolean {
  const metadata = (row.metadata as Record<string, unknown>) ?? {}
  if (typeof metadata.detailEligible === 'boolean') return metadata.detailEligible

  const title = String(row.title ?? '').toLowerCase()
  const aliases = COMPANY_ALIASES[ticker] ?? []
  const aliasHit = aliases.some((alias) => title.includes(alias))
  const genericHit = GENERIC_PATTERNS.some((pattern) => title.includes(pattern))
  const relatedTickers = Array.isArray(metadata.relatedTickers)
    ? metadata.relatedTickers.map((value) => String(value))
    : []
  const relatedHit = relatedTickers.includes(ticker)
  const narrowRelated = relatedHit && relatedTickers.length <= 2

  let score = 0
  if (aliasHit) score += 5
  if (relatedHit) score += 1
  if (narrowRelated) score += 1
  if (genericHit && !aliasHit) score -= 3

  return aliasHit || score >= 3
}

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
    const desiredNewsCount = Math.min(12, Math.max(6, Math.floor(limit / 6)))
    const [secResult, newsResult] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .eq('ticker', ticker)
        .neq('type', 'MARKET_NEWS')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit),
      supabase
        .from('events')
        .select('*')
        .eq('ticker', ticker)
        .eq('type', 'MARKET_NEWS')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(80),
    ])
    if (secResult.error) throw secResult.error
    if (newsResult.error) throw newsResult.error

    const relevantNews = (newsResult.data ?? [])
      .filter((row) => isRelevantDetailNews(ticker, row))
      .slice(0, desiredNewsCount)

    return [...relevantNews, ...(secResult.data ?? [])]
      .map(mapRow)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return b.id - a.id
      })
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
