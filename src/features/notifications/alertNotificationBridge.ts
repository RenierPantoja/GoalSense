/**
 * alertNotificationBridge — opt-in foreground notification for new alerts.
 * ─────────────────────────────────────────────────────────────────────────────
 * V5 — exposes a single helper, `maybeNotifyCommandAlert`, that the Command
 * Center *can* call when it registers a fresh alert. It only fires a local
 * notification if ALL of:
 *  - the user explicitly enabled `commandAlertsEnabled` in Settings;
 *  - the browser supports notifications;
 *  - permission === 'granted'.
 *
 * Important: this bridge is NOT auto-wired anywhere yet. The Command Center
 * keeps its current behaviour. We are deliberately leaving the integration
 * point dormant until we ship the Settings toggle and the user opts in.
 *
 * Real push (background, app closed) requires a backend + token management
 * and is out of scope for V5.
 */
import type { CommandCenterAlert } from '@/context/AlertsContext'
import { canShowLocalNotification, showLocalNotification } from './notificationService'
import { loadNotificationSettings } from './notificationSettings'

export function maybeNotifyCommandAlert(alert: Pick<CommandCenterAlert, 'patternName' | 'homeTeam' | 'awayTeam' | 'competition' | 'confidence' | 'severity' | 'fixtureId'>): boolean {
  const settings = loadNotificationSettings()
  if (!settings.commandAlertsEnabled) return false
  if (!canShowLocalNotification()) return false

  const severityLabel = alert.severity === 'critical' ? 'Crítico' : alert.severity === 'attention' ? 'Atenção' : 'Info'
  const title = `${severityLabel} · ${alert.patternName}`
  const body = `${alert.homeTeam} x ${alert.awayTeam} · ${alert.competition} · ${alert.confidence}%`
  return showLocalNotification(title, {
    body,
    tag: `gs-alert-${alert.fixtureId}-${alert.patternName}`,
    url: '/app/alerts',
  })
}
