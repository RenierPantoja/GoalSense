/**
 * alertIntelligenceApi — frontend client for the B12/B13 read endpoints used by
 * Alertas 2.0 (Signal Ledger UI). GET-only, open, honest: missing data → null/[],
 * never throws, never invents. Reuses the resolved backend URL.
 */
import { getBackendUrl } from './commandBackendClient'
import type {
  SignalLedgerEntry, AlertOutcomeRecord, PatternLearningProfile,
  LearningEvent, LearningRecommendation, LearningOverview,
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
