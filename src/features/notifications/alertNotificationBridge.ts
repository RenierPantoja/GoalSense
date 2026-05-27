/**
 * alertNotificationBridge — opt-in foreground notification for new alerts.
 * ─────────────────────────────────────────────────────────────────────────────
 * V5   — created the contract.
 * V5.1 — wired with dedup, rate limit and a typed result.
 * V5.2 — every call now logs a `NotificationEvent` so the Settings panel can
 *        show *why* a notification did or did not fire. No invented data: the
 *        event mirrors the real path through the bridge.
 *
 * Real push (background, app closed) is still out of scope.
 */
import type { CommandCenterAlert } from '@/context/AlertsContext'
import { canShowLocalNotification, isNotificationSupported, showLocalNotification } from './notificationService'
import { loadNotificationSettings } from './notificationSettings'
import { hasAlertBeenNotified, isWithinRateLimit, markAlertNotified, recordNotificationFire } from './notifiedAlertsStore'
import { recordNotificationEvent } from './notificationEventsStore'

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

const TITLE = 'GoalSense · Alerta detectado'

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

function buildMatchLabel(alert: AlertLike): string | undefined {
  const home = (alert.homeTeam || '').trim()
  const away = (alert.awayTeam || '').trim()
  const pat = (alert.patternName || '').trim()
  if (pat && home && away) return `${pat} em ${home} x ${away}`
  if (home && away) return `${home} x ${away}`
  return undefined
}

function logEvent(status: AlertNotifyResult, alert: AlertLike | null, reason?: string): void {
  recordNotificationEvent({
    status,
    alertId: alert?.id,
    matchLabel: alert ? buildMatchLabel(alert) : undefined,
    title: status === 'sent' ? TITLE : undefined,
    reason,
  })
}

/**
 * Best-effort foreground notification for a new Command Center alert.
 * Always returns a typed result and never throws. Always logs an event.
 */
export function maybeNotifyCommandAlert(alert: AlertLike): AlertNotifyResult {
  if (!alert || typeof alert.id !== 'string' || alert.id.length === 0) {
    logEvent('invalid_alert', null, 'alert missing id')
    return 'invalid_alert'
  }

  if (!isNotificationSupported()) {
    logEvent('unsupported', alert)
    return 'unsupported'
  }

  const settings = loadNotificationSettings()
  if (!settings.commandAlertsEnabled) {
    logEvent('disabled', alert)
    return 'disabled'
  }

  if (!canShowLocalNotification()) {
    logEvent('permission_not_granted', alert)
    return 'permission_not_granted'
  }

  if (hasAlertBeenNotified(alert.id)) {
    logEvent('duplicate', alert)
    return 'duplicate'
  }

  if (!isWithinRateLimit()) {
    logEvent('rate_limited', alert)
    return 'rate_limited'
  }

  const ok = showLocalNotification(TITLE, {
    body: buildBody(alert),
    tag: `goalsense-command-${alert.id}`,
    url: '/app/alerts',
  })

  if (!ok) {
    logEvent('error', alert, 'showLocalNotification returned false')
    return 'error'
  }

  // Record dedup + rate slot only after the API accepted the call. If the OS
  // later suppresses the notification (focus assist, DnD, browser policy),
  // we still treat it as fired — the next alert will not re-spam.
  markAlertNotified(alert.id)
  recordNotificationFire()
  logEvent('sent', alert)
  return 'sent'
}
