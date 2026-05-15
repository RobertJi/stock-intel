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

const COMPARISON_PATTERNS = [' vs ', ' versus ', ' than ', ' challenge', ' challenging ', ' compet', ' partner', ' partnership']
const IGNORE_RELATED_EXACT = new Set(['CL=F', 'GC=F', 'SI=F', 'BTC-USD', 'ETH-USD', 'XRP-USD'])

function getNewsBucket(ticker: string, row: Record<string, unknown>): 'company' | 'ecosystem' | 'broad' {
  const metadata = (row.metadata as Record<string, unknown>) ?? {}
  const stored = metadata.newsBucket ?? metadata.newsScope
  if (stored === 'company' || stored === 'ecosystem' || stored === 'broad') return stored
  if (stored === 'direct') return 'company'
  if (stored === 'related') return 'ecosystem'

  const title = String(row.title ?? '').toLowerCase()
  const aliases = COMPANY_ALIASES[ticker] ?? []
  const aliasHit = aliases.some((alias) => title.includes(alias))
  if (!aliasHit) return 'broad'

  const genericHit = title.includes('stock market today') || title.includes('dow jones') || title.includes('s&p 500') || title.includes('nasdaq')
  const comparisonHit = COMPARISON_PATTERNS.some((pattern) => title.includes(pattern))
  const relatedTickers = Array.isArray(metadata.relatedTickers)
    ? metadata.relatedTickers.map((value) => String(value))
    : []
  const otherRelated = relatedTickers.filter(
    (symbol) => symbol !== ticker && !symbol.startsWith('^') && !IGNORE_RELATED_EXACT.has(symbol)
  )

  return genericHit || comparisonHit || otherRelated.length > 0 ? 'ecosystem' : 'company'
}

function isRelevantDetailNews(ticker: string, row: Record<string, unknown>): boolean {
  return getNewsBucket(ticker, row) !== 'broad'
}

function dedupeEvents(rows: Record<string, unknown>[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const type = String(row.type ?? '')
    const link = String(row.link ?? '')
    const title = String(row.title ?? '')
    const date = String(row.date ?? '')
    const key = `${type}::${link || title}::${date}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export type WatchlistItem = {
  ticker: string
  cik: string | null
  aliases: string[] | null
  earnings_date: string | null
  added_at: string
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .order('added_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as WatchlistItem[]
}

export async function addToWatchlist(
  ticker: string,
  cik?: string | null,
  aliases?: string[] | null
): Promise<void> {
  const { error } = await supabase
    .from('watchlist')
    .insert({ ticker, cik: cik ?? null, aliases: aliases ?? null })
  if (error) throw error
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('ticker', ticker)
  if (error) throw error
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

export type OpportunityEvidence = {
  insight_id?: string
  title?: string
  summary?: string
  impact_score?: number
  confidence?: number
}

export type OpportunityData = {
  id: string
  title: string
  opportunityType: string
  status: string
  direction: 'bullish' | 'bearish' | 'watch'
  ticker: string | null
  sector: string | null
  score: number
  scoreBreakdown: Record<string, number>
  confidence: number
  timeHorizon: string
  whyNow: string | null
  evidenceChain: OpportunityEvidence[]
  catalysts: string[]
  risks: string[]
  invalidationCondition: string | null
  nextWatchItems: string[]
  generatedAt: string
  lastReviewedAt: string | null
  metadata: Record<string, unknown>
}

export async function getStocks(tickers?: string[]): Promise<StockData[]> {
  let query = supabase.from('stocks').select('*').order('ticker', { ascending: true })
  if (tickers && tickers.length > 0) {
    query = query.in('ticker', tickers)
  }
  const { data, error } = await query
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

    const relevantNews = dedupeEvents(
      (newsResult.data ?? []).filter((row) => isRelevantDetailNews(ticker, row))
    )
    const companyNews = relevantNews.filter((row) => getNewsBucket(ticker, row) === 'company').slice(0, desiredNewsCount)
    const ecosystemNews = relevantNews.filter((row) => getNewsBucket(ticker, row) === 'ecosystem').slice(0, 6)

    return dedupeEvents([
      ...companyNews,
      ...ecosystemNews,
      ...((secResult.data ?? []) as Record<string, unknown>[]),
    ])
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

export async function getOpportunities(limit = 6): Promise<OpportunityData[]> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .order('score', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    opportunityType: row.opportunity_type as string,
    status: row.status as string,
    direction: (row.direction as 'bullish' | 'bearish' | 'watch') ?? 'watch',
    ticker: (row.ticker as string) ?? null,
    sector: (row.sector as string) ?? null,
    score: Number(row.score ?? 0),
    scoreBreakdown: (row.score_breakdown as Record<string, number>) ?? {},
    confidence: Number(row.confidence ?? 0),
    timeHorizon: (row.time_horizon as string) ?? 'days',
    whyNow: (row.why_now as string) ?? null,
    evidenceChain: (row.evidence_chain as OpportunityEvidence[]) ?? [],
    catalysts: (row.catalysts as string[]) ?? [],
    risks: (row.risks as string[]) ?? [],
    invalidationCondition: (row.invalidation_condition as string) ?? null,
    nextWatchItems: (row.next_watch_items as string[]) ?? [],
    generatedAt: row.generated_at as string,
    lastReviewedAt: (row.last_reviewed_at as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }))
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
