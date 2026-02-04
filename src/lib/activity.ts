import { nanoid } from '@/ui/nanoid'

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error'
export type ActivityEntry = {
  id: string
  ts: string
  message: string
  level: ActivityLevel
  meta?: Record<string, any>
}

const STORAGE_KEY = 'app_activity_log_v1'
const MAX_ENTRIES = 50

export function logActivity(message: string, level: ActivityLevel = 'info', meta?: Record<string, any>) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list: ActivityEntry[] = raw ? JSON.parse(raw) : []
    const entry: ActivityEntry = {
      id: nanoid(),
      ts: new Date().toISOString(),
      message,
      level,
      meta,
    }
    const next = [entry, ...list].slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // fail silently to avoid breaking UX
  }
}

export function readActivity(limit = 10): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list: ActivityEntry[] = raw ? JSON.parse(raw) : []
    return list.slice(0, limit)
  } catch {
    return []
  }
}
