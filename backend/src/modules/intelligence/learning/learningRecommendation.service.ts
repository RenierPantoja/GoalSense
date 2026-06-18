/**
 * Learning Recommendations (Phase B13) — deterministic, conservative, sample-aware.
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER auto-applies anything, NEVER alters patterns/confidence, NEVER promises
 * accuracy. Every recommendation carries its evidence (sample size, context,
 * distribution, sample quality) and is downgraded to a weak "indício inicial"
 * when the sample is small.
 */
import type { Confidence } from '../contracts/intelligence.types.js'
import type {
  PatternLearningProfile, CompetitionLearningProfile, TeamLearningProfile,
  LearningRecommendation, LearningRecommendationType, SampleQuality, OutcomeDistribution,
} from '../contracts/learning.types.js'
import { normalizeKeyPart } from './contextKey.util.js'

const HIGH_UNKNOWN = 0.4
const HIGH_FAILURE = 0.5

export function recommendationStrength(q: SampleQuality): Confidence {
  if (q === 'strong') return 'high'
  if (q === 'moderate') return 'medium'
  return 'low'
}

function rec(
  type: LearningRecommendationType,
  scopeType: LearningRecommendation['scopeType'],
  scopeKey: string,
  patternId: string | null,
  message: string,
  strength: Confidence,
  evidence: { sampleSize: number; context: string; distribution: OutcomeDistribution; sampleQuality: SampleQuality },
): LearningRecommendation {
  return {
    id: `rec_${type}_${normalizeKeyPart(scopeKey)}`.slice(0, 120),
    type, scopeType, scopeKey, patternId, message, strength, evidence,
    createdAt: new Date().toISOString(),
  }
}

/** Conservative recommendations for one pattern profile. */
export function recommendationsForPattern(p: PatternLearningProfile): LearningRecommendation[] {
  const out: LearningRecommendation[] = []
  const baseEvidence = { sampleSize: p.sampleSize, context: p.label, distribution: distOf(p), sampleQuality: p.sampleQuality }

  if (p.sampleQuality === 'insufficient') {
    out.push(rec('insufficient_sample', 'pattern', p.scopeKey, p.scopeKey,
      `Amostra ainda insuficiente para conclusões sobre "${p.radarName}" (${p.resolvedCount} resolvidos). Tratar como indício inicial.`,
      'low', baseEvidence))
    return out // nothing else is trustworthy yet
  }

  if (p.unknownRate != null && p.unknownRate >= HIGH_UNKNOWN) {
    out.push(rec('high_unknown_rate', 'pattern', p.scopeKey, p.scopeKey,
      `Taxa de "unknown" alta (${pct(p.unknownRate)}) em "${p.radarName}" indica limitação de dados do provedor, não falha do padrão.`,
      recommendationStrength(p.sampleQuality), baseEvidence))
  }

  // Strongest minute window vs the profile overall (needs a moderate+ sub-sample).
  const bestWindow = p.bestMinuteWindows.find(w => w.sampleQuality !== 'insufficient' && (w.usefulRate ?? 0) > (p.usefulRate ?? 0))
  if (bestWindow) {
    out.push(rec('adjust_minute_window_candidate', 'pattern', `${p.scopeKey}:${bestWindow.contextKey}`, p.scopeKey,
      `"${p.radarName}" tem desempenho inicial melhor em ${bestWindow.label} (${pct(bestWindow.usefulRate)} útil), porém ${qualWord(bestWindow.sampleQuality)}.`,
      recommendationStrength(bestWindow.sampleQuality),
      { sampleSize: bestWindow.sampleSize, context: bestWindow.label, distribution: distOf(p), sampleQuality: bestWindow.sampleQuality }))
  }

  // Weakest competition with high failure (candidate to review/exclude).
  const worstComp = p.worstCompetitions.find(c => c.sampleQuality !== 'insufficient' && (c.failedRate ?? 0) >= HIGH_FAILURE)
  if (worstComp) {
    out.push(rec('exclude_context_candidate', 'pattern', `${p.scopeKey}:${worstComp.contextKey}`, p.scopeKey,
      `"${p.radarName}" falha com frequência em ${worstComp.label} (${pct(worstComp.failedRate)} falhas); sugere revisar este contexto (${qualWord(worstComp.sampleQuality)}).`,
      recommendationStrength(worstComp.sampleQuality),
      { sampleSize: worstComp.sampleSize, context: worstComp.label, distribution: distOf(p), sampleQuality: worstComp.sampleQuality }))
  }

  return out
}

export function recommendationsForCompetition(c: CompetitionLearningProfile): LearningRecommendation[] {
  const out: LearningRecommendation[] = []
  if (c.sampleQuality === 'insufficient') return out
  if (c.unknownRate != null && c.unknownRate >= HIGH_UNKNOWN) {
    out.push(rec('data_quality_warning', 'competition', c.scopeKey, null,
      `Dados limitados em ${c.label}: "unknown" em ${pct(c.unknownRate)} dos sinais resolvidos (cobertura do provedor).`,
      recommendationStrength(c.sampleQuality),
      { sampleSize: c.sampleSize, context: c.label, distribution: distOf(c), sampleQuality: c.sampleQuality }))
  }
  if (c.usefulRate != null && c.usefulRate >= 0.6 && (c.sampleQuality === 'moderate' || c.sampleQuality === 'strong')) {
    out.push(rec('competition_strength_observed', 'competition', c.scopeKey, null,
      `${c.label} mostra desempenho útil observado (${pct(c.usefulRate)}), ${qualWord(c.sampleQuality)}.`,
      recommendationStrength(c.sampleQuality),
      { sampleSize: c.sampleSize, context: c.label, distribution: distOf(c), sampleQuality: c.sampleQuality }))
  }
  return out
}

export function recommendationsForTeam(t: TeamLearningProfile): LearningRecommendation[] {
  const out: LearningRecommendation[] = []
  if (t.sampleQuality === 'insufficient') return out
  if (t.homeUsefulRate != null && t.awayUsefulRate != null && Math.abs(t.homeUsefulRate - t.awayUsefulRate) >= 0.2) {
    const strongerHome = t.homeUsefulRate > t.awayUsefulRate
    out.push(rec('team_context_strength_observed', 'team', t.scopeKey, null,
      `${t.label}: sinais úteis observados com mais frequência ${strongerHome ? 'como mandante' : 'como visitante'} (${pct(strongerHome ? t.homeUsefulRate : t.awayUsefulRate)}), mas ainda requer mais amostra.`,
      recommendationStrength(t.sampleQuality),
      { sampleSize: t.sampleSize, context: t.label, distribution: distOf(t), sampleQuality: t.sampleQuality }))
  }
  return out
}

function distOf(p: { confirmedCount: number; confirmedPartialCount: number; failedCount: number; unknownCount: number; expiredCount: number; pendingCount: number; sampleSize: number }): OutcomeDistribution {
  return {
    total: p.sampleSize, pending: p.pendingCount, confirmed: p.confirmedCount,
    confirmedPartial: p.confirmedPartialCount, failed: p.failedCount, unknown: p.unknownCount, expired: p.expiredCount,
  }
}
function pct(v: number | null): string { return v == null ? '—' : `${Math.round(v * 100)}%` }
function qualWord(q: SampleQuality): string {
  return q === 'strong' ? 'amostra robusta' : q === 'moderate' ? 'amostra moderada' : q === 'low' ? 'amostra baixa' : 'amostra insuficiente'
}
