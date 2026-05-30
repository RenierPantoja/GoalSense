/**
 * useBackendSync — background sync hook for Command Center patterns.
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs in background without blocking UI. If backend is unavailable,
 * everything continues working via localStorage.
 *
 * Strategy:
 * 1. On mount, check backend health
 * 2. If online, fetch backend patterns (for future comparison)
 * 3. On pattern create/update/delete, mirror to backend if online
 * 4. If offline, queue for later sync
 *
 * This hook does NOT replace PatternContext. It runs alongside it.
 */
import { useEffect, useRef, useState } from 'react'
import { isBackendEnabled, getBackendHealth } from './commandBackendClient'

export interface BackendSyncStatus {
  enabled: boolean
  online: boolean
  lastCheckedAt: string | null
  error: string | null
}

export function useBackendSync(): BackendSyncStatus {
  const [status, setStatus] = useState<BackendSyncStatus>({
    enabled: isBackendEnabled(),
    online: false,
    lastCheckedAt: null,
    error: null,
  })
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!isBackendEnabled() || checkedRef.current) return
    checkedRef.current = true

    getBackendHealth().then(health => {
      setStatus({
        enabled: true,
        online: !!health,
        lastCheckedAt: new Date().toISOString(),
        error: health ? null : 'Backend unreachable',
      })
    }).catch(() => {
      setStatus(prev => ({ ...prev, online: false, error: 'Health check failed' }))
    })
  }, [])

  return status
}
