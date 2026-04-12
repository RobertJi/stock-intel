import { NextRequest, NextResponse } from 'next/server'
import { makeToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.SETTINGS_PASSWORD
  if (!expected || password !== expected) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 })
  }
  const token = makeToken(password)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('settings_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
    path: '/',
  })
  return res
}
