import { useState, useCallback, useRef } from 'react'
import { isBackendEnabled, getOddsForAlert, refreshOddsForAlert } from './commandBackendClient'

export interface OddsMarket {
  provider: string
  bookmaker?: string
  marketType: string
  selection: string
  line?: number
  odds: number
  currency?: string
  capturedAt: string
}

export interface AlertOddsResponse {
  enabled: boolean
  available: boolean
  alertId: string
  fixtureId?: string
  candidateMarkets: string[]
  markets: OddsMarket[]
  bestByMarket: Record<string, OddsMarket>
  stale: boolean
  capturedAt?: string
  warnings: string[]
}

export function useAlertOdds() {
  const [oddsByAlertId, setOddsByAlertId] = useState<Record<string, AlertOddsResponse>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fetchedIds = useRef<Set<string>>(new Set())

  const loadOdds = useCallback(async (alertId: string, force = false) => {
    if (!isBackendEnabled()) return

    if (!force && fetchedIds.current.has(alertId)) return
    fetchedIds.current.add(alertId)

    setLoadingIds(prev => {
      const next = new Set(prev)
      next.add(alertId)
      return next
    })

    try {
      const res = await getOddsForAlert(alertId)
      if (res) {
        setOddsByAlertId(prev => ({ ...prev, [alertId]: res }))
        setErrors(prev => {
          const next = { ...prev }
          delete next[alertId]
          return next
        })
      }
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [alertId]: err?.message || 'Failed to load odds' }))
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev)
        next.delete(alertId)
        return next
      })
    }
  }, [])

  const refreshOdds = useCallback(async (alertId: string) => {
    if (!isBackendEnabled()) return

    setLoadingIds(prev => {
      const next = new Set(prev)
      next.add(alertId)
      return next
    })

    try {
      const res = await refreshOddsForAlert(alertId)
      if (res) {
        setOddsByAlertId(prev => ({ ...prev, [alertId]: res }))
        setErrors(prev => {
          const next = { ...prev }
          delete next[alertId]
          return next
        })
      }
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [alertId]: err?.message || 'Failed to refresh odds' }))
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev)
        next.delete(alertId)
        return next
      })
    }
  }, [])

  return {
    oddsByAlertId,
    loadingIds,
    errors,
    loadOdds,
    refreshOdds
  }
}
