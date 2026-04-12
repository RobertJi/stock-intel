import { NextRequest, NextResponse } from 'next/server'
import { getWatchlist, addToWatchlist } from '@/lib/db'
import { isAuthenticated } from '@/lib/auth'

export async function GET() {
  const watchlist = await getWatchlist()
  return NextResponse.json(watchlist)
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { ticker, cik, aliases } = await req.json()
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })
  await addToWatchlist(ticker.toUpperCase().trim(), cik ?? null, aliases ?? null)
  return NextResponse.json({ ok: true })
}
