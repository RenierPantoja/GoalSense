/**
 * notificationDiagnostics — readiness snapshot and umbrella cleanup helper.
 * ─────────────────────────────────────────────────────────────────────────────
 * V5.2 — keeps the Settings UI honest about what is wired, what is missing
 * and what is just impossible in this browser. All values are derived from
 * real runtime state; nothing is invented.
 */
import { getNotificationPermission, isNotificationSupported, type NotificationPermissionState } from './notificationService'
import { loadNotificationSettings } from './notificationSettings'
import { clearNotifiedAlerts, clearNotificationRateLimit } from './notifiedAlertsStore'
import { clearNotificationEvents } from './notificationEventsStore'

export interface NotificationReadiness {
  /** True when `window.Notification` is constructible. */
  supported: boolean
  /** Real permission, or `'unsupported'` when the API is missing. */
  permission: NotificationPermissionState
  /** Whether the user opted in via the Settings toggle. */
  commandAlertsEnabled: boolean
  /**
   * True when foreground command-center notifications would fire right now
   * (supported + granted + opted in). Rate limit / dedup are NOT considered
   * because they are per-event — readiness is about the channel itself.
   */
  ready: boolean
  /** Hard reasons the channel is not ready (resolve before ready can flip). */
  blockers: string[]
  /** Soft caveats the user should know even when ready === true. */
  warnings: string[]
}

const STATIC_WARNINGS = [
  'Funciona apenas enquanto o GoalSense estiver aberto.',
  'Push em segundo plano exige backend.',
]

export function getNotificationReadiness(): NotificationReadiness {
  const supported = isNotificationSupported()
  const permission = getNotificationPermission()
  const settings = loadNotificationSettings()

  const blockers: string[] = []
  if (!supported) blockers.push('Este navegador não suporta Notification API.')
  if (supported && permission === 'denied') blockers.push('A permissão de notificações foi bloqueada nas configurações do site.')
  if (supported && permission === 'default') blockers.push('A permissão de notificações ainda não foi concedida.')
  if (supported && !settings.commandAlertsEnabled) blockers.push('Alertas locais do Command Center estão desligados.')

  const ready = supported && permission === 'granted' && settings.commandAlertsEnabled

  return {
    supported,
    permission,
    commandAlertsEnabled: settings.commandAlertsEnabled,
    ready,
    blockers,
    warnings: [...STATIC_WARNINGS],
  }
}

/**
 * Umbrella reset: dedup map, rate limit window and event history. Does NOT
 * change the user's opt-in setting and does NOT revoke permission (that
 * lives in the browser, not in our store).
 */
export function clearNotificationDiagnostics(): void {
  clearNotifiedAlerts()
  clearNotificationRateLimit()
  clearNotificationEvents()
}
