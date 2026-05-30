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
}

export function toBackendPayload(pattern: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>): BackendPatternPayload {
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
  }
}

export function fromBackendPattern(raw: any): Pattern {
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
    maxTriggersPerMatch: 2,
    antiDuplicateWindow: 5,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  }
}

function safeParseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}
