/**
 * Live Momentum Noise Filter — B68
 * ─────────────────────────────────────────────────────────────────────────────
 * Separates real pressure from normal match variance. Single-snapshot spikes are
 * not strong signals; sustained pressure needs multiple snapshots or relevant
 * events. Momentum is never turned into a probability. Observe only.
 */
import type {
  MomentumNoiseAssessment,
  MomentumNoiseCategory,
  LiveFirstSignalEvidenceStrength,
} from './liveFirstSignalQuality.types.js'

export interface MomentumNoiseInput {
  snapshotCount?: number
  minute?: number | null
  scoreHome?: number
  scoreAway?: number
  hasStats?: boolean
  hasTimeline?: boolean
  freshness?: 'fresh' | 'slightly_stale' | 'stale' | 'unknown'
  recentScoreChange?: boolean
  recentRedCard?: boolean
  /** team the pressure is attributed to */
  pressureSide?: 'home' | 'away' | 'neutral'
}

/** Detect a single-snapshot false pressure spike. */
export function detectFalsePressureSpike(input: MomentumNoiseInput): boolean {
  return (input.snapshotCount ?? 0) < 2 && !input.recentScoreChange && !input.recentRedCard
}

/** Sustained pressure requires multiple snapshots and some stats/timeline support. */
export function detectSustainedPressure(input: MomentumNoiseInput): boolean {
  return (input.snapshotCount ?? 0) >= 3 && (!!input.hasStats || !!input.hasTimeline)
}

/** Pressure that follows a concrete event (goal/card). */
export function detectEventDrivenMomentum(input: MomentumNoiseInput): boolean {
  return !!input.recentScoreChange || !!input.recentRedCard
}

/** Is the pressure just a losing side naturally chasing the game? */
function isScoreEffect(input: MomentumNoiseInput): boolean {
  const h = input.scoreHome ?? 0
  const a = input.scoreAway ?? 0
  if (h === a) return false
  const losingSide = h < a ? 'home' : 'away'
  return input.pressureSide === losingSide && !detectEventDrivenMomentum(input)
}

export function classifyPressureShift(input: MomentumNoiseInput): MomentumNoiseCategory {
  if (input.freshness === 'stale') return 'stale_snapshot_noise'
  if (detectEventDrivenMomentum(input)) return 'event_driven_pressure'
  if (detectSustainedPressure(input)) return 'sustained_pressure'
  if (isScoreEffect(input)) return 'score_effect_noise'
  if (detectFalsePressureSpike(input)) return 'low_sample_noise'
  if (!input.hasStats && !input.hasTimeline) return 'normal_match_variance'
  return 'unknown'
}

export function detectMomentumNoise(input: MomentumNoiseInput): MomentumNoiseAssessment {
  const category = classifyPressureShift(input)
  const reasons: string[] = []
  const limitations: string[] = []
  let isLikelyNoise = false
  let evidenceStrength: LiveFirstSignalEvidenceStrength = 'unknown'

  switch (category) {
    case 'event_driven_pressure':
      reasons.push('Pressure follows a concrete event (goal/red card).')
      evidenceStrength = 'strong'
      break
    case 'sustained_pressure':
      reasons.push('Pressure sustained across multiple snapshots with stats/timeline support.')
      evidenceStrength = 'moderate'
      break
    case 'score_effect_noise':
      reasons.push('Losing side naturally pressing; likely score-effect, not a fresh signal.')
      isLikelyNoise = true
      evidenceStrength = 'weak'
      break
    case 'stale_snapshot_noise':
      reasons.push('Snapshot is stale; pressure read is unreliable.')
      isLikelyNoise = true
      evidenceStrength = 'insufficient'
      limitations.push('Stale data; re-read when fresh.')
      break
    case 'low_sample_noise':
      reasons.push('Single-snapshot spike without supporting event; not a strong signal.')
      isLikelyNoise = true
      evidenceStrength = 'insufficient'
      break
    case 'normal_match_variance':
      reasons.push('No stats/timeline support; treat as normal match variance.')
      isLikelyNoise = true
      evidenceStrength = 'weak'
      limitations.push('Stats/timeline not available; not treated as zero.')
      break
    default:
      reasons.push('Insufficient information to classify pressure.')
      evidenceStrength = 'unknown'
  }

  return { category, isLikelyNoise, evidenceStrength, reasons, limitations }
}

export function explainMomentumNoiseDecision(assessment: MomentumNoiseAssessment): string {
  return `${assessment.category} (likelyNoise=${assessment.isLikelyNoise}, evidence=${assessment.evidenceStrength}): ${assessment.reasons.join(' ')}`
}
