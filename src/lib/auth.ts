import { createHash } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'settings_auth'
const SALT = 'stock-intel-settings-2026'

export function makeToken(password: string): string {
  return createHash('sha256').update(password + SALT).digest('hex')
}

export async function isAuthenticated(): Promise<boolean> {
  const password = process.env.SETTINGS_PASSWORD
  if (!password) return false
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false
  return token === makeToken(password)
}
