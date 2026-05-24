/**
 * Local alerts system with localStorage persistence.
 * Alert rules define what the user wants to monitor.
 * Also stores triggered alerts from Command Center patterns.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertEventType = 'match_start' | 'goal' | 'halftime' | 'fulltime' | 'red_card' | 'lineup_available' | 'favorite_live'

export interface AlertRule {
  id: string
  name: string
  enabled: boolean
  type: 'team' | 'match' | 'league'
  targetId?: string
  targetName: string
  targetLogo?: string
  events: AlertEventType[]
  createdAt: string
  updatedAt: string
}

// Command Center triggered alerts stored here for /app/alerts visibility
export type CommandAlertStatus = 'pending' | 'confirmed' | 'failed' | 'expired' | 'unknown'

export interface CommandCenterAlert {
  id: string
  source: 'command_center'
  patternId: string
  patternName: string
  fixtureId: number
  homeTeam: string
  awayTeam: string
  competition: string
  minuteAtTrigger: number | null
  scoreAtTrigger: { home: number; away: number }
  scoreAtResolution?: { home: number; away: number }
  confidence: number
  severity: string
  evidences: string[]
  status: CommandAlertStatus
  resolutionReason?: string
  createdAt: string
  resolvedAt?: string
}

interface AlertsContextValue {
  alerts: AlertRule[]
  createAlert: (rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateAlert: (id: string, patch: Partial<Pick<AlertRule, 'name' | 'enabled' | 'events'>>) => void
  deleteAlert: (id: string) => void
  toggleAlert: (id: string) => void
  getAlerts: () => AlertRule[]
  getEnabledAlerts: () => AlertRule[]
  getAlertsForTeam: (teamName: string) => AlertRule[]
  getAlertsForMatch: (canonicalMatchId: string) => AlertRule[]
  hasAlertForTarget: (targetId: string) => boolean
  clearAllAlerts: () => void
  totalCount: number
  enabledCount: number
  // Command Center alerts
  commandAlerts: CommandCenterAlert[]
  registerCommandAlert: (alert: Omit<CommandCenterAlert, 'id' | 'createdAt'>) => void
  updateCommandAlertStatus: (id: string, status: CommandAlertStatus, extra?: { score?: { home: number; away: number }; reason?: string }) => void
  getCommandAlerts: () => CommandCenterAlert[]
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'goalsense_alert_rules'
const CMD_ALERTS_KEY = 'goalsense_command_alerts'

function loadAlerts(): AlertRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveAlerts(alerts: AlertRule[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts)) } catch { /* */ }
}

function loadCommandAlerts(): CommandCenterAlert[] {
  try {
    const raw = localStorage.getItem(CMD_ALERTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveCommandAlerts(alerts: CommandCenterAlert[]): void {
  try { localStorage.setItem(CMD_ALERTS_KEY, JSON.stringify(alerts)) } catch { /* */ }
}

function generateId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AlertsContext = createContext<AlertsContextValue | null>(null)

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertRule[]>(loadAlerts)
  const [commandAlerts, setCommandAlerts] = useState<CommandCenterAlert[]>(loadCommandAlerts)

  useEffect(() => { saveAlerts(alerts) }, [alerts])
  useEffect(() => { saveCommandAlerts(commandAlerts) }, [commandAlerts])

  const createAlert = useCallback((rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()
    const newAlert: AlertRule = { ...rule, id: generateId(), createdAt: now, updatedAt: now }
    setAlerts(prev => [...prev, newAlert])
  }, [])

  const updateAlert = useCallback((id: string, patch: Partial<Pick<AlertRule, 'name' | 'enabled' | 'events'>>) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a))
  }, [])

  const deleteAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }, [])

  const toggleAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled, updatedAt: new Date().toISOString() } : a))
  }, [])

  const getAlerts = useCallback(() => alerts, [alerts])
  const getEnabledAlerts = useCallback(() => alerts.filter(a => a.enabled), [alerts])

  const getAlertsForTeam = useCallback((teamName: string) => {
    const lower = teamName.toLowerCase()
    return alerts.filter(a => a.type === 'team' && a.targetName.toLowerCase() === lower)
  }, [alerts])

  const getAlertsForMatch = useCallback((canonicalMatchId: string) => {
    return alerts.filter(a => a.type === 'match' && a.targetId === canonicalMatchId)
  }, [alerts])

  const hasAlertForTarget = useCallback((targetId: string) => {
    return alerts.some(a => a.targetId === targetId || a.targetName.toLowerCase() === targetId.toLowerCase())
  }, [alerts])

  const clearAllAlerts = useCallback(() => { setAlerts([]) }, [])

  // ─── Command Center Alerts ─────────────────────────────────────────────

  const registerCommandAlert = useCallback((alert: Omit<CommandCenterAlert, 'id' | 'createdAt'>) => {
    setCommandAlerts(prev => {
      // Anti-duplicate: same pattern + fixture within 5 min
      const dup = prev.find(a => a.patternId === alert.patternId && a.fixtureId === alert.fixtureId && (Date.now() - new Date(a.createdAt).getTime()) < 300_000)
      if (dup) return prev
      const newAlert: CommandCenterAlert = { ...alert, id: generateId(), createdAt: new Date().toISOString() }
      return [newAlert, ...prev].slice(0, 100)
    })
  }, [])

  const updateCommandAlertStatus = useCallback((id: string, status: CommandAlertStatus, extra?: { score?: { home: number; away: number }; reason?: string }) => {
    setCommandAlerts(prev => prev.map(a => a.id === id ? {
      ...a, status,
      ...(status === 'confirmed' || status === 'failed' ? { resolvedAt: new Date().toISOString() } : {}),
      ...(extra?.score ? { scoreAtResolution: extra.score } : {}),
      ...(extra?.reason ? { resolutionReason: extra.reason } : {}),
    } : a))
  }, [])

  const getCommandAlerts = useCallback(() => commandAlerts, [commandAlerts])

  const totalCount = alerts.length
  const enabledCount = alerts.filter(a => a.enabled).length

  return (
    <AlertsContext.Provider value={{ alerts, createAlert, updateAlert, deleteAlert, toggleAlert, getAlerts, getEnabledAlerts, getAlertsForTeam, getAlertsForMatch, hasAlertForTarget, clearAllAlerts, totalCount, enabledCount, commandAlerts, registerCommandAlert, updateCommandAlertStatus, getCommandAlerts }}>
      {children}
    </AlertsContext.Provider>
  )
}

export function useAlerts() {
  const ctx = useContext(AlertsContext)
  if (!ctx) throw new Error('useAlerts must be used within AlertsProvider')
  return ctx
}

// ─── Helper: default events by type ─────────────────────────────────────────

export function getDefaultEvents(type: 'team' | 'match' | 'league'): AlertEventType[] {
  switch (type) {
    case 'team': return ['match_start', 'goal', 'fulltime']
    case 'match': return ['match_start', 'goal', 'halftime', 'fulltime']
    case 'league': return ['match_start', 'goal']
  }
}

export function getEventLabel(event: AlertEventType): string {
  switch (event) {
    case 'match_start': return 'Início da partida'
    case 'goal': return 'Gol'
    case 'halftime': return 'Intervalo'
    case 'fulltime': return 'Fim de jogo'
    case 'red_card': return 'Cartão vermelho'
    case 'lineup_available': return 'Escalação disponível'
    case 'favorite_live': return 'Favorito ao vivo'
  }
}

export const ALL_ALERT_EVENTS: AlertEventType[] = ['match_start', 'goal', 'halftime', 'fulltime', 'red_card', 'lineup_available']
