import { NextRequest, NextResponse } from 'next/server'
import { removePosition } from '@/lib/db'
import { isAuthenticated } from '@/lib/auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { ticker } = await params
  await removePosition(ticker.toUpperCase())
  return NextResponse.json({ ok: true })
}
