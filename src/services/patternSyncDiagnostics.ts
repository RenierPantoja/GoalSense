/**
 * patternSyncDiagnostics — compares local patterns with backend patterns.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2: Read Mirror — observability only, no writes.
 * Produces a diagnostic summary showing matched, divergent, and orphan patterns.
 */
import type { Pattern } from '@/features/command/types/commandTypes'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PatternMatchPair {
  localId: string
  backendId: string
}

export interface PatternDivergence {
  localId: string
  backendId: string
  localPattern: Pattern
  backendPattern: Pattern
  divergentFields: string[]
}

export interface PatternSyncDiagnostics {
  localCount: number
  backendCount: number
  matched: PatternMatchPair[]
  matchedCount: number
  onlyLocal: Pattern[]
  onlyLocalCount: number
  onlyBackend: Pattern[]
  onlyBackendCount: number
  divergent: PatternDivergence[]
  divergentCount: number
}

// ─── Stable Key ──────────────────────────────────────────────────────────────

/**
 * Generates a stable key for matching patterns across local/backend.
 * Priority: backendId > id match > templateId+name > name+createdAt(approx)
 */
export function getPatternStableKey(pattern: Pattern): string {
  // Use templateId + name as a strong composite key
  if (pattern.templateId) {
    return `tmpl:${pattern.templateId}:${pattern.name.toLowerCase().trim()}`
  }
  // Fallback: name + approximate creation date (day-level)
  const dayKey = pattern.createdAt ? pattern.createdAt.slice(0, 10) : 'unknown'
  return `name:${pattern.name.toLowerCase().trim()}:${dayKey}`
}

// ─── Critical Fields for Divergence ──────────────────────────────────────────

const CRITICAL_FIELDS: (keyof Pattern)[] = [
  'name',
  'status',
  'severity',
  'action',
  'minConfidence',
  'requireRichData',
  'scope',
  'templateId',
]

function conditionsEqual(a: Pattern['conditions'], b: Pattern['conditions']): boolean {
  if (a.length !== b.length) return false
  const serialize = (c: Pattern['conditions']) =>
    JSON.stringify(c.map(x => ({ type: x.type, params: x.params })).sort((x, y) => x.type.localeCompare(y.type)))
  return serialize(a) === serialize(b)
}

// ─── Compare ─────────────────────────────────────────────────────────────────

export function compareLocalAndBackendPatterns(
  localPatterns: Pattern[],
  backendPatterns: Pattern[],
): PatternSyncDiagnostics {
  const matched: PatternMatchPair[] = []
  const divergent: PatternDivergence[] = []
  const matchedLocalIds = new Set<string>()
  const matchedBackendIds = new Set<string>()

  // Build key maps
  const localByKey = new Map<string, Pattern>()
  const localById = new Map<string, Pattern>()
  for (const p of localPatterns) {
    localByKey.set(getPatternStableKey(p), p)
    localById.set(p.id, p)
  }

  const backendByKey = new Map<string, Pattern>()
  const backendById = new Map<string, Pattern>()
  for (const p of backendPatterns) {
    backendByKey.set(getPatternStableKey(p), p)
    backendById.set(p.id, p)
  }

  // Pass 1: Match by exact ID
  for (const bp of backendPatterns) {
    const lp = localById.get(bp.id)
    if (lp) {
      matchedLocalIds.add(lp.id)
      matchedBackendIds.add(bp.id)
      const divFields = findDivergentFields(lp, bp)
      if (divFields.length > 0) {
        divergent.push({ localId: lp.id, backendId: bp.id, localPattern: lp, backendPattern: bp, divergentFields: divFields })
      } else {
        matched.push({ localId: lp.id, backendId: bp.id })
      }
    }
  }

  // Pass 2: Match by stable key (for patterns with different IDs)
  for (const bp of backendPatterns) {
    if (matchedBackendIds.has(bp.id)) continue
    const key = getPatternStableKey(bp)
    const lp = localByKey.get(key)
    if (lp && !matchedLocalIds.has(lp.id)) {
      matchedLocalIds.add(lp.id)
      matchedBackendIds.add(bp.id)
      const divFields = findDivergentFields(lp, bp)
      if (divFields.length > 0) {
        divergent.push({ localId: lp.id, backendId: bp.id, localPattern: lp, backendPattern: bp, divergentFields: divFields })
      } else {
        matched.push({ localId: lp.id, backendId: bp.id })
      }
    }
  }

  // Orphans
  const onlyLocal = localPatterns.filter(p => !matchedLocalIds.has(p.id))
  const onlyBackend = backendPatterns.filter(p => !matchedBackendIds.has(p.id))

  return {
    localCount: localPatterns.length,
    backendCount: backendPatterns.length,
    matched,
    matchedCount: matched.length,
    onlyLocal,
    onlyLocalCount: onlyLocal.length,
    onlyBackend,
    onlyBackendCount: onlyBackend.length,
    divergent,
    divergentCount: divergent.length,
  }
}

// ─── Divergence Detection ────────────────────────────────────────────────────

function findDivergentFields(local: Pattern, backend: Pattern): string[] {
  const fields: string[] = []

  for (const field of CRITICAL_FIELDS) {
    const lv = local[field]
    const bv = backend[field]
    if (lv !== bv) {
      // Treat undefined/null/false as equivalent for booleans
      if (typeof lv === 'boolean' || typeof bv === 'boolean') {
        if (Boolean(lv) !== Boolean(bv)) fields.push(field)
      } else if ((lv ?? '') !== (bv ?? '')) {
        fields.push(field)
      }
    }
  }

  // Conditions comparison
  if (!conditionsEqual(local.conditions || [], backend.conditions || [])) {
    fields.push('conditions')
  }

  // Scope filter
  const localScope = JSON.stringify(local.scopeFilter || [])
  const backendScope = JSON.stringify(backend.scopeFilter || [])
  if (localScope !== backendScope) {
    fields.push('scopeFilter')
  }

  return fields
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export function summarizePatternDiff(diagnostics: PatternSyncDiagnostics): string {
  const parts: string[] = []
  if (diagnostics.matchedCount > 0) parts.push(`${diagnostics.matchedCount} sincronizados`)
  if (diagnostics.divergentCount > 0) parts.push(`${diagnostics.divergentCount} divergentes`)
  if (diagnostics.onlyLocalCount > 0) parts.push(`${diagnostics.onlyLocalCount} apenas local`)
  if (diagnostics.onlyBackendCount > 0) parts.push(`${diagnostics.onlyBackendCount} apenas backend`)
  return parts.join(' · ') || 'Sem padrões'
}
