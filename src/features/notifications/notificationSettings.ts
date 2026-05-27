/**
 * notificationSettings — local user preferences for notifications.
 * ─────────────────────────────────────────────────────────────────────────────
 * V5 — backed by localStorage, default-off. The `goalsense_` prefix means
 * `clearAllGoalSense()` already wipes this in Settings.
 *
 * Only foreground (local) notifications are supported in V5, so there's no
 * "background push" toggle. When real push lands, this module is the natural
 * place to add a `pushSubscriptionEnabled` flag.
 */
const KEY = 'goalsense_notification_settings'

export interface NotificationSettings {
  /** When true, the Command Center fires a local notification on each new
   *  command alert it registers. Requires permission === 'granted'. */
  commandAlertsEnabled: boolean
}

const DEFAULTS: NotificationSettings = {
  commandAlertsEnabled: false,
}

function safeParse(raw: string | null): NotificationSettings {
  if (!raw) return { ...DEFAULTS }
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>
    return {
      commandAlertsEnabled: typeof parsed?.commandAlertsEnabled === 'boolean' ? parsed.commandAlertsEnabled : DEFAULTS.commandAlertsEnabled,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function loadNotificationSettings(): NotificationSettings {
  try { return safeParse(localStorage.getItem(KEY)) } catch { return { ...DEFAULTS } }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* private mode / quota */ }
}

export function updateNotificationSettings(patch: Partial<NotificationSettings>): NotificationSettings {
  const current = loadNotificationSettings()
  const next = { ...current, ...patch }
  saveNotificationSettings(next)
  return next
}
