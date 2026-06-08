import { useState, useCallback, useEffect, useRef } from 'react'
import { isBackendEnabled, getTelegramApprovalQueue, approveTelegramQueueItem, ignoreTelegramQueueItem } from './commandBackendClient'

export interface TelegramApprovalQueueItem {
  alertId: string
  alert: {
    id: string
    patternId: string
    fixtureId: string
    status: string
    confidence: number
    triggerMinute: number | null
    triggerScoreHome: number
    triggerScoreAway: number
    createdAt: string
    evidenceJson: string
    temporalEvidenceJson: string | null
  }
  eligibleChannels: Array<{ channelId: string; channelName: string; reasons: string[]; warnings: string[] }>
  blockedChannels: Array<{ channelId: string; channelName: string; blockedReasons: string[] }>
  alreadySentChannels: string[]
  skippedChannels: string[]
  recommended: boolean
  warnings: string[]
  createdAt: string
}

export interface TelegramApprovalQueueState {
  loading: boolean
  items: TelegramApprovalQueueItem[]
  error: string | null
  lastFetchedAt: string | null
  approvingIds: Set<string>
  ignoringIds: Set<string>
}

export function useTelegramApprovalQueue(backendOnline: boolean, telegramEnabled: boolean) {
  const [state, setState] = useState<TelegramApprovalQueueState>({
    loading: false,
    items: [],
    error: null,
    lastFetchedAt: null,
    approvingIds: new Set(),
    ignoringIds: new Set(),
  })
  const fetchedRef = useRef(false)

  const refreshQueue = useCallback(async (options?: { showLoading?: boolean }) => {
    if (!isBackendEnabled() || !backendOnline || !telegramEnabled) return

    if (options?.showLoading !== false) {
      setState(prev => ({ ...prev, loading: true }))
    }

    try {
      // Only fetch eligible ones to avoid a huge list
      const items = await getTelegramApprovalQueue({ onlyEligible: true })
      setState(prev => ({
        ...prev,
        loading: false,
        items: items || [],
        error: null,
        lastFetchedAt: new Date().toISOString()
      }))
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err?.message || 'Failed to fetch queue' }))
    }
  }, [backendOnline, telegramEnabled])

  useEffect(() => {
    if (backendOnline && telegramEnabled && !fetchedRef.current && isBackendEnabled()) {
      fetchedRef.current = true
      refreshQueue()
    }
  }, [backendOnline, telegramEnabled, refreshQueue])

  const approve = useCallback(async (alertId: string, channelId: string): Promise<{ success: boolean; error?: string }> => {
    setState(prev => {
      const next = new Set(prev.approvingIds)
      next.add(alertId)
      return { ...prev, approvingIds: next }
    })

    try {
      const res = await approveTelegramQueueItem(alertId, channelId)
      if (res?.sent) {
        // Remove from queue locally
        setState(prev => ({
          ...prev,
          items: prev.items.filter(item => item.alertId !== alertId)
        }))
        return { success: true }
      }
      return { success: false, error: 'Approval failed' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Approval failed' }
    } finally {
      setState(prev => {
        const next = new Set(prev.approvingIds)
        next.delete(alertId)
        return { ...prev, approvingIds: next }
      })
    }
  }, [])

  const ignore = useCallback(async (alertId: string, channelId?: string, reason?: string): Promise<{ success: boolean; error?: string }> => {
    setState(prev => {
      const next = new Set(prev.ignoringIds)
      next.add(alertId)
      return { ...prev, ignoringIds: next }
    })

    try {
      const res = await ignoreTelegramQueueItem(alertId, channelId, reason)
      if (res?.success) {
        // Remove from queue locally if skipping for all (no channelId specified)
        if (!channelId) {
          setState(prev => ({
            ...prev,
            items: prev.items.filter(item => item.alertId !== alertId)
          }))
        } else {
          // If skipping a specific channel, just refresh the queue silently to get updated eligible channels
          refreshQueue({ showLoading: false })
        }
        return { success: true }
      }
      return { success: false, error: 'Ignore failed' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Ignore failed' }
    } finally {
      setState(prev => {
        const next = new Set(prev.ignoringIds)
        next.delete(alertId)
        return { ...prev, ignoringIds: next }
      })
    }
  }, [refreshQueue])

  return {
    ...state,
    refreshQueue,
    approve,
    ignore
  }
}
