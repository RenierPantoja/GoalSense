/**
 * useTelegramIntegration — manages Telegram channel config and manual signal delivery.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase C1.2: Includes delivery status tracking per alert.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  isBackendEnabled,
  getTelegramStatus,
  listTelegramChannels,
  createTelegramChannel,
  deleteTelegramChannel,
  sendAlertToTelegram,
} from './commandBackendClient'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TelegramChannelView {
  id: string
  name: string
  chatId: string
  type: 'group' | 'channel' | 'private'
  isActive: boolean
  createdAt?: string
}

export interface SignalDeliveryView {
  id: string
  alertId: string
  channelId: string
  channelName?: string
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'unknown'
  errorMessage?: string
  sentAt?: string
  createdAt?: string
}

export interface TelegramIntegrationState {
  enabled: boolean
  configured: boolean
  loading: boolean
  channels: TelegramChannelView[]
  deliveriesByAlertId: Record<string, SignalDeliveryView[]>
  error: string | null
  lastFetchedAt: string | null
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTelegramIntegration(backendOnline: boolean) {
  const [state, setState] = useState<TelegramIntegrationState>({
    enabled: false,
    configured: false,
    loading: false,
    channels: [],
    deliveriesByAlertId: {},
    error: null,
    lastFetchedAt: null,
  })
  const fetchedRef = useRef(false)

  const refreshTelegram = useCallback(async () => {
    if (!isBackendEnabled() || !backendOnline) return

    setState(prev => ({ ...prev, loading: true }))
    try {
      const [status, channels] = await Promise.all([
        getTelegramStatus(),
        listTelegramChannels(),
      ])

      setState(prev => ({
        ...prev,
        enabled: status?.enabled || false,
        configured: status?.configured || false,
        loading: false,
        channels: (channels || []).map(adaptChannel),
        error: null,
        lastFetchedAt: new Date().toISOString(),
      }))
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Failed' }))
    }
  }, [backendOnline])

  useEffect(() => {
    if (backendOnline && !fetchedRef.current && isBackendEnabled()) {
      fetchedRef.current = true
      refreshTelegram()
    }
  }, [backendOnline, refreshTelegram])

  const addChannel = useCallback(async (name: string, chatId: string, type?: string) => {
    try {
      await createTelegramChannel({ name, chatId, type })
      await refreshTelegram()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create channel' }
    }
  }, [refreshTelegram])

  const removeChannel = useCallback(async (channelId: string) => {
    try {
      await deleteTelegramChannel(channelId)
      await refreshTelegram()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete channel' }
    }
  }, [refreshTelegram])

  const sendAlert = useCallback(async (alertId: string, channelId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await sendAlertToTelegram(alertId, channelId)
      if (result?.sent) {
        // Update local delivery cache
        const channelName = state.channels.find(c => c.id === channelId)?.name
        setState(prev => {
          const existing = prev.deliveriesByAlertId[alertId] || []
          const newDelivery: SignalDeliveryView = {
            id: result.deliveryId || `temp_${Date.now()}`,
            alertId,
            channelId,
            channelName,
            status: 'sent',
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          }
          return { ...prev, deliveriesByAlertId: { ...prev.deliveriesByAlertId, [alertId]: [...existing, newDelivery] } }
        })
        return { success: true }
      }
      return { success: false, error: 'Send failed' }
    } catch (err: any) {
      // Record failed delivery in local cache
      setState(prev => {
        const existing = prev.deliveriesByAlertId[alertId] || []
        const failedDelivery: SignalDeliveryView = {
          id: `failed_${Date.now()}`,
          alertId,
          channelId,
          status: 'failed',
          errorMessage: err?.message || 'Send failed',
          createdAt: new Date().toISOString(),
        }
        return { ...prev, deliveriesByAlertId: { ...prev.deliveriesByAlertId, [alertId]: [...existing, failedDelivery] } }
      })
      return { success: false, error: err?.message || 'Send failed' }
    }
  }, [state.channels])

  /** Get delivery status for a specific alert */
  const getAlertTelegramStatus = useCallback((alertId: string): 'not_sent' | 'sent' | 'failed' | 'pending' => {
    const deliveries = state.deliveriesByAlertId[alertId]
    if (!deliveries || deliveries.length === 0) return 'not_sent'
    if (deliveries.some(d => d.status === 'sent')) return 'sent'
    if (deliveries.some(d => d.status === 'pending')) return 'pending'
    if (deliveries.some(d => d.status === 'failed')) return 'failed'
    return 'not_sent'
  }, [state.deliveriesByAlertId])

  /** Get channels already sent for an alert */
  const getSentChannelIds = useCallback((alertId: string): Set<string> => {
    const deliveries = state.deliveriesByAlertId[alertId] || []
    return new Set(deliveries.filter(d => d.status === 'sent').map(d => d.channelId))
  }, [state.deliveriesByAlertId])

  return {
    ...state,
    refreshTelegram,
    addChannel,
    removeChannel,
    sendAlert,
    getAlertTelegramStatus,
    getSentChannelIds,
  }
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

function adaptChannel(raw: any): TelegramChannelView {
  return {
    id: raw.id || '',
    name: raw.name || '',
    chatId: raw.chatId || '',
    type: raw.type || 'group',
    isActive: raw.isActive !== false,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : raw.createdAt,
  }
}
