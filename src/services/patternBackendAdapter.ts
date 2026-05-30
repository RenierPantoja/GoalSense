/**
 * patternBackendAdapter — converts between frontend Pattern type and backend API format.
 * Preserves all fields during conversion. No data loss.
 */
import type { Pattern } from '@/features/command/types/commandTypes'

export interface BackendPatternPayload {
  name: string
  description: string
  status: string
  severity: string
  scope: string
  action: string
  minConfidence: number
  requireRichData: boolean
  onlyLive: boolean
  onlyPreMatch: boolean
  conditionsJson: string
  scopeFilterJson?: string | null
  templateId?: string | null
  /** Extended fields stored as JSON to avoid schema migration for every new field */
  extendedJson?: string | null
}

export function toBackendPayload(pattern: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>): BackendPatternPayload {
  // Extended fields that don't have dedicated DB columns yet
  const extended: Record<string, unknown> = {}
  if (pattern.matches && pattern.matches.length > 0) extended.matches = pattern.matches
  if (pattern.excludeLeagues && pattern.excludeLeagues.length > 0) extended.excludeLeagues = pattern.excludeLeagues
  if (pattern.excludeTeams && pattern.excludeTeams.length > 0) extended.excludeTeams = pattern.excludeTeams
  if (pattern.excludeMatches && pattern.excludeMatches.length > 0) extended.excludeMatches = pattern.excludeMatches
  if (pattern.maxTriggersPerMatch !== 2) extended.maxTriggersPerMatch = pattern.maxTriggersPerMatch
  if (pattern.antiDuplicateWindow !== 5) extended.antiDuplicateWindow = pattern.antiDuplicateWindow

  return {
    name: pattern.name,
    description: pattern.description || '',
    status: pattern.status,
    severity: pattern.severity,
    scope: pattern.scope,
    action: pattern.action,
    minConfidence: pattern.minConfidence,
    requireRichData: pattern.requireRichData || false,
    onlyLive: pattern.onlyLive || false,
    onlyPreMatch: pattern.onlyPreMatch || false,
    conditionsJson: JSON.stringify(pattern.conditions),
    scopeFilterJson: pattern.scopeFilter ? JSON.stringify(pattern.scopeFilter) : null,
    templateId: pattern.templateId || null,
    extendedJson: Object.keys(extended).length > 0 ? JSON.stringify(extended) : null,
  }
}

export function fromBackendPattern(raw: any): Pattern {
  const extended = safeParseJson(raw.extendedJson, {})

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || '',
    status: raw.status || 'paused',
    severity: raw.severity || 'attention',
    scope: raw.scope || 'all',
    action: raw.action || 'register_alert',
    minConfidence: raw.minConfidence ?? 50,
    requireRichData: raw.requireRichData || false,
    onlyLive: raw.onlyLive || false,
    onlyPreMatch: raw.onlyPreMatch || false,
    conditions: safeParseJson(raw.conditionsJson, []),
    scopeFilter: raw.scopeFilterJson ? safeParseJson(raw.scopeFilterJson, undefined) : undefined,
    templateId: raw.templateId || undefined,
    isTemplate: !!raw.templateId,
    // Restore extended fields
    matches: Array.isArray(extended.matches) ? extended.matches : undefined,
    excludeLeagues: Array.isArray(extended.excludeLeagues) ? extended.excludeLeagues : undefined,
    excludeTeams: Array.isArray(extended.excludeTeams) ? extended.excludeTeams : undefined,
    excludeMatches: Array.isArray(extended.excludeMatches) ? extended.excludeMatches : undefined,
    maxTriggersPerMatch: typeof extended.maxTriggersPerMatch === 'number' ? extended.maxTriggersPerMatch : 2,
    antiDuplicateWindow: typeof extended.antiDuplicateWindow === 'number' ? extended.antiDuplicateWindow : 5,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  }
}

function safeParseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}
