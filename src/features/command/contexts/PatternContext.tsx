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

const VALID_SCOPES = new Set(['all', 'favorites_only', 'specific_leagues', 'specific_teams', 'specific_matches'])
const VALID_ACTIONS = new Set(['register_alert', 'suggest_only', 'highlight'])
const VALID_SEVERITIES = new Set(['critical', 'attention', 'info'])
const VALID_STATUSES = new Set(['active', 'paused', 'archived'])

/**
 * Defensively normalize a pattern loaded from localStorage. Old patterns may be
 * missing fields added in later phases or carry invalid string values. We never
 * silently drop a pattern — we coerce to safe defaults so the UI keeps working.
 */
function safeNormalizePattern(raw: any): Pattern | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  const now = new Date().toISOString()
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Padrão sem nome',
    description: typeof raw.description === 'string' ? raw.description : '',
    conditions: Array.isArray(raw.conditions) ? raw.conditions.filter((c: any) => c && typeof c.type === 'string') : [],
    severity: VALID_SEVERITIES.has(raw.severity) ? raw.severity : 'attention',
    status: VALID_STATUSES.has(raw.status) ? raw.status : 'paused',
    isTemplate: !!raw.isTemplate,
    templateId: typeof raw.templateId === 'string' ? raw.templateId : undefined,
    scope: VALID_SCOPES.has(raw.scope) ? raw.scope : 'all',
    scopeFilter: Array.isArray(raw.scopeFilter) ? raw.scopeFilter.filter((s: any) => typeof s === 'string') : undefined,
    matches: Array.isArray(raw.matches) ? raw.matches.filter((s: any) => typeof s === 'string') : undefined,
    excludeLeagues: Array.isArray(raw.excludeLeagues) ? raw.excludeLeagues.filter((s: any) => typeof s === 'string') : undefined,
    excludeTeams: Array.isArray(raw.excludeTeams) ? raw.excludeTeams.filter((s: any) => typeof s === 'string') : undefined,
    excludeMatches: Array.isArray(raw.excludeMatches) ? raw.excludeMatches.filter((s: any) => typeof s === 'string') : undefined,
    requireRichData: raw.requireRichData === true ? true : undefined,
    onlyLive: raw.onlyLive === true ? true : undefined,
    onlyPreMatch: raw.onlyPreMatch === true ? true : undefined,
    minConfidence: typeof raw.minConfidence === 'number' && raw.minConfidence >= 0 && raw.minConfidence <= 100 ? raw.minConfidence : 50,
    action: VALID_ACTIONS.has(raw.action) ? raw.action : 'register_alert',
    maxTriggersPerMatch: typeof raw.maxTriggersPerMatch === 'number' && raw.maxTriggersPerMatch > 0 ? raw.maxTriggersPerMatch : 2,
    antiDuplicateWindow: typeof raw.antiDuplicateWindow === 'number' && raw.antiDuplicateWindow > 0 ? raw.antiDuplicateWindow : 5,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

function loadAndNormalizePatterns(): Pattern[] {
  const raw = load<unknown[]>(PATTERNS_KEY, [])
  if (!Array.isArray(raw)) return []
  const out: Pattern[] = []
  for (const r of raw) {
    const p = safeNormalizePattern(r)
    if (p) out.push(p)
  }
  return out
}

const TRIGGERED_LIMIT = 100

function loadAndCapTriggered(): TriggeredAlert[] {
  const raw = load<TriggeredAlert[]>(TRIGGERED_KEY, [])
  if (!Array.isArray(raw)) return []
  // Cap to 100 most recent (already sorted desc on save). Defensive in case file
  // grew via legacy paths or migration.
  return raw.slice(0, TRIGGERED_LIMIT)
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
  const [patterns, setPatterns] = useState<Pattern[]>(() => loadAndNormalizePatterns())
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>(() => loadAndCapTriggered())
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
      ...(status !== 'pending' ? { confirmedAt: new Date().toISOString() } : {}),
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
