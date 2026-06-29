/**
 * Live-First Evidence Grading — B68
 * ─────────────────────────────────────────────────────────────────────────────
 * Grades the evidence strength behind a live-first signal. Never treats missing
 * data as zero; missing data becomes `missingEvidence`. Stale snapshots weaken
 * evidence. Observe only.
 */
import type {
  LiveFirstSignalKind,
  LiveFirstSignalEvidenceStrength,
} from './liveFirstSignalQuality.types.js'

export interface SignalContext {
  snapshotAgeSeconds?: number | null
  freshness?: 'fresh' | 'slightly_stale' | 'stale' | 'unknown'
  hasTimeline?: boolean
  hasBoxscore?: boolean
  hasPossession?: boolean
  hasShots?: boolean
  scoreChanged?: boolean
  explicitEvent?: boolean // a concrete keyEvent (goal/card) backs the signal
  snapshotCount?: number // how many snapshots support a sustained read
  dataQuality?: 'rich' | 'partial' | 'poor' | 'unknown'
}

export interface EvidenceGradeResult {
  evidenceStrength: LiveFirstSignalEvidenceStrength
  supportingEvidence: string[]
  missingEvidence: string[]
  explanation: string
}

const STALE_THRESHOLD_SECONDS = 180

export function gradeSnapshotFreshness(ctx: SignalContext): { fresh: boolean; reason: string } {
  if (ctx.freshness === 'stale') return { fresh: false, reason: 'snapshot marked stale' }
  if (typeof ctx.snapshotAgeSeconds === 'number' && ctx.snapshotAgeSeconds > STALE_THRESHOLD_SECONDS) {
    return { fresh: false, reason: `snapshot age ${ctx.snapshotAgeSeconds}s exceeds ${STALE_THRESHOLD_SECONDS}s` }
  }
  return { fresh: true, reason: 'snapshot within freshness window' }
}

export function gradeTimelineSupport(kind: LiveFirstSignalKind, ctx: SignalContext): boolean {
  if (!ctx.hasTimeline) return false
  return ['red_card_shift', 'timeline_event_cluster', 'late_goal', 'score_shift'].includes(kind)
}

export function gradeStatsSupport(kind: LiveFirstSignalKind, ctx: SignalContext): boolean {
  if (kind === 'possession_shift') return !!ctx.hasPossession
  if (kind === 'shots_shift' || kind === 'dangerous_attack_shift') return !!ctx.hasShots
  return !!ctx.hasBoxscore
}

export function gradeScoreboardSupport(kind: LiveFirstSignalKind, ctx: SignalContext): boolean {
  return ['score_shift', 'late_goal', 'fulltime_resolution', 'halftime_state'].includes(kind)
}

export function identifyMissingEvidence(kind: LiveFirstSignalKind, ctx: SignalContext): string[] {
  const missing: string[] = []
  if ((kind === 'possession_shift') && !ctx.hasPossession) missing.push('possession stats not available (not treated as 0)')
  if ((kind === 'shots_shift' || kind === 'dangerous_attack_shift') && !ctx.hasShots) missing.push('shots stats not available (not treated as 0)')
  if ((kind === 'red_card_shift') && !ctx.explicitEvent) missing.push('no explicit red-card timeline event')
  if ((kind === 'timeline_event_cluster') && !ctx.hasTimeline) missing.push('timeline/keyEvents not available')
  if ((kind === 'pressure_shift') && (ctx.snapshotCount ?? 0) < 2) missing.push('only a single snapshot supports this pressure read')
  const fresh = gradeSnapshotFreshness(ctx)
  if (!fresh.fresh) missing.push(`freshness: ${fresh.reason}`)
  return missing
}

/**
 * Grade evidence for a signal given its context.
 */
export function gradeSignalEvidence(kind: LiveFirstSignalKind, ctx: SignalContext): EvidenceGradeResult {
  const supporting: string[] = []
  const missing = identifyMissingEvidence(kind, ctx)
  const fresh = gradeSnapshotFreshness(ctx)
  let strength: LiveFirstSignalEvidenceStrength

  // Factual scoreboard/status signals are strong when the score actually changed
  // or the status is authoritative.
  if (kind === 'score_shift' || kind === 'late_goal') {
    if (ctx.scoreChanged) { supporting.push('scoreboard confirms a score change'); strength = 'strong' }
    else { strength = 'weak' }
  } else if (kind === 'fulltime_resolution' || kind === 'halftime_state') {
    supporting.push('match status is authoritative (factual)')
    strength = 'strong'
  } else if (kind === 'red_card_shift') {
    if (ctx.explicitEvent) { supporting.push('explicit red-card timeline event'); strength = 'strong' }
    else { strength = 'weak' }
  } else if (kind === 'timeline_event_cluster') {
    strength = ctx.hasTimeline ? 'moderate' : 'insufficient'
    if (ctx.hasTimeline) supporting.push('timeline events present')
  } else if (kind === 'shots_shift') {
    strength = ctx.hasShots ? 'moderate' : 'insufficient'
    if (ctx.hasShots) supporting.push('shots stats present')
  } else if (kind === 'possession_shift') {
    strength = ctx.hasPossession ? 'weak' : 'insufficient'
    if (ctx.hasPossession) supporting.push('possession stats present (low standalone weight)')
  } else if (kind === 'pressure_shift') {
    const n = ctx.snapshotCount ?? 0
    if (n >= 3 && (ctx.hasShots || ctx.hasTimeline)) { supporting.push('sustained across multiple snapshots with stats/timeline'); strength = 'moderate' }
    else if (n >= 2) { supporting.push('two-snapshot support'); strength = 'weak' }
    else strength = 'insufficient'
  } else if (kind === 'dangerous_attack_shift') {
    strength = ctx.hasShots ? 'weak' : 'insufficient'
  } else if (kind === 'stale_snapshot' || kind === 'missing_context') {
    strength = 'insufficient'
  } else {
    strength = 'unknown'
  }

  // Stale snapshot weakens any non-factual signal by one tier.
  if (!fresh.fresh && strength === 'strong' && !(kind === 'fulltime_resolution' || kind === 'halftime_state')) {
    strength = 'moderate'
  } else if (!fresh.fresh && strength === 'moderate') {
    strength = 'weak'
  }

  // Poor data quality weakens derived signals.
  if (ctx.dataQuality === 'poor' && ['pressure_shift', 'possession_shift', 'shots_shift', 'dangerous_attack_shift'].includes(kind)) {
    if (strength === 'moderate') strength = 'weak'
    else if (strength === 'weak') strength = 'insufficient'
  }

  return {
    evidenceStrength: strength,
    supportingEvidence: supporting,
    missingEvidence: missing,
    explanation: buildEvidenceGradeExplanation(kind, strength, supporting, missing),
  }
}

export function buildEvidenceGradeExplanation(
  kind: LiveFirstSignalKind,
  strength: LiveFirstSignalEvidenceStrength,
  supporting: string[],
  missing: string[],
): string {
  const base = `${kind} graded ${strength}`
  const sup = supporting.length ? ` | supported by: ${supporting.join('; ')}` : ''
  const mis = missing.length ? ` | missing: ${missing.join('; ')}` : ''
  return `${base}${sup}${mis}`
}
