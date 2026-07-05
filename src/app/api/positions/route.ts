import { NextRequest, NextResponse } from 'next/server'
import { getPositions, getWatchlist, addToWatchlist, upsertPosition } from '@/lib/db'
import { isAuthenticated } from '@/lib/auth'

export async function GET() {
  const positions = await getPositions()
  return NextResponse.json(positions)
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { ticker, shares, avgCost, note } = await req.json()
  const symbol = String(ticker ?? '').toUpperCase().trim()
  const sharesNum = Number(shares)
  const costNum = Number(avgCost)
  if (!symbol || !Number.isFinite(sharesNum) || sharesNum <= 0 || !Number.isFinite(costNum) || costNum < 0) {
    return NextResponse.json({ error: 'ticker/shares/avgCost required' }, { status: 400 })
  }

  await upsertPosition(symbol, sharesNum, costNum, note ?? null)

  // 自动加入 watchlist,让价格/事件管道开始同步该标的
  try {
    const watchlist = await getWatchlist()
    if (!watchlist.some((w) => w.ticker === symbol)) {
      await addToWatchlist(symbol)
    }
  } catch {
    // watchlist 同步失败不阻塞持仓写入
  }

  return NextResponse.json({ ok: true })
}
