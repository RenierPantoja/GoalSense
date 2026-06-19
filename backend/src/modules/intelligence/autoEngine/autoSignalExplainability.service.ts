/**
 * Auto Signal Explainability (Phase B19) — honest, auditable narrative.
 * No invented H2H/injuries/odds; flags heuristic context and missing data.
 */
import type { AutoSignalExplanation, AutoSignalEvidence, AutoSignalContextFit, AutoSignalRiskGateResult, OpportunityType } from './autoEngine.types.js'

const TYPE_HEADLINE: Record<OpportunityType, string> = {
  late_goal_pressure: 'Pressão por gol na reta final',
  first_half_goal_pressure: 'Pressão por gol no primeiro tempo',
  corners_pressure: 'Pressão de escanteios',
  cards_pressure: 'Jogo quente — pressão de cartões',
  comeback_pressure: 'Pressão de virada/reação',
  dominant_home_pressure: 'Domínio do mandante',
  dominant_away_pressure: 'Domínio do visitante',
  pattern_similarity: 'Contexto parecido com um radar que vem performando',
  unknown: 'Oportunidade',
}

const BLOCK_TEXT: Record<string, string> = {
  not_live: 'a partida não está ao vivo',
  data_poor: 'os dados ao vivo são pobres/desconhecidos',
  provider_stale: 'o último snapshot está desatualizado',
  missing_required_data: 'faltam estatísticas necessárias para esta estratégia',
  sample_quality_insufficient: 'a amostra histórica é insuficiente',
  historically_weak: 'o contexto histórico é fraco',
  recent_manual_alert: 'já há um alerta manual recente neste jogo',
  duplicate_opportunity: 'já existe uma oportunidade equivalente',
  max_opportunities_per_fixture: 'o limite de oportunidades por jogo foi atingido',
  score_below_minimum: 'o score ficou abaixo do mínimo',
  too_much_unknown: 'há dados demais ausentes neste contexto',
  no_evidence: 'não há evidência ao vivo suficiente',
}

export interface ExplanationInput {
  opportunityType: OpportunityType
  minute: number | null
  scoreState: { home: number; away: number }
  evidence: AutoSignalEvidence
  contextFit: AutoSignalContextFit
  riskGate: AutoSignalRiskGateResult
  relatedPatternName: string | null
}

export function buildExplanation(i: ExplanationInput): AutoSignalExplanation {
  const m = i.minute == null ? "?'" : `${i.minute}'`
  const whyNow: string[] = []
  whyNow.push(`Aos ${m}, placar ${i.scoreState.home}–${i.scoreState.away}.`)
  if (i.evidence.recentOffensiveEvents > 0) whyNow.push(`${i.evidence.recentOffensiveEvents} evento(s) ofensivo(s) recente(s).`)
  for (const s of i.evidence.passedSignals.slice(0, 4)) whyNow.push(s)

  const evidenceUsed: string[] = []
  if (i.evidence.liveStatsUsed) for (const [k, v] of Object.entries(i.evidence.liveStatsUsed)) evidenceUsed.push(`${k}: ${v}`)
  evidenceUsed.push(`Qualidade dos dados: ${i.evidence.dataQuality}`)
  if (i.evidence.missingData.length > 0) evidenceUsed.push(`Ausentes: ${i.evidence.missingData.join(', ')}`)

  const historicalContext: string[] = []
  if (i.contextFit.matchedLearningContexts.length > 0) historicalContext.push(`Contextos históricos compatíveis: ${i.contextFit.matchedLearningContexts.join(', ')} (${i.contextFit.sampleQuality}).`)
  if (i.contextFit.source === 'heuristic') historicalContext.push('Tipo/fase da competição são heurísticos (derivados do nome).')
  if (i.contextFit.source === 'limited') historicalContext.push('Sem histórico suficiente — operando em contexto limitado.')
  for (const n of i.contextFit.notes) historicalContext.push(n)

  const risks: string[] = []
  for (const w of i.riskGate.warnings) risks.push(w)
  if (!i.riskGate.allowed) risks.push(`Bloqueado porque ${i.riskGate.blockReasons.map(r => BLOCK_TEXT[r] || r).join('; ')}.`)

  return {
    headline: TYPE_HEADLINE[i.opportunityType] || 'Oportunidade',
    whyNow,
    evidenceUsed,
    historicalContext,
    risks,
    relatedPatternNote: i.relatedPatternName ? `Padrão relacionado: ${i.relatedPatternName}.` : null,
  }
}
