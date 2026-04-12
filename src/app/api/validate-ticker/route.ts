import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ valid: false })

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=8&newsCount=0`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    const quotes: Array<{ symbol: string; quoteType: string; longname?: string; shortname?: string; exchange?: string }> =
      data?.quotes ?? []

    // Exact ticker match first, then prefix match
    const match =
      quotes.find(
        (q) =>
          q.symbol?.toUpperCase() === ticker.toUpperCase() &&
          (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      ) ??
      quotes.find((q) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')

    if (match) {
      return NextResponse.json({
        valid: true,
        symbol: match.symbol,
        name: match.longname ?? match.shortname ?? match.symbol,
        exchange: match.exchange ?? '',
      })
    }
    return NextResponse.json({ valid: false })
  } catch {
    return NextResponse.json({ valid: false })
  }
}
