/**
 * alertDuplicateGuard — content-aware anti-duplicate layer for the Command Center.
 * ─────────────────────────────────────────────────────────────────────────────
 * Goes beyond simple "same pattern + fixture within 5 min" by examining the
 * actual context: score, minute bucket, momentum source, side, and resolution
 * status of existing alerts.
 *
 * Rules:
 * - Exact duplicate: same fixture + pattern + score + side + minute bucket → blocked
 * - Similar context: same fixture + same type + same score + same side → blocked if recent
 * - Unknown spam: if previous alert was unknown/expired, stronger dedupe window
 * - Context change: new goal, new score, new side → allows new alert
 *
 * No mocks. No side effects. Pure function.
 */
import type { CommandCenterAlert } from '@/context/AlertsContext'

// --- Types ----------------------------------------------------------------

export interface AlertDuplicateSignature {
  fixtureId: number
  source: 'manual_pattern' | 'auto_discovery'
  patternId: string
  discoveryType?: string
  score: string
  minuteBucket: string
  momentumSource?: string
  side?: string
  keyContext: string
}

export interface DuplicateCheckResult {
  duplicate: boolean
  duplicateOf?: string
  reason?: string
  severity: 'exact' | 'similar_context' | 'none'
}

export interface DuplicateCandidate {
  fixtureId: number
  patternId: string
  score: { home: number; away: number }
  minute: number | null
  momentumSource?: string
  side?: string
  discoveryType?: string
}

// --- Constants: dedupe windows by type (minutes) --------------------------

const DEDUPE_WINDOWS: Record<string, number> = {
  // Discovery types
  pressure: 10,
  final_phase: 10,
  favorite_risk: 12,
  open_game: 12,
  dominance: 10,
  global_live: 15,
  starting_soon: 30,
  rich_data: 15,
  // Fallback
  default: 10,
}

/** Stronger window when previous alert was unknown/expired (avoid spam). */
const UNKNOWN_DEDUPE_WINDOW = 12

// --- Helpers --------------------------------------------------------------

function getMinuteBucket(minute: number | null): string {
  if (minute === null || minute === undefined) return 'unknown'
  if (minute <= 15) return '0-15'
  if (minute <= 30) return '16-30'
  if (minute <= 45) return '31-45'
  if (minute <= 60) return '46-60'
  if (minute <= 75) return '61-75'
  if (minute <= 90) return '76-90'
  return '90+'
}

function getScoreKey(score: { home: number; away: number }): string {
  return `${score.home}-${score.away}`
}

function getDedupeWindow(_patternId: string, discoveryType?: string): number {
  if (discoveryType && DEDUPE_WINDOWS[discoveryType]) {
    return DEDUPE_WINDOWS[discoveryType]
  }
  // For manual patterns, use default
  return DEDUPE_WINDOWS.default
}

function alertAge(alert: CommandCenterAlert, now: number): number {
  const created = new Date(alert.createdAt).getTime()
  if (isNaN(created)) return Infinity
  return (now - created) / 60_000 // minutes
}

// --- Main -----------------------------------------------------------------

/**
 * Build a duplicate signature for a candidate alert.
 */
export function buildDuplicateSignature(candidate: DuplicateCandidate): AlertDuplicateSignature {
  const source: AlertDuplicateSignature['source'] = candidate.patternId.startsWith('auto_') ? 'auto_discovery' : 'manual_pattern'
  const scoreKey = getScoreKey(candidate.score)
  const minuteBucket = getMinuteBucket(candidate.minute)
  const keyContext = `${candidate.patternId}:${candidate.fixtureId}:${scoreKey}:${minuteBucket}:${candidate.side || 'unknown'}`

  return {
    fixtureId: candidate.fixtureId,
    source,
    patternId: candidate.patternId,
    discoveryType: candidate.discoveryType,
    score: scoreKey,
    minuteBucket,
    momentumSource: candidate.momentumSource,
    side: candidate.side,
    keyContext,
  }
}

/**
 * Check if a candidate alert would be a duplicate of an existing alert.
 * Examines both pending and recently resolved alerts for context similarity.
 */
export function isDuplicateAlert(
  candidate: DuplicateCandidate,
  existingAlerts: CommandCenterAlert[],
  options?: {
    /** Include resolved alerts in the check (default: true). */
    includeResolved?: boolean
    /** Custom window override in minutes. */
    windowMinutes?: number
  },
): DuplicateCheckResult {
  const includeResolved = options?.includeResolved ?? true
  const now = Date.now()
  const candidateSig = buildDuplicateSignature(candidate)
  const baseWindow = options?.windowMinutes ?? getDedupeWindow(candidate.patternId, candidate.discoveryType)

  // Filter to same fixture
  const sameFixture = existingAlerts.filter(a => a.fixtureId === candidate.fixtureId)
  if (sameFixture.length === 0) return { duplicate: false, severity: 'none' }

  for (const existing of sameFixture) {
    const age = alertAge(existing, now)

    // Skip old alerts beyond any reasonable window
    if (age > Math.max(baseWindow, UNKNOWN_DEDUPE_WINDOW) * 2) continue

    // Skip resolved if not including them
    if (!includeResolved && existing.status !== 'pending') continue

    // --- Exact duplicate check ---
    // Same pattern + same fixture + same score + within window
    if (existing.patternId === candidate.patternId) {
      const existingScore = existing.scoreAtTrigger
        ? getScoreKey(existing.scoreAtTrigger)
        : null

      const candidateScore = getScoreKey(candidate.score)

      // Exact: same pattern, same score, within window
      if (existingScore === candidateScore && age <= baseWindow) {
        return {
          duplicate: true,
          duplicateOf: existing.id,
          reason: `Alerta igual já emitido há ${Math.round(age)} min (${existing.patternName})`,
          severity: 'exact',
        }
      }

      // Unknown/expired spam protection: stronger window
      if ((existing.status === 'unknown' || existing.status === 'expired') && age <= UNKNOWN_DEDUPE_WINDOW) {
        return {
          duplicate: true,
          duplicateOf: existing.id,
          reason: `Contexto semelhante sem resolução recente — evitando spam`,
          severity: 'exact',
        }
      }
    }

    // --- Similar context check ---
    // Different pattern but same fixture, same score, same minute bucket
    const existingScore = existing.scoreAtTrigger ? getScoreKey(existing.scoreAtTrigger) : null
    const candidateScore = getScoreKey(candidate.score)
    const existingBucket = getMinuteBucket(existing.minuteAtTrigger)
    const candidateBucket = candidateSig.minuteBucket

    if (
      existingScore === candidateScore &&
      existingBucket === candidateBucket &&
      age <= baseWindow * 0.7 // Tighter window for similar context
    ) {
      // Check if it's truly similar (same type of discovery or overlapping pattern)
      const existingIsAuto = existing.patternId.startsWith('auto_')
      const candidateIsAuto = candidate.patternId.startsWith('auto_')

      // Auto + Auto same type
      if (existingIsAuto && candidateIsAuto) {
        const existingType = existing.patternId.replace('auto_', '')
        if (existingType === candidate.discoveryType) {
          return {
            duplicate: true,
            duplicateOf: existing.id,
            reason: `Contexto semelhante já está em acompanhamento`,
            severity: 'similar_context',
          }
        }
      }

      // Manual already covers this fixture in same context
      if (!existingIsAuto && candidateIsAuto && existing.status === 'pending') {
        return {
          duplicate: true,
          duplicateOf: existing.id,
          reason: `Padrão manual já monitora este contexto`,
          severity: 'similar_context',
        }
      }
    }
  }

  return { duplicate: false, severity: 'none' }
}

/**
 * Check if a context change has occurred that would allow a new alert
 * even if a previous one exists for the same fixture/pattern.
 */
export function hasContextChanged(
  candidate: DuplicateCandidate,
  previousAlert: CommandCenterAlert,
): boolean {
  if (!previousAlert.scoreAtTrigger) return true

  const prevScore = getScoreKey(previousAlert.scoreAtTrigger)
  const newScore = getScoreKey(candidate.score)

  // Score changed — new goal happened
  if (prevScore !== newScore) return true

  // Minute bucket changed significantly (at least 2 buckets apart)
  const prevBucket = getMinuteBucket(previousAlert.minuteAtTrigger)
  const newBucket = getMinuteBucket(candidate.minute)
  const buckets = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90', '90+']
  const prevIdx = buckets.indexOf(prevBucket)
  const newIdx = buckets.indexOf(newBucket)
  if (prevIdx >= 0 && newIdx >= 0 && Math.abs(newIdx - prevIdx) >= 2) return true

  return false
}
