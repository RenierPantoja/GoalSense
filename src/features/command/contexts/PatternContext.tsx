/**
 * Pattern Context — manages patterns, triggered alerts, auto-discovery config.
 * localStorage persistence, ready for Firebase migration.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Pattern, PatternTemplate, TriggeredAlert, TriggeredAlertStatus, AutoDiscoveryConfig } from '../types/commandTypes'
import { DEFAULT_AUTO_DISCOVERY_CONFIG } from '../types/commandTypes'
import { PATTERN_TEMPLATES } from '../intelligence/patternTemplates'

const PATTERNS_KEY = 'goalsense_patterns_v2'
const TRIGGERED_KEY = 'goalsense_triggered_v2'
const DISCOVERY_CONFIG_KEY = 'goalsense_discovery_config'

function load<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback } catch { return fallback }
}
function save<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* */ }
}
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

interface PatternContextValue {
  patterns: Pattern[]
  templates: PatternTemplate[]
  createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern
  createFromTemplate: (templateId: string) => Pattern | null
  updatePattern: (id: string, patch: Partial<Pattern>) => void
  deletePattern: (id: string) => void
  togglePattern: (id: string) => void
  getActivePatterns: () => Pattern[]

  triggeredAlerts: TriggeredAlert[]
  triggerAlert: (alert: Omit<TriggeredAlert, 'id'>) => void
  updateTriggeredStatus: (id: string, status: TriggeredAlertStatus, extra?: { score?: { home: number; away: number }; reason?: string }) => void
  getRecentTriggered: (limit?: number) => TriggeredAlert[]
  resolveExpired: () => void

  discoveryConfig: AutoDiscoveryConfig
  updateDiscoveryConfig: (patch: Partial<AutoDiscoveryConfig>) => void

  activePatternCount: number
  triggeredTodayCount: number
}

const PatternContext = createContext<PatternContextValue | null>(null)

export function PatternProvider({ children }: { children: ReactNode }) {
  const [patterns, setPatterns] = useState<Pattern[]>(() => load(PATTERNS_KEY, []))
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>(() => load(TRIGGERED_KEY, []))
  const [discoveryConfig, setDiscoveryConfig] = useState<AutoDiscoveryConfig>(() => load(DISCOVERY_CONFIG_KEY, DEFAULT_AUTO_DISCOVERY_CONFIG))

  useEffect(() => { save(PATTERNS_KEY, patterns) }, [patterns])
  useEffect(() => { save(TRIGGERED_KEY, triggeredAlerts) }, [triggeredAlerts])
  useEffect(() => { save(DISCOVERY_CONFIG_KEY, discoveryConfig) }, [discoveryConfig])

  const createPattern = useCallback((input: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>): Pattern => {
    const now = new Date().toISOString()
    const pattern: Pattern = { ...input, id: genId('pat'), createdAt: now, updatedAt: now }
    setPatterns(prev => [...prev, pattern])
    return pattern
  }, [])

  const createFromTemplate = useCallback((templateId: string): Pattern | null => {
    const t = PATTERN_TEMPLATES.find(x => x.id === templateId)
    if (!t) return null
    const now = new Date().toISOString()
    const pattern: Pattern = {
      id: genId('pat'), name: t.name, description: t.description,
      conditions: [...t.conditions], severity: t.severity, status: 'active',
      isTemplate: true, templateId: t.id,
      scope: 'all', minConfidence: 50, action: 'register_alert',
      maxTriggersPerMatch: 2, antiDuplicateWindow: 5,
      createdAt: now, updatedAt: now,
    }
    setPatterns(prev => [...prev, pattern])
    return pattern
  }, [])

  const updatePattern = useCallback((id: string, patch: Partial<Pattern>) => {
    setPatterns(prev => prev.map(p => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p))
  }, [])

  const deletePattern = useCallback((id: string) => { setPatterns(prev => prev.filter(p => p.id !== id)) }, [])

  const togglePattern = useCallback((id: string) => {
    setPatterns(prev => prev.map(p => p.id === id ? { ...p, status: p.status === 'active' ? 'paused' : 'active', updatedAt: new Date().toISOString() } : p))
  }, [])

  const getActivePatterns = useCallback(() => patterns.filter(p => p.status === 'active'), [patterns])

  // ─── Triggered Alerts ────────────────────────────────────────────────────

  const triggerAlert = useCallback((alert: Omit<TriggeredAlert, 'id'>) => {
    setTriggeredAlerts(prev => {
      // Anti-duplicate: same pattern + fixture within window
      const windowMs = 5 * 60_000
      const dup = prev.find(t => t.patternId === alert.patternId && t.fixtureId === alert.fixtureId && (Date.now() - new Date(t.timestamp).getTime()) < windowMs)
      if (dup) return prev
      return [{ ...alert, id: genId('trig') }, ...prev].slice(0, 100)
    })
  }, [])

  const updateTriggeredStatus = useCallback((id: string, status: TriggeredAlertStatus, extra?: { score?: { home: number; away: number }; reason?: string }) => {
    setTriggeredAlerts(prev => prev.map(t => t.id === id ? {
      ...t, status,
      ...(status === 'confirmed' || status === 'failed' ? { confirmedAt: new Date().toISOString() } : {}),
      ...(extra?.score ? { scoreAtResolution: extra.score } : {}),
      ...(extra?.reason ? { resolutionReason: extra.reason } : {}),
    } : t))
  }, [])

  const getRecentTriggered = useCallback((limit = 10) => triggeredAlerts.slice(0, limit), [triggeredAlerts])

  const resolveExpired = useCallback(() => {
    const cutoff = Date.now() - 3 * 60 * 60 * 1000 // 3h
    setTriggeredAlerts(prev => prev.map(t => {
      if (t.status === 'pending' && new Date(t.timestamp).getTime() < cutoff) return { ...t, status: 'expired' as TriggeredAlertStatus }
      return t
    }))
  }, [])

  const updateDiscoveryConfig = useCallback((patch: Partial<AutoDiscoveryConfig>) => {
    setDiscoveryConfig(prev => ({ ...prev, ...patch }))
  }, [])

  const activePatternCount = patterns.filter(p => p.status === 'active').length
  const today = new Date().toISOString().split('T')[0]
  const triggeredTodayCount = triggeredAlerts.filter(t => t.timestamp.startsWith(today)).length

  return (
    <PatternContext.Provider value={{
      patterns, templates: PATTERN_TEMPLATES,
      createPattern, createFromTemplate, updatePattern, deletePattern, togglePattern, getActivePatterns,
      triggeredAlerts, triggerAlert, updateTriggeredStatus, getRecentTriggered, resolveExpired,
      discoveryConfig, updateDiscoveryConfig,
      activePatternCount, triggeredTodayCount,
    }}>
      {children}
    </PatternContext.Provider>
  )
}

export function usePatterns() {
  const ctx = useContext(PatternContext)
  if (!ctx) throw new Error('usePatterns must be used within PatternProvider')
  return ctx
}
