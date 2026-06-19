/**
 * Auto Engine calibration (Phase B24) — PURE, env-free, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the Auto Engine learning profile from joined promoted-alert outcomes.
 * No persistence, no side effects, no ML, no probability. Conservative, cautious
 * language; small samples never produce strong claims. `unknown` ≠ failure;
 * `confirmed_partial` is partial-useful; opportunity score is NEVER rewritten.
 */
import type { OpportunityType } from '../autoEngine.types.js'
import type { SampleQuality, OutcomeDistribution } from '../../contracts/learning.types.js'
import type { Confidence } from '../../contracts/intelligence.types.js'
import type {
  JoinedPromotedOutcome, AutoEngineLearningProfile, AutoOpportunityTypeProfile,
  AutoScoreCalibrationProfile, AutoScoreCalibrationBucket, ScoreBucketLabel,
  AutoRiskGateProfile, AutoDataQualityProfile, AutoContextProfileSample,
  AutoEngineLearningRecommendation, RiskGateInterpretation,
} from '../autoEngineLearning.types.js'
import {
  newDistribution, addResult, resolvedCount, usefulCount, usefulRate, failedRate,
  unknownRate, sampleQualityOf, avg,
} from '../../learning/learningStats.util.js'
import { minuteWindowOf, minuteWindowLabel } from '../../learning/minuteWindow.util.js'

const SCORE_BUCKETS: { label: ScoreBucketLabel; min: number; max: number }[] = [
  { label: '0-20', min: 0, max: 20 },
  { label: '21-40', min: 21, max: 40 },
  { label: '41-60', min: 41, max: 60 },
  { label: '61-80', min: 61, max: 80 },
  { label: '81-100', min: 81, max: 100 },
]

const DATA_INTEGRITY_BLOCKERS = new Set(['data_poor', 'missing_required_data', 'too_much_unknown', 'provider_stale'])

export function scoreBucketOf(score: number): ScoreBucketLabel {
  const s = Math.max(0, Math.min(100, Math.round(score)))
  for (const b of SCORE_BUCKETS) if (s >= b.min && s <= b.max) return b.label
  return '81-100'
}

export function strengthFromSample(q: SampleQuality): Confidence {
  if (q === 'strong') return 'high'
  if (q === 'moderate') return 'medium'
  return 'low'
}

function pctText(r: number | null): string { return r == null ? '—' : `${Math.round(r * 100)}%` }

interface Acc {
  dist: OutcomeDistribution
  scoreSum: number; scoreN: number
  origSum: number; origN: number
  ttrSum: number; ttrN: number
}
function newAcc(): Acc { return { dist: newDistribution(), scoreSum: 0, scoreN: 0, origSum: 0, origN: 0, ttrSum: 0, ttrN: 0 } }
function accAdd(a: Acc, r: JoinedPromotedOutcome): void {
  addResult(a.dist, r.result)
  if (Number.isFinite(r.score)) { a.scoreSum += r.score; a.scoreN++ }
  if (Number.isFinite(r.originalScore)) { a.origSum += r.originalScore; a.origN++ }
  if (r.timeToResolutionMinutes != null) { a.ttrSum += r.timeToResolutionMinutes; a.ttrN++ }
}

function sampleFrom(key: string, label: string, dist: OutcomeDistribution): AutoContextProfileSample {
  const resolved = resolvedCount(dist)
  return { key, label, sampleSize: dist.total, usefulRate: usefulRate(dist), unknownRate: unknownRate(dist), sampleQuality: sampleQualityOf(resolved) }
}
function topReasons(counter: Map<string, number>, n = 5): { reason: string; count: number }[] {
  return [...counter.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, n)
}
function bump(counter: Map<string, number>, key: string | null | undefined): void {
  if (!key) return
  counter.set(key, (counter.get(key) || 0) + 1)
}

export interface BuildProfileInput {
  id: string
  generatedAt: string
  joined: JoinedPromotedOutcome[]
  promotedAlertsTotal: number
  /** blockReason → count among scanned BLOCKED opportunities (risk-gate observation only). */
  blockedReasonCounts: Record<string, number>
}

export function buildAutoEngineLearningProfile(input: BuildProfileInput): AutoEngineLearningProfile {
  const { joined } = input
  const overall = newAcc()

  const byType = new Map<OpportunityType, { acc: Acc; byWindow: Map<string, OutcomeDistribution>; warnings: Map<string, number>; unknownReasons: Map<string, number> }>()
  const byBucket = new Map<ScoreBucketLabel, OutcomeDistribution>()
  const byDataQuality = new Map<string, OutcomeDistribution>()
  const byLeague = new Map<string, OutcomeDistribution>()
  const byTeam = new Map<string, OutcomeDistribution>()
  const byWindow = new Map<string, OutcomeDistribution>()

  const distOf = (m: Map<string, OutcomeDistribution>, k: string) => { let d = m.get(k); if (!d) { d = newDistribution(); m.set(k, d) } return d }

  for (const r of joined) {
    accAdd(overall, r)

    let t = byType.get(r.opportunityType)
    if (!t) { t = { acc: newAcc(), byWindow: new Map(), warnings: new Map(), unknownReasons: new Map() }; byType.set(r.opportunityType, t) }
    accAdd(t.acc, r)
    const win = minuteWindowOf(r.minute, null)
    addResult(distOf(t.byWindow, win), r.result)
    for (const w of r.warnings) bump(t.warnings, w)
    if (r.result === 'unknown' || r.result === 'expired') bump(t.unknownReasons, r.unknownReason || 'sem dados pós-promoção')

    addResult(distOf(byBucket, scoreBucketOf(r.score)), r.result)
    addResult(distOf(byDataQuality, r.dataQuality || 'unknown'), r.result)
    addResult(distOf(byLeague, r.league || 'unknown'), r.result)
    addResult(distOf(byTeam, r.homeTeam || 'unknown'), r.result)
    addResult(distOf(byTeam, r.awayTeam || 'unknown'), r.result)
    addResult(distOf(byWindow, win), r.result)
  }

  const overallResolved = resolvedCount(overall.dist)
  const overallQuality = sampleQualityOf(overallResolved)
  const recommendations: AutoEngineLearningRecommendation[] = []
  const pushRec = (type: AutoEngineLearningRecommendation['type'], scopeKey: string, message: string, strength: Confidence, sampleSize: number, context: string, sampleQuality: SampleQuality) => {
    recommendations.push({ id: `aer_${type}_${scopeKey}`.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 120), type, scopeKey, message, strength, evidence: { sampleSize, context, sampleQuality }, createdAt: input.generatedAt })
  }

  // ── Opportunity type profiles ──
  const opportunityTypeProfiles: AutoOpportunityTypeProfile[] = []
  for (const [type, t] of byType) {
    const d = t.acc.dist
    const resolved = resolvedCount(d)
    const q = sampleQualityOf(resolved)
    const ur = usefulRate(d), unr = unknownRate(d)
    const windows = [...t.byWindow.entries()].map(([k, dist]) => sampleFrom(k, minuteWindowLabel(k as any), dist))
    const best = windows.filter(w => (w.usefulRate ?? -1) >= 0).sort((a, b) => (b.usefulRate ?? -1) - (a.usefulRate ?? -1)).slice(0, 3)
    const weak = windows.filter(w => (w.unknownRate ?? -1) >= 0).sort((a, b) => (b.unknownRate ?? -1) - (a.unknownRate ?? -1)).slice(0, 3)
    opportunityTypeProfiles.push({
      opportunityType: type, sampleSize: d.total,
      confirmed: d.confirmed, confirmedPartial: d.confirmedPartial, failed: d.failed, unknown: d.unknown + d.expired,
      usefulRate: ur, failedRate: failedRate(d), unknownRate: unr,
      avgScore: avg(t.acc.scoreSum, t.acc.scoreN), avgOriginalScore: avg(t.acc.origSum, t.acc.origN),
      avgTimeToResolutionMinutes: avg(t.acc.ttrSum, t.acc.ttrN),
      bestMinuteWindows: best, weakMinuteWindows: weak,
      topBlockReasonsBeforePromotion: topReasons(t.warnings),
      topUnknownReasons: topReasons(t.unknownReasons),
      sampleQuality: q, recommendationStrength: strengthFromSample(q),
    })
    if (q === 'insufficient') {
      pushRec('insufficient_sample', `type_${type}`, `${type}: amostra ainda insuficiente (${resolved} resolvidos) — trate como indício inicial, não conclusão.`, 'low', resolved, `opportunityType ${type}`, q)
    } else {
      if (ur != null && ur >= 0.5) pushRec('opportunity_type_positive_signal', `type_${type}`, `${type} apresenta indícios positivos (${pctText(ur)} úteis em ${resolved} resolvidos). Ainda observacional — não é taxa de acerto garantida.`, strengthFromSample(q), resolved, `opportunityType ${type}`, q)
      if (unr != null && unr >= 0.4) pushRec('opportunity_type_high_unknown', `type_${type}`, `${type} tem unknown alto (${pctText(unr)}) — frequentemente faltam dados pós-promoção. unknown não é falha.`, strengthFromSample(q), resolved, `opportunityType ${type}`, q)
    }
  }
  opportunityTypeProfiles.sort((a, b) => b.sampleSize - a.sampleSize)

  // ── Score calibration ──
  const buckets: AutoScoreCalibrationBucket[] = SCORE_BUCKETS.map(b => {
    const d = byBucket.get(b.label) || newDistribution()
    const resolved = resolvedCount(d)
    const ur = usefulRate(d), unr = unknownRate(d)
    let note: string
    if (resolved < 5) {
      note = `Amostra insuficiente (${resolved} resolvidos) — não tratar como banda forte.`
      if (resolved > 0) pushRec('score_bucket_insufficient_sample', `bucket_${b.label}`, `Score ${b.label}: amostra insuficiente (${resolved}). Não tratar como banda confiável ainda.`, 'low', resolved, `score bucket ${b.label}`, sampleQualityOf(resolved))
    } else {
      note = `${pctText(ur)} úteis · ${pctText(unr)} unknown em ${resolved} resolvidos (qualidade de sinal, não probabilidade).`
      if (b.min >= 61 && ur != null && ur < 0.4) {
        note += ' Possível superestimação desta banda.'
        pushRec('score_bucket_overestimating_possible', `bucket_${b.label}`, `Score ${b.label} pode estar superestimando: só ${pctText(ur)} úteis em ${resolved} resolvidos.`, strengthFromSample(sampleQualityOf(resolved)), resolved, `score bucket ${b.label}`, sampleQualityOf(resolved))
      }
    }
    return { label: b.label, minScore: b.min, maxScore: b.max, sampleSize: resolved, usefulRate: ur, failedRate: failedRate(d), unknownRate: unr, calibrationNote: note }
  })
  const scoreCalibration: AutoScoreCalibrationProfile = {
    buckets,
    overallNote: overallResolved < 5
      ? 'Calibração de score ainda não confiável — amostra global insuficiente.'
      : 'Calibração observacional sobre alertas promovidos resolvidos. Score é qualidade de sinal, nunca probabilidade garantida.',
  }

  // ── Data quality profiles ──
  const dataQualityProfile: AutoDataQualityProfile[] = [...byDataQuality.entries()].map(([dq, d]) => {
    const resolved = resolvedCount(d)
    const unr = unknownRate(d)
    let note = `${pctText(usefulRate(d))} úteis · ${pctText(unr)} unknown em ${resolved} resolvidos.`
    if (dq === 'partial' && unr != null && unr >= 0.4) {
      note += ' Dados parciais elevam unknown.'
      pushRec('data_quality_limitation', `dq_${dq}`, `Dados "${dq}" elevam unknown (${pctText(unr)}). Considere manter conservador.`, strengthFromSample(sampleQualityOf(resolved)), resolved, `dataQuality ${dq}`, sampleQualityOf(resolved))
    }
    return { dataQuality: dq, sampleSize: resolved, usefulRate: usefulRate(d), failedRate: failedRate(d), unknownRate: unr, note }
  }).sort((a, b) => b.sampleSize - a.sampleSize)
  // Static, always-true limitation about poor data (poor opps are blocked, never promoted).
  pushRec('data_quality_limitation', 'dq_poor_static', 'Oportunidades com dataQuality "poor" devem permanecer bloqueadas (nunca promovidas).', 'medium', 0, 'dataQuality poor policy', 'insufficient')

  // ── Risk gate profiles (blocked-reason frequency; blocked opps have no outcome) ──
  const riskGateProfile: AutoRiskGateProfile[] = Object.entries(input.blockedReasonCounts).map(([reason, count]) => {
    const interpretation: RiskGateInterpretation = DATA_INTEGRITY_BLOCKERS.has(reason) ? 'useful_blocker' : 'insufficient_sample'
    const note = interpretation === 'useful_blocker'
      ? 'Bloqueio de integridade de dados — trate como correto (oportunidade não tinha base para virar alerta).'
      : 'Bloqueios não geram outcome (nunca foram promovidos), então não há como medir acerto — apenas frequência.'
    if (interpretation === 'useful_blocker' && count > 0) {
      pushRec('risk_gate_observation', `gate_${reason}`, `Risk gate "${reason}" bloqueou ${count}× — bloqueio de dados considerado útil; mantenha conservador.`, 'medium', count, `blockReason ${reason}`, 'low')
    }
    return { blockReason: reason, timesSeen: count, laterPromotedCount: 0, promotedUsefulRate: null, promotedUnknownRate: null, interpretation, note }
  }).sort((a, b) => b.timesSeen - a.timesSeen)

  // ── Context samples ──
  const leagueProfiles = [...byLeague.entries()].map(([k, d]) => sampleFrom(k, k, d)).sort((a, b) => b.sampleSize - a.sampleSize).slice(0, 20)
  const teamProfiles = [...byTeam.entries()].map(([k, d]) => sampleFrom(k, k, d)).sort((a, b) => b.sampleSize - a.sampleSize).slice(0, 20)
  const minuteWindowProfiles = [...byWindow.entries()].map(([k, d]) => sampleFrom(k, minuteWindowLabel(k as any), d)).sort((a, b) => b.sampleSize - a.sampleSize)

  const limitations: string[] = [
    'Aprendizado observacional sobre alertas promovidos manualmente — não autoajusta o motor.',
    'Score é qualidade de sinal, não probabilidade garantida; rates não são promessa de acerto.',
    'unknown nunca é falha; confirmed_partial é útil parcial.',
    'Bloqueios do risk gate não têm outcome (nunca promovidos) — só frequência é observável.',
  ]
  if (overallResolved < 5) limitations.push('Amostra global insuficiente — recomendações fortes não são possíveis ainda.')
  if (joined.length === 0) limitations.push('Nenhum alerta promovido resolvido ainda — perfil vazio honesto.')

  return {
    id: input.id, generatedAt: input.generatedAt, source: 'auto_engine_promoted_alerts',
    sampleSize: overallResolved, promotedAlertsTotal: input.promotedAlertsTotal,
    confirmed: overall.dist.confirmed, confirmedPartial: overall.dist.confirmedPartial,
    failed: overall.dist.failed, unknown: overall.dist.unknown, expired: overall.dist.expired,
    usefulRate: usefulRate(overall.dist), failedRate: failedRate(overall.dist), unknownRate: unknownRate(overall.dist),
    sampleQuality: overallQuality,
    opportunityTypeProfiles, scoreCalibration, riskGateProfile, dataQualityProfile,
    leagueProfiles, teamProfiles, minuteWindowProfiles, recommendations, limitations,
  }
}
