/**
 * alertIntelligenceApi — frontend client for the B12/B13 read endpoints used by
 * Alertas 2.0 (Signal Ledger UI). GET-only, open, honest: missing data → null/[],
 * never throws, never invents. Reuses the resolved backend URL.
 */
import { getBackendUrl } from './commandBackendClient'
import type {
  SignalLedgerEntry, AlertOutcomeRecord, PatternLearningProfile,
  LearningEvent, LearningRecommendation, LearningOverview,
  SignalFailureAnalysis, AlertIntelligenceOverview, AlertSearchResponse,
  RelatedAlertsResponse, LearningEventDetail, AlertIntelFilters,
} from '@/features/command/intelligence/alertIntelligenceTypes'

async function get<T>(path: string): Promise<T | null> {
  const base = getBackendUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}${path}`, { headers: { 'Content-Type': 'application/json' } })
    if (!res.ok) return null
    const json = await res.json()
    return json?.success ? (json.data as T) : null
  } catch {
    return null
  }
}

export function isAlertIntelligenceConfigured(): boolean { return getBackendUrl().length > 0 }

/** Build a query string from a flat filter object (skips empty/undefined). */
function buildQuery(filters: Record<string, unknown> | object): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filters as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export const alertIntelligenceApi = {
  getAlertLedger(alertId: string) {
    return get<SignalLedgerEntry>(`/api/intelligence/alerts/${encodeURIComponent(alertId)}/ledger`)
  },
  getAlertOutcome(alertId: string) {
    return get<AlertOutcomeRecord>(`/api/intelligence/alerts/${encodeURIComponent(alertId)}/outcome`)
  },
  getPatternLearningProfile(patternId: string) {
    return get<PatternLearningProfile>(`/api/intelligence/learning/patterns/${encodeURIComponent(patternId)}`)
  },
  listPatternLearningProfiles(limit = 200) {
    return get<PatternLearningProfile[]>(`/api/intelligence/learning/patterns?limit=${limit}`)
  },
  getLearningEventsByPattern(patternId: string, limit = 50) {
    return get<LearningEvent[]>(`/api/intelligence/patterns/${encodeURIComponent(patternId)}/learning-events?limit=${limit}`)
  },
  getLearningRecommendations(limit = 200) {
    return get<LearningRecommendation[]>(`/api/intelligence/learning/recommendations?limit=${limit}`)
  },
  getLearningOverview() {
    return get<LearningOverview>(`/api/intelligence/learning/overview`)
  },

  // ── B17: hardened endpoints ────────────────────────────────────────────────
  getFailureAnalysis(alertId: string) {
    return get<SignalFailureAnalysis>(`/api/intelligence/alerts/${encodeURIComponent(alertId)}/failure-analysis`)
  },
  getPatternFailureAnalyses(patternId: string, limit = 100) {
    return get<SignalFailureAnalysis[]>(`/api/intelligence/patterns/${encodeURIComponent(patternId)}/failure-analyses?limit=${limit}`)
  },
  getAlertIntelligenceOverview(filters: AlertIntelFilters = {}) {
    return get<AlertIntelligenceOverview>(`/api/intelligence/alerts/overview${buildQuery(filters)}`)
  },
  searchAlertIntelligence(filters: AlertIntelFilters = {}, opts: { limit?: number; cursor?: number; sortBy?: string; sortDirection?: 'asc' | 'desc' } = {}) {
    const extra: Record<string, unknown> = {
      limit: opts.limit ?? 50,
      ...(opts.cursor != null ? { cursor: opts.cursor } : {}),
      ...(opts.sortBy ? { sortBy: opts.sortBy } : {}),
      ...(opts.sortDirection ? { sortDirection: opts.sortDirection } : {}),
    }
    return get<AlertSearchResponse>(`/api/intelligence/alerts/search${buildQuery({ ...filters, ...extra } as any)}`)
  },

  /** CSV export. Triggers a browser download. Honest on disabled (403) / offline. */
  async exportAlertsCsv(filters: AlertIntelFilters = {}, limit = 5000): Promise<{ ok: boolean; disabled: boolean; error: string | null }> {
    const base = getBackendUrl()
    if (!base) return { ok: false, disabled: false, error: 'no_backend' }
    try {
      const url = `${base}/api/intelligence/alerts/export.csv${buildQuery({ ...filters, limit } as any)}`
      const res = await fetch(url)
      if (res.status === 403) {
        let msg = 'Exportação desabilitada neste ambiente.'
        try { const j = await res.json(); msg = j?.error?.message || msg } catch { /* */ }
        return { ok: false, disabled: true, error: msg }
      }
      if (!res.ok) return { ok: false, disabled: false, error: `Backend respondeu ${res.status}` }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `goalsense-alerts-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
      return { ok: true, disabled: false, error: null }
    } catch (e: any) {
      return { ok: false, disabled: false, error: e?.message || 'network_error' }
    }
  },
  getRelatedAlerts(alertId: string, limit = 20) {
    return get<RelatedAlertsResponse>(`/api/intelligence/alerts/${encodeURIComponent(alertId)}/related?limit=${limit}`)
  },
  getRelatedAlertsForPattern(patternId: string, limit = 30) {
    return get<RelatedAlertsResponse>(`/api/intelligence/patterns/${encodeURIComponent(patternId)}/related-alerts?limit=${limit}`)
  },
  getRelatedAlertsForLearningEvent(eventId: string, limit = 20) {
    return get<RelatedAlertsResponse & { eventId: string; basis?: string }>(`/api/intelligence/learning/events/${encodeURIComponent(eventId)}/related-alerts?limit=${limit}`)
  },
  getLearningEventDetail(eventId: string) {
    return get<LearningEventDetail>(`/api/intelligence/learning/events/${encodeURIComponent(eventId)}`)
  },

  /** Compose the full intelligence bundle for one alert (no backend bundle endpoint). */
  async getAlertIntelligenceBundle(alertId: string): Promise<{
    ledger: SignalLedgerEntry | null
    outcome: AlertOutcomeRecord | null
    profile: PatternLearningProfile | null
    learningEvents: LearningEvent[]
  }> {
    const [ledger, outcome] = await Promise.all([
      this.getAlertLedger(alertId),
      this.getAlertOutcome(alertId),
    ])
    const patternId = ledger?.patternId || null
    const [profile, learningEvents] = await Promise.all([
      patternId ? this.getPatternLearningProfile(patternId) : Promise.resolve(null),
      patternId ? this.getLearningEventsByPattern(patternId) : Promise.resolve([] as LearningEvent[]),
    ])
    return { ledger, outcome, profile, learningEvents: learningEvents || [] }
  },
}
