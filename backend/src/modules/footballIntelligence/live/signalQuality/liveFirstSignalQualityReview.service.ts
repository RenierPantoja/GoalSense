/**
 * Live-First Signal Quality Review Runner — B68
 * ─────────────────────────────────────────────────────────────────────────────
 * Collects recent live-first signals from persisted state, grades evidence,
 * filters momentum noise, aligns with outcomes, and produces a quality summary.
 * Observe only — no calibration, no policy/threshold/score change.
 */
import { createRepositories } from '../../../../repositories/index.js'
import { gradeSignalEvidence, type SignalContext } from './liveFirstEvidenceGrading.service.js'
import { detectMomentumNoise } from './liveMomentumNoiseFilter.service.js'
import { evaluateGovernanceQuality } from './liveFirstGovernanceQualityFeedback.service.js'
import type {
  LiveFirstSignalQualityCase,
  LiveFirstSignalQualitySummary,
  LiveFirstSignalKind,
  LiveFirstSignalEvidenceStrength,
  LiveFirstSignalNoiseRisk,
  LiveFirstSignalOutcomeAlignment,
  LiveFirstSignalQualityGrade,
} from './liveFirstSignalQuality.types.js'

function noiseRiskFromEvidence(evidence: LiveFirstSignalEvidenceStrength, isNoise: boolean): LiveFirstSignalNoiseRisk {
  if (isNoise) return 'high'
  if (evidence === 'strong') return 'low'
  if (evidence === 'moderate') return 'medium'
  if (evidence === 'weak') return 'medium'
  if (evidence === 'insufficient') return 'high'
  return 'unknown'
}

/** Derive the final quality grade from evidence + noise + outcome alignment. */
export function deriveQualityGrade(
  evidence: LiveFirstSignalEvidenceStrength,
  noiseRisk: LiveFirstSignalNoiseRisk,
  alignment: LiveFirstSignalOutcomeAlignment,
): LiveFirstSignalQualityGrade {
  if (alignment === 'pending' || alignment === 'not_evaluable' || alignment === 'unknown') {
    if (evidence === 'insufficient') return 'insufficient_data'
    return 'pending_more_sample'
  }
  if (alignment === 'contradicted' && (evidence === 'strong' || evidence === 'moderate')) {
    return 'misleading_candidate'
  }
  if (evidence === 'insufficient') return 'insufficient_data'
  if (noiseRisk === 'high') return 'noisy_monitor_only'
  if (evidence === 'strong' && alignment === 'aligned') return 'reliable_observe'
  if (evidence === 'moderate' || alignment === 'partially_aligned') return 'useful_but_limited'
  if (evidence === 'weak') return 'noisy_monitor_only'
  return 'useful_but_limited'
}

/** Map an outcome record's classification into outcome alignment for a signal. */
function alignmentFromOutcome(outcome: any | null): LiveFirstSignalOutcomeAlignment {
  if (!outcome) return 'pending'
  if (outcome.evaluable === false) return 'not_evaluable'
  const cls = String(outcome.outcome || outcome.classification || '').toLowerCase()
  if (cls.includes('correct')) return 'aligned'
  if (cls.includes('limited')) return 'partially_aligned'
  if (cls.includes('changed_game') || cls.includes('insufficient')) return 'not_evaluable'
  return 'pending'
}

interface CollectedSignal {
  fixtureId: string
  sessionId: string
  workerRunId?: string | null
  signalKind: LiveFirstSignalKind
  source: LiveFirstSignalQualityCase['source']
  matchMinute?: number | null
  scoreState?: { home: number; away: number } | null
  context: SignalContext
  signalTimestamp: string
}

/**
 * Collect recent live-first signals from fixture states + post-match outcomes.
 * Never invents events; only derives signals from persisted facts.
 */
export async function collectRecentLiveFirstSignals(limit = 200): Promise<{ signals: CollectedSignal[]; outcomesByFixture: Map<string, any> }> {
  const repos = createRepositories()
  const [sessions, outcomes] = await Promise.all([
    repos.intelligence.listLiveMonitoringSessions(50).catch(() => []),
    repos.intelligence.listLiveFirstPostMatchOutcomes(200).catch(() => []),
  ])
  const outcomesByFixture = new Map<string, any>()
  for (const o of outcomes) outcomesByFixture.set(o.fixtureId, o)

  const signals: CollectedSignal[] = []
  for (const session of sessions.slice(0, 50)) {
    const states = await repos.intelligence.listLiveMonitoringFixtureStates(session.id, 50).catch(() => [])
    for (const st of states) {
      const score = st.lastScore || null
      const fresh = st.freshness === 'stale' ? 'stale' : st.freshness === 'fresh' ? 'fresh' : 'unknown'
      const baseCtx: SignalContext = {
        freshness: fresh as any,
        snapshotCount: st.snapshotCount ?? 0,
        scoreChanged: (score && (score.home > 0 || score.away > 0)) || false,
        hasTimeline: (st.eventsDetected ?? 0) > 0,
        hasBoxscore: false,
        hasPossession: false,
        hasShots: false,
        explicitEvent: (st.eventsDetected ?? 0) > 0,
        dataQuality: 'partial',
      }
      // Derive a fulltime_resolution signal when the fixture completed.
      if (st.completed && (st.lastStatus === 'FT' || st.lastStatus === 'AET' || st.lastStatus === 'PEN')) {
        signals.push({
          fixtureId: st.fixtureId, sessionId: session.id, workerRunId: null,
          signalKind: 'fulltime_resolution', source: 'status',
          matchMinute: st.lastMinute ?? null, scoreState: score,
          context: { ...baseCtx }, signalTimestamp: st.updatedAt || new Date().toISOString(),
        })
      }
      // Derive a score_shift signal when a goal is present.
      if (score && (score.home > 0 || score.away > 0)) {
        signals.push({
          fixtureId: st.fixtureId, sessionId: session.id, workerRunId: null,
          signalKind: 'score_shift', source: 'scoreboard',
          matchMinute: st.lastMinute ?? null, scoreState: score,
          context: { ...baseCtx, scoreChanged: true }, signalTimestamp: st.updatedAt || new Date().toISOString(),
        })
      }
      // Derive a pressure_shift signal candidate (to be graded/noise-filtered).
      signals.push({
        fixtureId: st.fixtureId, sessionId: session.id, workerRunId: null,
        signalKind: 'pressure_shift', source: 'derived',
        matchMinute: st.lastMinute ?? null, scoreState: score,
        context: { ...baseCtx }, signalTimestamp: st.updatedAt || new Date().toISOString(),
      })
      if (signals.length >= limit) break
    }
    if (signals.length >= limit) break
  }
  return { signals, outcomesByFixture }
}

export async function buildSignalQualityCases(): Promise<LiveFirstSignalQualityCase[]> {
  const { signals, outcomesByFixture } = await collectRecentLiveFirstSignals()
  const cases: LiveFirstSignalQualityCase[] = []

  for (const sig of signals) {
    const grade = gradeSignalEvidence(sig.signalKind, sig.context)
    const outcome = outcomesByFixture.get(sig.fixtureId) || null
    const alignment = alignmentFromOutcome(outcome)

    let isNoise = false
    const limitations: string[] = []
    if (sig.signalKind === 'pressure_shift') {
      const noise = detectMomentumNoise({
        snapshotCount: sig.context.snapshotCount,
        minute: sig.matchMinute,
        scoreHome: sig.scoreState?.home,
        scoreAway: sig.scoreState?.away,
        hasStats: sig.context.hasShots || sig.context.hasPossession,
        hasTimeline: sig.context.hasTimeline,
        freshness: sig.context.freshness,
      })
      isNoise = noise.isLikelyNoise
      limitations.push(...noise.limitations)
    }

    const noiseRisk = noiseRiskFromEvidence(grade.evidenceStrength, isNoise)
    const qualityGrade = deriveQualityGrade(grade.evidenceStrength, noiseRisk, alignment)
    const hadMissingContext = grade.missingEvidence.length > 0

    cases.push({
      id: `sqc_${sig.fixtureId}_${sig.signalKind}_${new Date(sig.signalTimestamp).getTime()}`,
      fixtureId: sig.fixtureId,
      sessionId: sig.sessionId,
      workerRunId: sig.workerRunId ?? null,
      signalKind: sig.signalKind,
      signalTimestamp: sig.signalTimestamp,
      matchMinute: sig.matchMinute ?? null,
      scoreState: sig.scoreState ?? null,
      source: sig.source,
      evidenceStrength: grade.evidenceStrength,
      noiseRisk,
      outcomeAlignment: alignment,
      qualityGrade,
      supportingEvidence: grade.supportingEvidence,
      missingEvidence: grade.missingEvidence,
      limitations: [
        ...limitations,
        ...(hadMissingContext ? ['Some evidence missing; not treated as zero.'] : []),
        'Observe only; no calibration applied.',
      ],
      createdAt: new Date().toISOString(),
    })
  }
  return cases
}

export function buildSignalQualitySummary(cases: LiveFirstSignalQualityCase[]): LiveFirstSignalQualitySummary {
  const count = (g: LiveFirstSignalQualityGrade) => cases.filter(c => c.qualityGrade === g).length
  const byKind = (filter: (c: LiveFirstSignalQualityCase) => boolean) => {
    const m = new Map<LiveFirstSignalKind, number>()
    cases.filter(filter).forEach(c => m.set(c.signalKind, (m.get(c.signalKind) || 0) + 1))
    return Array.from(m.entries()).map(([signalKind, c]) => ({ signalKind, count: c })).sort((a, b) => b.count - a.count).slice(0, 5)
  }

  const recommendations: string[] = []
  if (count('misleading_candidate') > 0) recommendations.push('Human review: misleading candidates detected — do NOT auto-adjust thresholds.')
  if (count('noisy_monitor_only') > 0) recommendations.push('Keep noisy signals monitor-only until more sample accumulates.')
  if (cases.length < 20) recommendations.push('Sample size still small; defer threshold studies.')

  return {
    id: `sqr_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    sampleSize: cases.length,
    signalsReviewed: cases.length,
    reliableObserve: count('reliable_observe'),
    usefulButLimited: count('useful_but_limited'),
    noisyMonitorOnly: count('noisy_monitor_only'),
    insufficientData: count('insufficient_data'),
    misleadingCandidate: count('misleading_candidate'),
    pendingMoreSample: count('pending_more_sample'),
    topUsefulSignals: byKind(c => c.qualityGrade === 'reliable_observe' || c.qualityGrade === 'useful_but_limited'),
    topNoisySignals: byKind(c => c.qualityGrade === 'noisy_monitor_only' || c.noiseRisk === 'high'),
    momentumNoiseFindings: cases.filter(c => c.signalKind === 'pressure_shift' && c.noiseRisk === 'high').map(c => `${c.fixtureId}: pressure noise (${c.evidenceStrength})`).slice(0, 10),
    governanceQualityFeedback: [],
    recommendations,
    limitations: [
      'Observe only: thresholds, policy, and score are never auto-adjusted.',
      'Momentum is a qualitative read, not a numeric likelihood; alignment is not an accuracy promise.',
      'not_evaluable / unknown are reported separately from failure.',
    ],
  }
}

export async function alignSignalsWithOutcomes(cases: LiveFirstSignalQualityCase[]) {
  // Alignment is already computed per-case in buildSignalQualityCases; this helper
  // exposes a fixture→alignment view for callers/tests.
  const m = new Map<string, LiveFirstSignalOutcomeAlignment>()
  for (const c of cases) m.set(c.fixtureId, c.outcomeAlignment)
  return m
}

export async function gradeSignalQuality() {
  return buildSignalQualityCases()
}

export async function saveSignalQualityReview(): Promise<LiveFirstSignalQualitySummary> {
  const repos = createRepositories()
  const cases = await buildSignalQualityCases()

  // Governance quality feedback (observe only) per evaluable fixture.
  const govFeedback: string[] = []
  const seen = new Set<string>()
  for (const c of cases) {
    if (seen.has(c.fixtureId)) continue
    seen.add(c.fixtureId)
    const fb = evaluateGovernanceQuality({
      fixtureId: c.fixtureId,
      governanceAction: 'observe',
      evidenceStrength: c.evidenceStrength,
      outcomeAlignment: c.outcomeAlignment,
      hadMissingContext: c.missingEvidence.length > 0,
    })
    if (fb.feedback !== 'appropriate') govFeedback.push(`${c.fixtureId}: ${fb.feedback}`)
  }

  const summary = buildSignalQualitySummary(cases)
  summary.governanceQualityFeedback = govFeedback.slice(0, 20)

  for (const c of cases.slice(0, 200)) await repos.intelligence.saveLiveFirstSignalQualityCase(c).catch(() => {})
  await repos.intelligence.saveLiveFirstSignalQualityReview(summary).catch(() => {})

  // B69: publish sanitized public snapshot so the hosted control plane can read it.
  try {
    const { publishPublicControlPlaneSnapshot } = await import('../../../controlPlane/controlPlanePublicReadModel.service.js')
    await publishPublicControlPlaneSnapshot({ force: true })
  } catch { /* non-fatal: review is still persisted */ }

  return summary
}
