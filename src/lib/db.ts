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

export type ThesisEvidence = {
  weight: number
  stance: 'supports' | 'weakens'
  reasoning: string | null
  created_at: string
  signal: {
    title: string
    url: string | null
    source_kind: string
    published_at: string | null
  } | null
}

export type MarketReactionEntry = {
  symbol: string
  name: string | null
  pct_5d: number
}

export type ThesisData = {
  id: string
  sector: string
  sectorZh: string | null
  theme: string
  direction: 'bullish' | 'bearish'
  status: string
  conviction: number
  convictionComponents: Record<string, number>
  summary: string | null
  transmission: string | null
  confirmConditions: string[]
  invalidateConditions: string[]
  marketReaction: Record<string, MarketReactionEntry[] | number>
  evidence: ThesisEvidence[]
  firstSignalAt: string | null
  lastSignalAt: string | null
  updatedAt: string
}

export async function getTheses(limit = 30): Promise<ThesisData[]> {
  const { data, error } = await supabase
    .from('sector_theses')
    .select(
      '*, thesis_signals(weight,stance,reasoning,created_at,radar_signals(title,url,source_kind,published_at))'
    )
    .in('status', ['forming', 'active', 'confirmed'])
    .order('conviction', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  return (data ?? []).map((row) => {
    const evidenceRows = (row.thesis_signals as Record<string, unknown>[]) ?? []
    const evidence: ThesisEvidence[] = evidenceRows
      .map((e) => ({
        weight: Number(e.weight ?? 0),
        stance: (e.stance as 'supports' | 'weakens') ?? 'supports',
        reasoning: (e.reasoning as string) ?? null,
        created_at: e.created_at as string,
        signal: (e.radar_signals as ThesisEvidence['signal']) ?? null,
      }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    return {
      id: row.id as string,
      sector: row.sector as string,
      sectorZh: (row.sector_zh as string) ?? null,
      theme: (row.theme as string) ?? '其他',
      direction: (row.direction as 'bullish' | 'bearish') ?? 'bullish',
      status: row.status as string,
      conviction: Number(row.conviction ?? 0),
      convictionComponents: (row.conviction_components as Record<string, number>) ?? {},
      summary: (row.summary as string) ?? null,
      transmission: (row.transmission as string) ?? null,
      confirmConditions: (row.confirm_conditions as string[]) ?? [],
      invalidateConditions: (row.invalidate_conditions as string[]) ?? [],
      marketReaction: (row.market_reaction as ThesisData['marketReaction']) ?? {},
      evidence,
      firstSignalAt: (row.first_signal_at as string) ?? null,
      lastSignalAt: (row.last_signal_at as string) ?? null,
      updatedAt: row.updated_at as string,
    }
  })
}

export type ThemeOverview = {
  theme: string
  intro: string | null
  stance: 'bullish' | 'bearish' | 'mixed'
  stanceReason: string | null
  outlook: string | null
  bullishCount: number
  bearishCount: number
  updatedAt: string
}

export async function getThemeOverviews(): Promise<Record<string, ThemeOverview>> {
  const { data, error } = await supabase.from('radar_theme_overviews').select('*')
  if (error) throw error
  const map: Record<string, ThemeOverview> = {}
  for (const row of data ?? []) {
    map[row.theme as string] = {
      theme: row.theme as string,
      intro: (row.intro as string) ?? null,
      stance: (row.stance as ThemeOverview['stance']) ?? 'mixed',
      stanceReason: (row.stance_reason as string) ?? null,
      outlook: (row.outlook as string) ?? null,
      bullishCount: Number(row.bullish_count ?? 0),
      bearishCount: Number(row.bearish_count ?? 0),
      updatedAt: row.updated_at as string,
    }
  }
  return map
}

export type InstrumentData = {
  market: string
  symbol: string
  name: string | null
  relation: string
  sensitivity: string
  rationale: string | null
  pct5d: number | null
  pct20d: number | null
  history: number[]
}

export async function getThesisById(id: string): Promise<{ thesis: ThesisData; instruments: InstrumentData[] } | null> {
  const { data, error } = await supabase
    .from('sector_theses')
    .select(
      '*, thesis_signals(weight,stance,reasoning,created_at,radar_signals(title,url,source_kind,published_at))'
    )
    .eq('id', id)
    .limit(1)
  if (error) throw error
  const row = (data ?? [])[0]
  if (!row) return null

  const { data: instRows, error: instError } = await supabase
    .from('sector_instruments')
    .select('*')
    .eq('sector', row.sector as string)
  if (instError) throw instError

  const evidenceRows = (row.thesis_signals as Record<string, unknown>[]) ?? []
  const evidence: ThesisEvidence[] = evidenceRows
    .map((e) => ({
      weight: Number(e.weight ?? 0),
      stance: (e.stance as 'supports' | 'weakens') ?? 'supports',
      reasoning: (e.reasoning as string) ?? null,
      created_at: e.created_at as string,
      signal: (e.radar_signals as ThesisEvidence['signal']) ?? null,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  const thesis: ThesisData = {
    id: row.id as string,
    sector: row.sector as string,
    sectorZh: (row.sector_zh as string) ?? null,
    theme: (row.theme as string) ?? '其他',
    direction: (row.direction as 'bullish' | 'bearish') ?? 'bullish',
    status: row.status as string,
    conviction: Number(row.conviction ?? 0),
    convictionComponents: (row.conviction_components as Record<string, number>) ?? {},
    summary: (row.summary as string) ?? null,
    transmission: (row.transmission as string) ?? null,
    confirmConditions: (row.confirm_conditions as string[]) ?? [],
    invalidateConditions: (row.invalidate_conditions as string[]) ?? [],
    marketReaction: (row.market_reaction as ThesisData['marketReaction']) ?? {},
    evidence,
    firstSignalAt: (row.first_signal_at as string) ?? null,
    lastSignalAt: (row.last_signal_at as string) ?? null,
    updatedAt: row.updated_at as string,
  }

  const marketOrder = ['US', 'HK', 'CN', 'JP', 'KR']
  const instruments: InstrumentData[] = (instRows ?? [])
    .map((r) => ({
      market: r.market as string,
      symbol: r.symbol as string,
      name: (r.name as string) ?? null,
      relation: (r.relation as string) ?? 'direct',
      sensitivity: (r.sensitivity as string) ?? 'medium',
      rationale: (r.rationale as string) ?? null,
      pct5d: r.pct_5d == null ? null : Number(r.pct_5d),
      pct20d: r.pct_20d == null ? null : Number(r.pct_20d),
      history: Array.isArray(r.history) ? (r.history as number[]) : [],
    }))
    .sort((a, b) => marketOrder.indexOf(a.market) - marketOrder.indexOf(b.market))

  return { thesis, instruments }
}

// ---------------------------------------------------------------------------
// 回溯 (outcome tracking): 管道在论点激活后 T+1/T+5/T+20 记录相关标的平均涨跌,
// 方向对齐 >= +2% 判 hit, <= -2% 判 miss, 其余 mixed (scripts/radar/outcome.py)
// ---------------------------------------------------------------------------

export type OutcomeHorizon = 't1' | 't5' | 't20'
export type OutcomeVerdict = 'hit' | 'miss' | 'mixed'

export type ThesisOutcome = {
  horizon: OutcomeHorizon
  verdict: OutcomeVerdict | null
  measuredAt: string
  /** 各市场各标的的窗口涨跌 {market: {symbol: pct}} */
  returns: Record<string, Record<string, number>>
  /** 全部标的的平均涨跌(未按方向翻转) */
  avgReturn: number | null
}

export type BacktestThesis = {
  id: string
  sector: string
  sectorZh: string | null
  theme: string
  direction: 'bullish' | 'bearish'
  status: string
  conviction: number
  createdAt: string
  outcomes: Partial<Record<OutcomeHorizon, ThesisOutcome>>
}

function parseOutcomeRow(r: Record<string, unknown>): ThesisOutcome {
  const returns = (r.returns as ThesisOutcome['returns']) ?? {}
  const moves: number[] = []
  for (const market of Object.values(returns)) {
    for (const pct of Object.values(market)) {
      if (typeof pct === 'number') moves.push(pct)
    }
  }
  return {
    horizon: r.horizon as OutcomeHorizon,
    verdict: (r.verdict as OutcomeVerdict) ?? null,
    measuredAt: r.measured_at as string,
    returns,
    avgReturn: moves.length > 0 ? moves.reduce((a, b) => a + b, 0) / moves.length : null,
  }
}

export async function getBacktest(): Promise<BacktestThesis[]> {
  const { data, error } = await supabase
    .from('sector_theses')
    .select(
      'id,sector,sector_zh,theme,direction,status,conviction,created_at, thesis_outcomes(horizon,verdict,measured_at,returns)'
    )
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error

  return (data ?? []).map((row) => {
    const outcomes: BacktestThesis['outcomes'] = {}
    for (const r of (row.thesis_outcomes as Record<string, unknown>[]) ?? []) {
      const parsed = parseOutcomeRow(r)
      outcomes[parsed.horizon] = parsed
    }
    return {
      id: row.id as string,
      sector: row.sector as string,
      sectorZh: (row.sector_zh as string) ?? null,
      theme: (row.theme as string) ?? '其他',
      direction: (row.direction as 'bullish' | 'bearish') ?? 'bullish',
      status: row.status as string,
      conviction: Number(row.conviction ?? 0),
      createdAt: row.created_at as string,
      outcomes,
    }
  })
}

// ---------------------------------------------------------------------------
// 持仓驾驶舱
// ---------------------------------------------------------------------------

export type PositionRow = {
  id: string
  ticker: string
  shares: number
  avgCost: number
  openedAt: string | null
  note: string | null
}

export async function getPositions(): Promise<PositionRow[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    ticker: r.ticker as string,
    shares: Number(r.shares),
    avgCost: Number(r.avg_cost),
    openedAt: (r.opened_at as string) ?? null,
    note: (r.note as string) ?? null,
  }))
}

export async function upsertPosition(
  ticker: string,
  shares: number,
  avgCost: number,
  note?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('positions')
    .upsert(
      { ticker, shares, avg_cost: avgCost, note: note ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'ticker' }
    )
  if (error) throw error
}

export async function removePosition(ticker: string): Promise<void> {
  const { error } = await supabase.from('positions').delete().eq('ticker', ticker)
  if (error) throw error
}

/** 持仓关联的论点(通过 sector_instruments 的 US 标的映射) */
export type PositionThesisLink = {
  thesisId: string
  sector: string
  sectorZh: string | null
  direction: 'bullish' | 'bearish'
  conviction: number
  status: string
}

export async function getThesisCoverage(
  tickers: string[]
): Promise<Record<string, PositionThesisLink[]>> {
  if (tickers.length === 0) return {}
  const [{ data: instRows, error: instError }, { data: thesisRows, error: thesisError }] =
    await Promise.all([
      supabase
        .from('sector_instruments')
        .select('sector,symbol')
        .eq('market', 'US')
        .in('symbol', tickers),
      supabase
        .from('sector_theses')
        .select('id,sector,sector_zh,direction,conviction,status')
        .in('status', ['forming', 'active', 'confirmed']),
    ])
  if (instError) throw instError
  if (thesisError) throw thesisError

  const thesesBySector = new Map<string, PositionThesisLink[]>()
  for (const t of thesisRows ?? []) {
    const link: PositionThesisLink = {
      thesisId: t.id as string,
      sector: t.sector as string,
      sectorZh: (t.sector_zh as string) ?? null,
      direction: (t.direction as 'bullish' | 'bearish') ?? 'bullish',
      conviction: Number(t.conviction ?? 0),
      status: t.status as string,
    }
    const list = thesesBySector.get(link.sector) ?? []
    list.push(link)
    thesesBySector.set(link.sector, list)
  }

  const coverage: Record<string, PositionThesisLink[]> = {}
  for (const inst of instRows ?? []) {
    const links = thesesBySector.get(inst.sector as string)
    if (!links) continue
    const symbol = inst.symbol as string
    coverage[symbol] = [...(coverage[symbol] ?? []), ...links]
  }
  // 去重并按信心分排序
  for (const symbol of Object.keys(coverage)) {
    const seen = new Set<string>()
    coverage[symbol] = coverage[symbol]
      .filter((l) => (seen.has(l.thesisId) ? false : (seen.add(l.thesisId), true)))
      .sort((a, b) => b.conviction - a.conviction)
  }
  return coverage
}

/** 侧边栏板块导航:与 ThesisPanel 相同的取数/分组/排序逻辑 */
export type ThemeNavItem = {
  theme: string
  bull: number
  bear: number
}

export async function getThemeNav(): Promise<ThemeNavItem[]> {
  const { data, error } = await supabase
    .from('sector_theses')
    .select('theme,direction,conviction')
    .in('status', ['forming', 'active', 'confirmed'])
    .order('conviction', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(30)
  if (error) throw error

  const groups = new Map<string, { bull: number; bear: number; maxConviction: number }>()
  for (const row of data ?? []) {
    const theme = (row.theme as string) || '其他'
    const group = groups.get(theme) ?? { bull: 0, bear: 0, maxConviction: 0 }
    if (row.direction === 'bearish') group.bear += 1
    else group.bull += 1
    group.maxConviction = Math.max(group.maxConviction, Number(row.conviction ?? 0))
    groups.set(theme, group)
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].maxConviction - a[1].maxConviction)
    .map(([theme, g]) => ({ theme, bull: g.bull, bear: g.bear }))
}

export async function getOutcomesForThesis(id: string): Promise<ThesisOutcome[]> {
  const { data, error } = await supabase
    .from('thesis_outcomes')
    .select('horizon,verdict,measured_at,returns')
    .eq('thesis_id', id)
  if (error) throw error
  const order: OutcomeHorizon[] = ['t1', 't5', 't20']
  return (data ?? [])
    .map((r) => parseOutcomeRow(r))
    .sort((a, b) => order.indexOf(a.horizon) - order.indexOf(b.horizon))
}
