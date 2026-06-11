/**
 * Performance Input Adapter (Phase E6)
 * ─────────────────────────────────────────────────────────────────────────────
 * Normalizes alert/resolution records into a stable shape for analytics,
 * tolerant of differences between Prisma and Firebase:
 *   - Date vs ISO string
 *   - evidenceJson as JSON string OR already-parsed object
 *   - missing fields
 *   - status 'unknown' (preserved, never coerced)
 *   - malformed evidence (never throws)
 */

export interface NormalizedPerformanceAlert {
  id: string
  status: string
  confidence: number
  evidence: any
  temporal: any
}

export interface NormalizedPerformanceResolution {
  alertId: string | null
  resolutionType: string | null
  resolutionStatus: string | null
}

/** Parse a value that may be a JSON string, an object, null, or undefined. Never throws. */
export function safeParseJson(value: any, fallback: any): any {
  if (value == null) return fallback
  if (typeof value === 'object') return value // already parsed (defensive)
  if (typeof value !== 'string') return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

export function extractPerformanceEvidence(alert: any): any {
  return safeParseJson(alert?.evidenceJson, {})
}

export function extractTemporalEvidence(alert: any): any {
  return safeParseJson(alert?.temporalEvidenceJson, null)
}

export function normalizeAlertForPerformance(alert: any): NormalizedPerformanceAlert {
  return {
    id: String(alert?.id ?? ''),
    status: String(alert?.status ?? 'unknown'),
    confidence: typeof alert?.confidence === 'number' ? alert.confidence : 0,
    evidence: extractPerformanceEvidence(alert),
    temporal: extractTemporalEvidence(alert),
  }
}

export function normalizeResolutionForPerformance(resolution: any): NormalizedPerformanceResolution {
  return {
    alertId: resolution?.alertId ?? null,
    resolutionType: resolution?.resolutionType ?? null,
    resolutionStatus: resolution?.resolutionStatus ?? null,
  }
}

export interface PerformanceBreakdownKeys {
  momentumSource: string
  dataQuality: string
  provider: string
}

/**
 * Derive the per-alert breakdown keys EXACTLY as the on-demand aggregation does,
 * so incremental counters and on-demand reports stay consistent.
 * Accepts a raw alert (Prisma or Firebase) with evidenceJson/temporalEvidenceJson.
 */
export function extractBreakdownKeys(alert: any): PerformanceBreakdownKeys {
  const evidence = extractPerformanceEvidence(alert)
  const temporal = extractTemporalEvidence(alert)

  const momentumSource = (temporal && temporal.momentumSource) || 'unknown'

  const snapshot = evidence?.triggerSnapshot
  let dataQuality: string
  if (snapshot?.stats?.shotsOnTarget && snapshot?.stats?.possession) dataQuality = 'rich'
  else if (snapshot?.stats) dataQuality = 'partial'
  else dataQuality = 'poor'

  const provider = snapshot?.provider || evidence?.provider || 'unknown'

  return { momentumSource, dataQuality, provider }
}
