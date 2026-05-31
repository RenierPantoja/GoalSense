/**
 * useTelegramIntegration — manages Telegram channel config and manual signal delivery.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase C1.1: Semi-automatic. User must confirm each send.
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

export interface TelegramIntegrationState {
  enabled: boolean
  configured: boolean
  loading: boolean
  channels: TelegramChannelView[]
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

      setState({
        enabled: status?.enabled || false,
        configured: status?.configured || false,
        loading: false,
        channels: (channels || []).map(adaptChannel),
        error: null,
        lastFetchedAt: new Date().toISOString(),
      })
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
      if (result?.sent) return { success: true }
      return { success: false, error: 'Send failed' }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Send failed' }
    }
  }, [])

  return { ...state, refreshTelegram, addChannel, removeChannel, sendAlert }
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
