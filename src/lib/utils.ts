import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 距今多久,中文:"刚刚" / "12 分钟前" / "5 小时前" / "45 天前" */
export function fmtAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "未知"
  const diff = Math.max(0, now - new Date(iso).getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 48) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export function hoursSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return Infinity
  return (now - new Date(iso).getTime()) / 3_600_000
}

/** 情报管道每 12 小时跑一次:14 小时内算新鲜,36 小时内算滞后,再久就是停摆 */
export function freshnessLevel(iso: string | null | undefined, now: number = Date.now()): "fresh" | "lagging" | "stale" {
  const h = hoursSince(iso, now)
  if (h <= 14) return "fresh"
  if (h <= 36) return "lagging"
  return "stale"
}
