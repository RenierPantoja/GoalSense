/**
 * useBackendSync — background sync hook for Command Center patterns.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2: Read Mirror — fetches backend patterns for comparison only.
 * Does NOT write to backend. Does NOT alter localStorage.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { isBackendEnabled, getBackendHealth, listBackendPatterns } from './commandBackendClient'
import { fromBackendPattern } from './patternBackendAdapter'
import { compareLocalAndBackendPatterns, summarizePatternDiff, type PatternSyncDiagnostics } from './patternSyncDiagnostics'
import type { Pattern } from '@/features/command/types/commandTypes'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PatternMirrorState {
  loading: boolean
  backendCount: number
  localCount: number
  matchedCount: number
  onlyLocalCount: number
  onlyBackendCount: number
  divergentCount: number
  lastFetchedAt: string | null
  error: string | null
  diagnostics: PatternSyncDiagnostics | null
  summary: string | null
}

export interface BackendSyncStatus {
  enabled: boolean
  online: boolean
  lastCheckedAt: string | null
  error: string | null
  patternMirror: PatternMirrorState
}

const EMPTY_MIRROR: PatternMirrorState = {
  loading: false,
  backendCount: 0,
  localCount: 0,
  matchedCount: 0,
  onlyLocalCount: 0,
  onlyBackendCount: 0,
  divergentCount: 0,
  lastFetchedAt: null,
  error: null,
  diagnostics: null,
  summary: null,
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBackendSync(localPatterns?: Pattern[]): BackendSyncStatus & {
  refreshBackendHealth: () => Promise<void>
  refreshPatternMirror: () => Promise<void>
} {
  const [status, setStatus] = useState<BackendSyncStatus>({
    enabled: isBackendEnabled(),
    online: false,
    lastCheckedAt: null,
    error: null,
    patternMirror: { ...EMPTY_MIRROR, localCount: localPatterns?.length || 0 },
  })
  const checkedRef = useRef(false)
  const localPatternsRef = useRef(localPatterns)
  localPatternsRef.current = localPatterns

  // ─── Health Check ────────────────────────────────────────────────────────
  const refreshBackendHealth = useCallback(async () => {
    if (!isBackendEnabled()) {
      setStatus(prev => ({ ...prev, enabled: false, online: false, error: null }))
      return
    }

    try {
      const health = await getBackendHealth()
      const online = !!health
      setStatus(prev => ({
        ...prev,
        enabled: true,
        online,
        lastCheckedAt: new Date().toISOString(),
        error: online ? null : 'Backend unreachable',
      }))
    } catch {
      setStatus(prev => ({
        ...prev,
        online: false,
        lastCheckedAt: new Date().toISOString(),
        error: 'Backend unreachable',
      }))
    }
  }, [])

  // ─── Pattern Mirror (Read-Only) ─────────────────────────────────────────
  const refreshPatternMirror = useCallback(async () => {
    if (!isBackendEnabled()) return

    setStatus(prev => ({ ...prev, patternMirror: { ...prev.patternMirror, loading: true } }))

    try {
      const rawBackendPatterns = await listBackendPatterns()

      if (!rawBackendPatterns) {
        setStatus(prev => ({
          ...prev,
          patternMirror: {
            ...EMPTY_MIRROR,
            localCount: localPatternsRef.current?.length || 0,
            error: 'Backend returned no data',
            lastFetchedAt: new Date().toISOString(),
          },
        }))
        return
      }

      // Convert backend patterns to frontend format for comparison
      const backendPatterns: Pattern[] = rawBackendPatterns.map(fromBackendPattern)
      const local = localPatternsRef.current || []

      // Run diagnostics comparison
      const diagnostics = compareLocalAndBackendPatterns(local, backendPatterns)
      const summary = summarizePatternDiff(diagnostics)

      setStatus(prev => ({
        ...prev,
        patternMirror: {
          loading: false,
          backendCount: diagnostics.backendCount,
          localCount: diagnostics.localCount,
          matchedCount: diagnostics.matchedCount,
          onlyLocalCount: diagnostics.onlyLocalCount,
          onlyBackendCount: diagnostics.onlyBackendCount,
          divergentCount: diagnostics.divergentCount,
          lastFetchedAt: new Date().toISOString(),
          error: null,
          diagnostics,
          summary,
        },
      }))
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        patternMirror: {
          ...prev.patternMirror,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch backend patterns',
        },
      }))
    }
  }, [])

  // ─── Initial Check ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isBackendEnabled() || checkedRef.current) return
    checkedRef.current = true

    const init = async () => {
      await refreshBackendHealth()
      // Only fetch mirror if health check passed
      const health = await getBackendHealth().catch(() => null)
      if (health) {
        await refreshPatternMirror()
      }
    }
    init()
  }, [refreshBackendHealth, refreshPatternMirror])

  // ─── Re-compare when local patterns change ─────────────────────────────
  const prevLocalCountRef = useRef(localPatterns?.length || 0)
  useEffect(() => {
    const currentCount = localPatterns?.length || 0
    if (currentCount !== prevLocalCountRef.current && status.online && status.patternMirror.lastFetchedAt) {
      prevLocalCountRef.current = currentCount
      refreshPatternMirror()
    }
  }, [localPatterns?.length, status.online, status.patternMirror.lastFetchedAt, refreshPatternMirror])

  return { ...status, refreshBackendHealth, refreshPatternMirror }
}
