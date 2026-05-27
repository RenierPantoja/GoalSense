/**
 * notificationService — thin wrapper around the browser Notification API.
 * ─────────────────────────────────────────────────────────────────────────────
 * V5 — covers detection, permission gating and local (foreground) notifications.
 * Real push notifications require a backend + token management and are NOT
 * implemented here. Every helper degrades gracefully when the API is missing
 * (older browsers, in-app webviews, restricted contexts).
 */

export type NotificationSupport =
  | 'supported'
  | 'unsupported'

export type NotificationPermissionState = NotificationPermission | 'unsupported'

/** True when `window.Notification` exists and is constructible. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && typeof window.Notification === 'function'
}

export function getNotificationSupport(): NotificationSupport {
  return isNotificationSupported() ? 'supported' : 'unsupported'
}

/** Returns the current permission. `'unsupported'` when API is missing. */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Asks the user for permission. Must be called from a real user gesture
 * (button onClick) — never from page load. Returns the resolved state.
 *
 * Some Safari builds expose the legacy callback signature; we wrap with a
 * Promise either way so callers always get a typed Promise.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported'
  // Already granted/denied → no need to prompt again.
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  try {
    const result = await Notification.requestPermission()
    return result
  } catch {
    // Legacy fallback (very old Safari).
    return new Promise<NotificationPermissionState>((resolve) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(Notification as any).requestPermission((perm: NotificationPermission) => resolve(perm))
      } catch {
        resolve(Notification.permission)
      }
    })
  }
}

/**
 * Whether the page can fire a local notification right now (permission
 * granted + API available). Use as a guard before the actual call.
 */
export function canShowLocalNotification(): boolean {
  return isNotificationSupported() && Notification.permission === 'granted'
}

export interface LocalNotificationOptions {
  body?: string
  icon?: string
  tag?: string
  /** Optional URL to focus when the notification is clicked. */
  url?: string
  /** Vibration pattern (mobile); silently ignored on desktop. */
  vibrate?: number[]
  /** Silent flag (no sound on platforms that support it). */
  silent?: boolean
}

/**
 * Fires a foreground notification. Returns true if it was scheduled, false
 * otherwise. Never throws — failures (browser extensions, focus assist on
 * Windows, etc.) are swallowed and reported via the boolean result.
 */
export function showLocalNotification(title: string, options: LocalNotificationOptions = {}): boolean {
  if (!canShowLocalNotification()) return false
  try {
    const n = new Notification(title, {
      body: options.body,
      icon: options.icon || '/icons/icon.svg',
      tag: options.tag,
      silent: options.silent,
      // `vibrate` not in the standard NotificationOptions for non-SW
      // notifications, but several browsers honor it. Cast loosely.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(options.vibrate ? { vibrate: options.vibrate } as any : {}),
    })
    if (options.url) {
      n.onclick = () => {
        try {
          window.focus()
          if (options.url) window.location.href = options.url
          n.close()
        } catch {
          /* swallow */
        }
      }
    }
    return true
  } catch {
    return false
  }
}
