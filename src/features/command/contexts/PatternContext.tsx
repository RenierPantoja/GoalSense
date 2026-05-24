/**
 * Pattern Context — manages user patterns with localStorage persistence.
 * Structure ready for Firebase migration.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Pattern, PatternTemplate, TriggeredAlert, TriggeredAlertStatus } from '../types/commandTypes'
import { PATTERN_TEMPLATES } from '../intelligence/patternTemplates'

// ─── Storage Keys ────────────────────────────────────────────────────────────

const PATTERNS_KEY = 'goalsense_patterns'
const TRIGGERED_KEY = 'goalsense_triggered_alerts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch { return fallback }
}

function saveToStorage<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* */ }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ─── Context Value ───────────────────────────────────────────────────────────

interface PatternContextValue {
  // Patterns
  patterns: Pattern[]
  templates: PatternTemplate[]
  createPattern: (pattern: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern
  createFromTemplate: (templateId: string) => Pattern | null
  updatePattern: (id: string, patch: Partial<Pattern>) => void
  deletePattern: (id: string) => void
  togglePattern: (id: string) => void
  getActivePatterns: () => Pattern[]

  // Triggered Alerts
  triggeredAlerts: TriggeredAlert[]
  triggerAlert: (alert: Omit<TriggeredAlert, 'id'>) => void
  updateTriggeredStatus: (id: string, status: TriggeredAlertStatus, score?: { home: number; away: number }) => void
  getRecentTriggered: (limit?: number) => TriggeredAlert[]
  clearExpiredAlerts: () => void

  // Stats
  activePatternCount: number
  triggeredTodayCount: number
}

// ─── Provider ────────────────────────────────────────────────────────────────

const PatternContext = createContext<PatternContextValue | null>(null)

export function PatternProvider({ children }: { children: ReactNode }) {
  const [patterns, setPatterns] = useState<Pattern[]>(() => loadFromStorage(PATTERNS_KEY, []))
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>(() => loadFromStorage(TRIGGERED_KEY, []))

  // Persist
  useEffect(() => { saveToStorage(PATTERNS_KEY, patterns) }, [patterns])
  useEffect(() => { saveToStorage(TRIGGERED_KEY, triggeredAlerts) }, [triggeredAlerts])

  // ─── Pattern CRUD ────────────────────────────────────────────────────────

  const createPattern = useCallback((input: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>): Pattern => {
    const now = new Date().toISOString()
    const pattern: Pattern = { ...input, id: generateId('pat'), createdAt: now, updatedAt: now }
    setPatterns(prev => [...prev, pattern])
    return pattern
  }, [])

  const createFromTemplate = useCallback((templateId: string): Pattern | null => {
    const template = PATTERN_TEMPLATES.find(t => t.id === templateId)
    if (!template) return null
    const now = new Date().toISOString()
    const pattern: Pattern = {
      id: generateId('pat'),
      name: template.name,
      description: template.description,
      conditions: [...template.conditions],
      severity: template.severity,
      status: 'active',
      isTemplate: true,
      templateId: template.id,
      createdAt: now,
      updatedAt: now,
    }
    setPatterns(prev => [...prev, pattern])
    return pattern
  }, [])

  const updatePattern = useCallback((id: string, patch: Partial<Pattern>) => {
    setPatterns(prev => prev.map(p => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p))
  }, [])

  const deletePattern = useCallback((id: string) => {
    setPatterns(prev => prev.filter(p => p.id !== id))
  }, [])

  const togglePattern = useCallback((id: string) => {
    setPatterns(prev => prev.map(p => p.id === id ? { ...p, status: p.status === 'active' ? 'paused' : 'active', updatedAt: new Date().toISOString() } : p))
  }, [])

  const getActivePatterns = useCallback(() => patterns.filter(p => p.status === 'active'), [patterns])

  // ─── Triggered Alerts ────────────────────────────────────────────────────

  const triggerAlert = useCallback((alert: Omit<TriggeredAlert, 'id'>) => {
    // Avoid duplicate triggers for same pattern + fixture within 5 minutes
    const recent = triggeredAlerts.find(
      t => t.patternId === alert.patternId && t.fixtureId === alert.fixtureId &&
        (Date.now() - new Date(t.timestamp).getTime()) < 300_000
    )
    if (recent) return

    const newAlert: TriggeredAlert = { ...alert, id: generateId('trig') }
    setTriggeredAlerts(prev => [newAlert, ...prev].slice(0, 50))
  }, [triggeredAlerts])

  const updateTriggeredStatus = useCallback((id: string, status: TriggeredAlertStatus, score?: { home: number; away: number }) => {
    setTriggeredAlerts(prev => prev.map(t => t.id === id ? {
      ...t,
      status,
      ...(status === 'confirmed' ? { confirmedAt: new Date().toISOString() } : {}),
      ...(score ? { scoreAtResolution: score } : {}),
    } : t))
  }, [])

  const getRecentTriggered = useCallback((limit = 10) => {
    return triggeredAlerts.slice(0, limit)
  }, [triggeredAlerts])

  const clearExpiredAlerts = useCallback(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24h
    setTriggeredAlerts(prev => prev.filter(t => new Date(t.timestamp).getTime() > cutoff || t.status === 'confirmed'))
  }, [])

  // ─── Stats ───────────────────────────────────────────────────────────────

  const activePatternCount = patterns.filter(p => p.status === 'active').length
  const today = new Date().toISOString().split('T')[0]
  const triggeredTodayCount = triggeredAlerts.filter(t => t.timestamp.startsWith(today)).length

  return (
    <PatternContext.Provider value={{
      patterns, templates: PATTERN_TEMPLATES,
      createPattern, createFromTemplate, updatePattern, deletePattern, togglePattern, getActivePatterns,
      triggeredAlerts, triggerAlert, updateTriggeredStatus, getRecentTriggered, clearExpiredAlerts,
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
