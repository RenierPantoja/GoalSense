/**
 * notificationEventsStore — short audit trail of notification attempts.
 * ─────────────────────────────────────────────────────────────────────────────
 * V5.2 — every call to `maybeNotifyCommandAlert` (and the test button in
 * Settings) records its outcome here so the user can see WHY a notification
 * did or did not fire. No PII, no invented data: only what the runtime
 * actually returned.
 *
 * Storage:
 *  - key: `goalsense_notification_events`
 *  - cap: 50 most recent events
 *  - TTL: 7 days
 *
 * Cleared by `clearAllGoalSense()` via the `goalsense_` prefix.
 */
import type { AlertNotifyResult } from './alertNotificationBridge'

const EVENTS_KEY = 'goalsense_notification_events'
const MAX_EVENTS = 50
const EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface NotificationEvent {
  id: string
  /** Bridge result. Mirrors the return value of `maybeNotifyCommandAlert`. */
  status: AlertNotifyResult | 'test_sent' | 'test_failed'
  /** Optional alert id (Command Center alert) when applicable. */
  alertId?: string
  /** Short label like "Pressão por gol em LAFC x Seattle". Optional. */
  matchLabel?: string
  /** Optional title used (mirrors the notification title). */
  title?: string
  /** Optional human reason (e.g. "fixture missing" — kept short, no PII). */
  reason?: string
  /** Unix ms when the event was registered. */
  createdAt: number
}

function safeRead(): NotificationEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e: any): e is NotificationEvent => (
      e && typeof e.id === 'string' && typeof e.status === 'string' && typeof e.createdAt === 'number'
    ))
  } catch { return [] }
}

function safeWrite(list: NotificationEvent[]): void {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(list)) } catch { /* */ }
}

function genId(): string {
  return `nev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Append a new event, trimming by TTL and cap. Never throws. */
export function recordNotificationEvent(input: Omit<NotificationEvent, 'id' | 'createdAt'>): void {
  const now = Date.now()
  const next: NotificationEvent = {
    id: genId(),
    createdAt: now,
    status: input.status,
    alertId: input.alertId,
    matchLabel: input.matchLabel,
    title: input.title,
    reason: input.reason,
  }
  const fresh = safeRead().filter(e => (now - e.createdAt) < EVENT_TTL_MS)
  fresh.unshift(next)
  if (fresh.length > MAX_EVENTS) fresh.length = MAX_EVENTS
  safeWrite(fresh)
}

/** Returns events most-recent-first. Drops anything past the TTL. */
export function getNotificationEvents(): NotificationEvent[] {
  const now = Date.now()
  return safeRead().filter(e => (now - e.createdAt) < EVENT_TTL_MS)
}

export function clearNotificationEvents(): void {
  try { localStorage.removeItem(EVENTS_KEY) } catch { /* */ }
}
