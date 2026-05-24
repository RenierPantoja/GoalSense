/**
 * Pre-Match Outcome Performance — records and analyzes the relationship
 * between pre-match intelligence and actual match outcomes.
 * localStorage MVP. No mocks. No fake stats.
 */

const OUTCOMES_KEY = 'gs_prematch_outcomes'
const MAX_OUTCOMES = 100

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PreMatchOutcomeRecord {
  canonicalMatchId: string
  date: string
  competition: string
  homeTeam: string
  awayTeam: string
  preMatchScore?: number
  preMatchConfidence?: string
  dataQuality?: string
  monitoredPatterns: { patternName: string; readiness: string }[]
  triggeredAlerts: { patternName: string; confidence: number; status: string; minuteAtTrigger?: number }[]
  finalScore?: { home: number; away: number }
  outcomeStatus: 'complete' | 'prematch_only' | 'alerts_pending' | 'resolved' | 'unknown'
  savedAt: number
}

export interface PreMatchOutcomeSummary {
  totalOutcomes: number
  completeJourneys: number
  prematchOnly: number
  withTriggeredAlerts: number
  resolvedAlerts: number
  avgPreMatchScore: number | null
  avgScoreConfirmed: number | null
  avgScoreFailed: number | null
  insufficientSample: boolean
  recentOutcomes: PreMatchOutcomeRecord[]
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function loadOutcomes(): PreMatchOutcomeRecord[] {
  try { const raw = localStorage.getItem(OUTCOMES_KEY); return raw ? JSON.parse(raw) : [] } catch { return [] }
}

function saveOutcomes(outcomes: PreMatchOutcomeRecord[]): void {
  try { localStorage.setItem(OUTCOMES_KEY, JSON.stringify(outcomes.slice(0, MAX_OUTCOMES))) } catch {}
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function recordPreMatchOutcome(input: Omit<PreMatchOutcomeRecord, 'savedAt'>): void {
  try {
    const outcomes = loadOutcomes()
    const existing = outcomes.findIndex(o => o.canonicalMatchId === input.canonicalMatchId)
    const record: PreMatchOutcomeRecord = { ...input, savedAt: Date.now() }

    if (existing >= 0) {
      // Update existing — merge new alerts/resolution
      const prev = outcomes[existing]
      record.triggeredAlerts = mergeAlerts(prev.triggeredAlerts, input.triggeredAlerts)
      record.outcomeStatus = input.outcomeStatus || prev.outcomeStatus
      if (input.finalScore) record.finalScore = input.finalScore
      outcomes[existing] = record
    } else {
      outcomes.unshift(record)
    }

    saveOutcomes(outcomes)
  } catch { /* non-blocking */ }
}

export function getPreMatchOutcomes(): PreMatchOutcomeRecord[] {
  return loadOutcomes()
}

export function buildPreMatchOutcomeSummary(): PreMatchOutcomeSummary {
  const outcomes = loadOutcomes()
  const complete = outcomes.filter(o => o.outcomeStatus === 'complete' || o.outcomeStatus === 'resolved')
  const prematchOnly = outcomes.filter(o => o.outcomeStatus === 'prematch_only')
  const withAlerts = outcomes.filter(o => o.triggeredAlerts.length > 0)
  const resolved = outcomes.flatMap(o => o.triggeredAlerts).filter(a => a.status === 'confirmed' || a.status === 'failed' || a.status === 'confirmed_partial')

  const confirmedAlerts = outcomes.flatMap(o => o.triggeredAlerts).filter(a => a.status === 'confirmed' || a.status === 'confirmed_partial')
  const failedAlerts = outcomes.flatMap(o => o.triggeredAlerts).filter(a => a.status === 'failed')

  // Avg scores
  const scoresWithOutcome = outcomes.filter(o => o.preMatchScore !== undefined && o.triggeredAlerts.length > 0)
  const confirmedScores = scoresWithOutcome.filter(o => o.triggeredAlerts.some(a => a.status === 'confirmed' || a.status === 'confirmed_partial')).map(o => o.preMatchScore!)
  const failedScores = scoresWithOutcome.filter(o => o.triggeredAlerts.every(a => a.status === 'failed')).map(o => o.preMatchScore!)

  const avgPreMatch = outcomes.filter(o => o.preMatchScore).length >= 3 ? Math.round(outcomes.filter(o => o.preMatchScore).reduce((s, o) => s + (o.preMatchScore || 0), 0) / outcomes.filter(o => o.preMatchScore).length) : null
  const avgConfirmed = confirmedScores.length >= 3 ? Math.round(confirmedScores.reduce((s, v) => s + v, 0) / confirmedScores.length) : null
  const avgFailed = failedScores.length >= 3 ? Math.round(failedScores.reduce((s, v) => s + v, 0) / failedScores.length) : null

  return {
    totalOutcomes: outcomes.length,
    completeJourneys: complete.length,
    prematchOnly: prematchOnly.length,
    withTriggeredAlerts: withAlerts.length,
    resolvedAlerts: resolved.length,
    avgPreMatchScore: avgPreMatch,
    avgScoreConfirmed: avgConfirmed,
    avgScoreFailed: avgFailed,
    insufficientSample: resolved.length < 5,
    recentOutcomes: outcomes.slice(0, 10),
  }
}

function mergeAlerts(prev: PreMatchOutcomeRecord['triggeredAlerts'], next: PreMatchOutcomeRecord['triggeredAlerts']): PreMatchOutcomeRecord['triggeredAlerts'] {
  const merged = [...prev]
  for (const a of next) {
    const existing = merged.find(m => m.patternName === a.patternName && m.minuteAtTrigger === a.minuteAtTrigger)
    if (existing) { existing.status = a.status } // update status
    else { merged.push(a) }
  }
  return merged
}
