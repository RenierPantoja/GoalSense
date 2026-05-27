/**
 * useCommandAlertNotifications — observes the AlertsContext `commandAlerts`
 * stream and fires foreground notifications for fresh ids only (V5.1).
 * ─────────────────────────────────────────────────────────────────────────────
 *  - First render: snapshots the current ids without notifying. The user does
 *    not get a flood of "new" notifications for a backlog they already saw.
 *  - Subsequent renders: any id that wasn't in the previous snapshot is treated
 *    as fresh and routed through `maybeNotifyCommandAlert` (which itself
 *    checks opt-in, permission, dedup and rate limit).
 *
 * Works while the tab is open. Background push is out of scope.
 */
import { useEffect, useRef } from 'react'
import type { CommandCenterAlert } from '@/context/AlertsContext'
import { cleanupNotifiedAlerts } from './notifiedAlertsStore'
import { maybeNotifyCommandAlert } from './alertNotificationBridge'

export function useCommandAlertNotifications(commandAlerts: CommandCenterAlert[]): void {
  const knownIdsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    // Light maintenance on first mount — keeps the dedup map small.
    cleanupNotifiedAlerts()
  }, [])

  useEffect(() => {
    // Initial snapshot: do not notify for any backlog.
    if (knownIdsRef.current === null) {
      knownIdsRef.current = new Set(commandAlerts.map(a => a.id))
      return
    }

    const known = knownIdsRef.current
    for (const alert of commandAlerts) {
      if (!alert || !alert.id) continue
      if (known.has(alert.id)) continue
      known.add(alert.id)
      // The bridge handles every guard internally (opt-in, permission, dedup,
      // rate limit). Result is intentionally ignored — no UI side-effect.
      maybeNotifyCommandAlert(alert)
    }
  }, [commandAlerts])
}
