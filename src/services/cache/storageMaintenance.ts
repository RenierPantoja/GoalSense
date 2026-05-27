/**
 * Storage Maintenance — prevents localStorage from growing indefinitely.
 * Runs cleanup on app startup and provides manual controls for Settings.
 */
import { getScopeKnowledgeStats, clearScopeKnowledge } from '@/services/intelligence/scopeKnowledgeBase'

const GS_PREFIX = 'gs_'
const GOALSENSE_KEYS = ['goalsense_', 'gs_cache_', 'gs_kb_', 'gs_prematch_']

export interface StorageStats {
  totalKeys: number
  goalsenseKeys: number
  estimatedSizeKB: number
  favorites: number
  patterns: number
  alerts: number
  commandAlerts: number
  outcomes: number
  cacheEntries: number
  scopeLeagues: number
  scopeTeams: number
  scopeMatches: number
  scopeKbBytes: number
}

export function getGoalSenseStorageStats(): StorageStats {
  let totalKeys = 0, goalsenseKeys = 0, estimatedSize = 0
  let favorites = 0, patterns = 0, alerts = 0, commandAlerts = 0, outcomes = 0, cacheEntries = 0

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      totalKeys++
      const isGS = GOALSENSE_KEYS.some(p => key.startsWith(p))
      if (isGS || key.startsWith(GS_PREFIX)) {
        goalsenseKeys++
        const val = localStorage.getItem(key) || ''
        estimatedSize += key.length + val.length
      }
      if (key === 'goalsense_favorites') favorites = countArray(key)
      if (key === 'goalsense_patterns_v2') patterns = countArray(key)
      if (key === 'goalsense_alert_rules') alerts = countArray(key)
      if (key === 'goalsense_command_alerts') commandAlerts = countArray(key)
      if (key === 'gs_prematch_outcomes') outcomes = countArray(key)
      if (key.startsWith('gs_cache_')) cacheEntries++
    }
  } catch { /* */ }

  const scopeStats = (() => { try { return getScopeKnowledgeStats() } catch { return { leagues: 0, teams: 0, matches: 0, bytes: 0 } } })()

  return { totalKeys, goalsenseKeys, estimatedSizeKB: Math.round(estimatedSize / 1024), favorites, patterns, alerts, commandAlerts, outcomes, cacheEntries, scopeLeagues: scopeStats.leagues, scopeTeams: scopeStats.teams, scopeMatches: scopeStats.matches, scopeKbBytes: scopeStats.bytes }
}

export function cleanupExpiredCache(): number {
  let removed = 0
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('gs_cache_')) continue
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const entry = JSON.parse(raw)
        if (entry.expiresAt && Date.now() > entry.expiresAt) keysToRemove.push(key)
      } catch { keysToRemove.push(key) }
    }
    for (const key of keysToRemove) { localStorage.removeItem(key); removed++ }
  } catch { /* */ }
  return removed
}

export function cleanupOldOutcomes(limit = 100): void {
  try {
    const raw = localStorage.getItem('gs_prematch_outcomes')
    if (!raw) return
    const outcomes = JSON.parse(raw)
    if (Array.isArray(outcomes) && outcomes.length > limit) {
      localStorage.setItem('gs_prematch_outcomes', JSON.stringify(outcomes.slice(0, limit)))
    }
  } catch { /* */ }
}

export function clearPreMatchCache(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes('prematch') || key.includes('team_fixtures') || key.includes('team_id'))) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
  } catch { /* */ }
}

export function clearKnowledgeBase(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('gs_kb_') || key.includes('knowledge'))) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
  } catch { /* */ }
}

export function clearOutcomes(): void {
  try { localStorage.removeItem('gs_prematch_outcomes') } catch { /* */ }
}

export function clearTriggeredAlerts(): void {
  // Both keys store dispatched alerts:
  // - goalsense_triggered_v2 → TriggeredAlert[] surfaced in Command Center "Alertas"
  // - goalsense_command_alerts → CommandCenterAlert[] consumed by AlertsContext
  // The Settings UI offers a single "Limpar alertas disparados" button so we
  // clear both together to keep the state coherent for the user.
  try { localStorage.removeItem('goalsense_triggered_v2') } catch { /* */ }
  try { localStorage.removeItem('goalsense_command_alerts') } catch { /* */ }
}

/** Clear the scope KB (real leagues/teams/matches the user has seen). Patterns and alerts are preserved. */
export function clearScopeKb(): void {
  try { clearScopeKnowledge() } catch { /* */ }
}

export function clearAllGoalSense(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && GOALSENSE_KEYS.some(p => key.startsWith(p))) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
  } catch { /* */ }
}

export function runStartupMaintenance(): void {
  try {
    cleanupExpiredCache()
    cleanupOldOutcomes(100)
  } catch { /* non-blocking */ }
}

function countArray(key: string): number {
  try { const raw = localStorage.getItem(key); if (!raw) return 0; const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.length : typeof arr === 'object' ? Object.keys(arr).length : 0 } catch { return 0 }
}
