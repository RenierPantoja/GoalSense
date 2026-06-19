/**
 * Promotion plan builder (Phase B21) — PURE, env-free, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts REAL opportunity evidence into editable radar suggestions. Never saves
 * a pattern, never invents a condition. `sufficient:false` when there is no
 * evidence beyond `is_live`.
 */
import type { AutoOpportunity, AutoOpportunityPromotionPlan, SuggestedRadarCondition } from '../autoEngine.types.js'

const SUPPORTED = new Set([
  'is_live', 'minute_between', 'is_final_phase', 'score_tied', 'score_diff_lte',
  'goals_total_gte', 'goals_total_lte', 'possession_gte', 'home_possession_gte',
  'away_possession_gte', 'shots_on_target_gte', 'home_shots_on_target_gte',
  'away_shots_on_target_gte', 'shots_total_gte', 'shots_recent_gte', 'home_goals_gte', 'away_goals_gte',
])
const PARTIAL = new Set(['corners_gte', 'home_corners_gte', 'away_corners_gte', 'cards_gte', 'yellow_cards_gte', 'red_cards_gte', 'favorite_involved'])

function stat(opp: AutoOpportunity, key: string): number | null {
  const v = opp.evidence?.liveStatsUsed?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)) }

export function buildPromotionPlan(opp: AutoOpportunity, now = new Date().toISOString()): AutoOpportunityPromotionPlan {
  const eligibility: SuggestedRadarCondition[] = [{ type: 'is_live', params: {} }]
  const signals: SuggestedRadarCondition[] = []
  const limitations: string[] = []
  const evidence: string[] = []

  const diff = Math.abs((opp.scoreState?.home ?? 0) - (opp.scoreState?.away ?? 0))
  const sotTotal = (stat(opp, 'shotsOnTargetHome') ?? 0) + (stat(opp, 'shotsOnTargetAway') ?? 0)
  const cornersTotal = (stat(opp, 'cornersHome') ?? 0) + (stat(opp, 'cornersAway') ?? 0)
  const cardsTotal = (stat(opp, 'yellowCardsHome') ?? 0) + (stat(opp, 'yellowCardsAway') ?? 0) + (stat(opp, 'redCardsHome') ?? 0) + (stat(opp, 'redCardsAway') ?? 0)
  const possHome = stat(opp, 'possessionHome')
  const possAway = stat(opp, 'possessionAway')

  switch (opp.opportunityType) {
    case 'late_goal_pressure':
      eligibility.push({ type: 'is_final_phase', params: {} })
      signals.push({ type: 'score_diff_lte', params: { maxDiff: Math.max(1, diff) } })
      if (sotTotal > 0) signals.push({ type: 'shots_on_target_gte', params: { value: Math.max(3, Math.round(sotTotal)) } })
      break
    case 'first_half_goal_pressure':
      eligibility.push({ type: 'minute_between', params: { min: 25, max: 45 } })
      signals.push({ type: 'score_diff_lte', params: { maxDiff: Math.max(1, diff) } })
      if (sotTotal > 0) signals.push({ type: 'shots_on_target_gte', params: { value: Math.max(3, Math.round(sotTotal)) } })
      break
    case 'corners_pressure':
      if (cornersTotal > 0) { signals.push({ type: 'corners_gte', params: { value: Math.max(6, Math.round(cornersTotal)) } }); limitations.push('Escanteios têm cobertura variável por provedor.') }
      break
    case 'cards_pressure':
      if (cardsTotal > 0) { signals.push({ type: 'cards_gte', params: { value: Math.max(4, Math.round(cardsTotal)) } }); limitations.push('Cartões têm cobertura variável por provedor.') }
      break
    case 'dominant_home_pressure':
      if (possHome != null) signals.push({ type: 'home_possession_gte', params: { value: clamp(Math.round(possHome), 50, 75) } })
      if ((stat(opp, 'shotsOnTargetHome') ?? 0) > 0) signals.push({ type: 'home_shots_on_target_gte', params: { value: Math.max(3, Math.round(stat(opp, 'shotsOnTargetHome') ?? 3)) } })
      break
    case 'dominant_away_pressure':
      if (possAway != null) signals.push({ type: 'away_possession_gte', params: { value: clamp(Math.round(possAway), 50, 75) } })
      if ((stat(opp, 'shotsOnTargetAway') ?? 0) > 0) signals.push({ type: 'away_shots_on_target_gte', params: { value: Math.max(3, Math.round(stat(opp, 'shotsOnTargetAway') ?? 3)) } })
      break
    default:
      limitations.push('Tipo de oportunidade sem mapeamento direto para condições de radar.')
  }

  if (opp.contextFit?.source === 'heuristic') limitations.push('Contexto da competição é heurístico (derivado do nome) — revise o escopo.')
  if (opp.contextFit?.source === 'limited' || opp.contextFit?.sampleQuality === 'insufficient') limitations.push('Amostra histórica insuficiente — trate como ponto de partida, não como padrão validado.')
  for (const s of (opp.evidence?.passedSignals ?? []).slice(0, 4)) evidence.push(s)
  if (opp.evidence?.dataQuality) evidence.push(`Qualidade dos dados: ${opp.evidence.dataQuality}`)

  const sufficient = signals.length > 0
  if (!sufficient) limitations.unshift('Oportunidade não possui evidência suficiente para gerar radar.')

  for (const c of [...eligibility, ...signals]) {
    if (!SUPPORTED.has(c.type) && !PARTIAL.has(c.type)) limitations.push(`Condição "${c.type}" pode não ser executável pelo motor — revise.`)
  }

  return {
    id: `apl_${opp.id}`,
    opportunityId: opp.id,
    fixtureId: opp.fixtureId,
    sufficient,
    suggestedRadarName: `Auto · ${opp.explanation?.headline || opp.opportunityType}`.slice(0, 80),
    suggestedDescription: `Proposta gerada a partir de uma oportunidade automática em ${opp.fixtureLabel} (${opp.leagueName}). Score de qualidade ${opp.score}. Revise e ajuste antes de salvar.`,
    suggestedScope: 'all',
    suggestedEligibilityConditions: eligibility,
    suggestedSignalConditions: signals,
    suggestedAction: 'register_alert',
    suggestedConfidence: clamp(Math.round(opp.score), 50, 75),
    sourceEvidence: evidence,
    limitations,
    createdAt: now,
  }
}
