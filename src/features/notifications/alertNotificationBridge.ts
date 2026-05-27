/**
 * alertNotificationBridge — opt-in foreground notification for new alerts.
 * ─────────────────────────────────────────────────────────────────────────────
 * V5  — created the contract.
 * V5.1 — wired safely with dedup (per alert.id), rate limiting (3 / 60 s) and
 *        a typed result so the caller can log/measure without inventing data.
 *
 * Real push (background, app closed) requires a backend + token management.
 * This module deliberately stays foreground-only.
 */
import type { CommandCenterAlert } from '@/context/AlertsContext'
import { canShowLocalNotification, isNotificationSupported, showLocalNotification } from './notificationService'
import { loadNotificationSettings } from './notificationSettings'
import { hasAlertBeenNotified, isWithinRateLimit, markAlertNotified, recordNotificationFire } from './notifiedAlertsStore'

export type AlertNotifyResult =
  | 'sent'
  | 'disabled'             // user has not opted in
  | 'unsupported'          // browser has no Notification API
  | 'permission_not_granted'
  | 'invalid_alert'        // missing id or payload
  | 'duplicate'            // already notified for this alert.id within TTL
  | 'rate_limited'         // exceeded 3 fires in last 60 s
  | 'error'                // notification call returned false

type AlertLike = Pick<CommandCenterAlert, 'id' | 'patternName' | 'homeTeam' | 'awayTeam' | 'competition' | 'confidence' | 'severity' | 'fixtureId'>

function buildTitle(_alert: AlertLike): string {
  return 'GoalSense · Alerta detectado'
}

function buildBody(alert: AlertLike): string {
  const home = (alert.homeTeam || '').trim()
  const away = (alert.awayTeam || '').trim()
  const pat = (alert.patternName || '').trim()
  const conf = typeof alert.confidence === 'number' ? `${alert.confidence}%` : ''
  if (pat && home && away) {
    return conf ? `${pat} em ${home} x ${away} · ${conf}` : `${pat} em ${home} x ${away}`
  }
  return 'Alerta do Command Center detectado.'
}

/**
 * Best-effort foreground notification for a new Command Center alert.
 * Always returns a typed result and never throws.
 */
export function maybeNotifyCommandAlert(alert: AlertLike): AlertNotifyResult {
  if (!alert || typeof alert.id !== 'string' || alert.id.length === 0) return 'invalid_alert'

  if (!isNotificationSupported()) return 'unsupported'

  const settings = loadNotificationSettings()
  if (!settings.commandAlertsEnabled) return 'disabled'

  if (!canShowLocalNotification()) return 'permission_not_granted'

  if (hasAlertBeenNotified(alert.id)) return 'duplicate'

  if (!isWithinRateLimit()) return 'rate_limited'

  const ok = showLocalNotification(buildTitle(alert), {
    body: buildBody(alert),
    tag: `goalsense-command-${alert.id}`,
    url: '/app/alerts',
  })

  if (!ok) return 'error'

  // Record dedup + rate slot only after the API accepted the call. If the OS
  // later suppresses the notification (focus assist, DnD, browser policy),
  // we still treat it as fired — the next alert will not re-spam.
  markAlertNotified(alert.id)
  recordNotificationFire()
  return 'sent'
}
