/**
 * useBackendPerformance — fetches performance analytics from backend when available.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B5: Performance Backend Analytics — graceful degradation to local.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { isBackendEnabled, getBackendPerformancePatterns, getBackendPerformanceSummary } from './commandBackendClient'

export interface BackendPerformanceState {
  available: boolean
  loading: boolean
  error: string | null
  reports: any[] | null
  summary: any | null
  lastFetchedAt: string | null
  source: 'backend' | 'local'
}

export function useBackendPerformance(backendOnline: boolean) {
  const [state, setState] = useState<BackendPerformanceState>({
    available: false,
    loading: false,
    error: null,
    reports: null,
    summary: null,
    lastFetchedAt: null,
    source: 'local',
  })
  const fetchedRef = useRef(false)

  const fetchPerformance = useCallback(async () => {
    if (!isBackendEnabled() || !backendOnline) {
      setState(prev => ({ ...prev, available: false, source: 'local' }))
      return
    }

    setState(prev => ({ ...prev, loading: true }))

    try {
      const [reports, summary] = await Promise.all([
        getBackendPerformancePatterns(),
        getBackendPerformanceSummary(),
      ])

      if (reports && summary) {
        setState({
          available: true,
          loading: false,
          error: null,
          reports,
          summary,
          lastFetchedAt: new Date().toISOString(),
          source: 'backend',
        })
      } else {
        setState(prev => ({ ...prev, available: false, loading: false, source: 'local' }))
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        available: false,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch performance',
        source: 'local',
      }))
    }
  }, [backendOnline])

  useEffect(() => {
    if (backendOnline && !fetchedRef.current) {
      fetchedRef.current = true
      fetchPerformance()
    }
  }, [backendOnline, fetchPerformance])

  return { ...state, refreshPerformance: fetchPerformance }
}
