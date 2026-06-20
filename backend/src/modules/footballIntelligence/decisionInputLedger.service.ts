/**
 * Decision Input Ledger (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Records WHICH variables were considered and in which direction (positive /
 * negative / neutral / uncertain / blocking). NO final mathematical weighting in
 * this phase — only structured, explainable inputs with a qualitative weight hint
 * and honest data quality. Direction is `contextual` when it depends on pattern type.
 */
import type { MatchContextProfile } from './matchContextEngine.service.js'
import type { SquadAvailabilityProfile } from './squadAvailabilityEngine.service.js'
import type { TeamIntelligenceMemory } from './teamMemoryEngine.service.js'
import type { HeadToHeadIntelligence } from './headToHeadIntelligence.service.js'
import type { TacticalMatchupProfile } from './tacticalMatchupEngine.service.js'
import type { CanonicalAnalysisReadiness } from './footballIntelligence.types.js'

export type DecisionDirection = 'positive' | 'negative' | 'neutral' | 'uncertain' | 'blocking' | 'contextual'
export type WeightHint = 'low' | 'medium' | 'high' | 'critical' | 'unknown'

export interface DecisionInput {
  id: string
  fixtureId: string
  source: string
  variableKey: string
  variableName: string
  value: string
  direction: DecisionDirection
  weightHint: WeightHint
  dataQuality: 'rich' | 'partial' | 'poor' | 'unavailable' | 'unknown'
  evidenceRef: string | null
  reasoning: string
  limitations: string[]
  createdAt: string
}

let seq = 0
function di(fixtureId: string, source: string, variableKey: string, variableName: string, value: string, direction: DecisionDirection, weightHint: WeightHint, dataQuality: DecisionInput['dataQuality'], reasoning: string, limitations: string[] = []): DecisionInput {
  seq = (seq + 1) % 1e9
  return { id: `dci_${Date.now().toString(36)}_${seq.toString(36)}`, fixtureId, source, variableKey, variableName, value, direction, weightHint, dataQuality, evidenceRef: null, reasoning, limitations, createdAt: new Date().toISOString() }
}

export interface DecisionInputBundle {
  positive: DecisionInput[]
  negative: DecisionInput[]
  neutral: DecisionInput[]
  uncertain: DecisionInput[]
  blocking: DecisionInput[]
  contextual: DecisionInput[]
  all: DecisionInput[]
}

export interface DecisionInputSources {
  fixtureId: string
  context: MatchContextProfile | null
  squad: SquadAvailabilityProfile | null
  memoryHome: TeamIntelligenceMemory | null
  memoryAway: TeamIntelligenceMemory | null
  h2h: HeadToHeadIntelligence | null
  tactical: TacticalMatchupProfile | null
  readiness: CanonicalAnalysisReadiness | null
}

export function buildDecisionInputs(src: DecisionInputSources): DecisionInputBundle {
  const f = src.fixtureId
  const out: DecisionInput[] = []

  // Context
  if (src.context) {
    const c = src.context
    if (c.importanceLevel === 'critical' || c.importanceLevel === 'high') {
      out.push(di(f, 'match_context', 'match_importance', 'Importância da partida', c.importanceLevel, 'contextual', 'high', 'partial', 'Jogo importante pode alterar comportamento histórico (mata-mata/decisão).', c.limitations.slice(0, 1)))
    }
    if (c.competitionContext.isKnockout === true) {
      out.push(di(f, 'match_context', 'knockout', 'Mata-mata', 'sim', 'contextual', 'medium', 'partial', 'Mata-mata tende a ser mais conservador/volátil — afeta padrões.'))
    }
    if (c.volatilityRisk === 'high') {
      out.push(di(f, 'match_context', 'volatility', 'Volatilidade', 'alta', 'uncertain', 'medium', 'partial', 'Alta volatilidade aumenta incerteza da leitura.'))
    }
    out.push(di(f, 'match_context', 'rivalry', 'Rivalidade/clássico', 'unknown', 'uncertain', 'unknown', 'unavailable', 'Rivalidade não coletada — não inventamos clássico.', ['Rivalidade unknown.']))
  }

  // Squad / lineup
  if (src.squad) {
    const s = src.squad
    if (s.waitForLineupRecommended) {
      out.push(di(f, 'squad', 'lineup_pending', 'Escalação pendente', s.lineupStatus, 'blocking', 'high', 'unavailable', `Escalação ainda não saiu (~${s.minutesToKickoff ?? '?'}min para o início) — esperar antes de decidir.`, s.limitations.slice(0, 1)))
    }
    out.push(di(f, 'squad', 'injuries', 'Lesões', 'unknown', 'uncertain', 'unknown', 'unavailable', 'Lesões não coletadas — unknown ≠ sem lesão.', ['Lesões não coletadas.']))
    out.push(di(f, 'squad', 'suspensions', 'Suspensões', 'unknown', 'uncertain', 'unknown', 'unavailable', 'Suspensões não coletadas — unknown ≠ sem suspensão.', ['Suspensões não coletadas.']))
  }

  // Memory
  for (const [side, mem] of [['home', src.memoryHome], ['away', src.memoryAway]] as const) {
    if (!mem) continue
    if (mem.sampleSize === 0) {
      out.push(di(f, 'team_memory', `memory_${side}`, `Memória ${side}`, 'insufficient_history', 'uncertain', 'low', 'unavailable', 'Sem histórico interno suficiente — insufficient_history.', mem.limitations.slice(0, 1)))
    } else {
      const dir: DecisionDirection = mem.patternsConfirmed > mem.patternsFailed ? 'positive' : mem.patternsFailed > mem.patternsConfirmed ? 'negative' : 'neutral'
      const wh: WeightHint = mem.sampleQuality === 'strong' ? 'high' : mem.sampleQuality === 'moderate' ? 'medium' : 'low'
      out.push(di(f, 'team_memory', `memory_${side}`, `Memória ${side}`, `${mem.patternsConfirmed}c/${mem.patternsFailed}f (${mem.sampleQuality})`, dir, wh, 'partial', 'Histórico interno do clube (amostra pequena não supervaloriza).'))
    }
  }

  // H2H
  if (src.h2h) {
    const h = src.h2h
    if (h.h2hReliability === 'insufficient_data') {
      out.push(di(f, 'h2h', 'head_to_head', 'Confronto direto', 'insufficient_data', 'uncertain', 'low', 'unavailable', 'H2H insuficiente — não é tabu.', h.limitations.slice(0, 1)))
    } else {
      out.push(di(f, 'h2h', 'head_to_head', 'Confronto direto', `${h.relevantMatches} relevantes`, 'contextual', 'low', 'partial', 'H2H interno; confrontos antigos têm peso menor.', h.warnings.slice(0, 1)))
    }
  }

  // Tactical
  if (src.tactical) {
    const t = src.tactical
    if (t.basis === 'live_stats') {
      out.push(di(f, 'tactical', 'live_tempo', 'Ritmo ao vivo', t.expectedTempo, 'contextual', 'low', 'partial', 'Estimativa ao vivo de baixa confiabilidade.'))
      if (t.cardRisk === 'high') out.push(di(f, 'tactical', 'card_risk', 'Risco de cartão', 'alto', 'contextual', 'low', 'partial', 'Cartões acima da média no jogo ao vivo.'))
    } else {
      out.push(di(f, 'tactical', 'style', 'Estilo/tática', 'unknown', 'uncertain', 'unknown', 'unavailable', 'Estilo pré-jogo não coletado.', ['Tática unknown.']))
    }
  }

  // Readiness as a blocking/uncertain input
  if (src.readiness) {
    const r = src.readiness
    if (r.status === 'wait_for_lineup' || r.status === 'wait_for_live_data') {
      out.push(di(f, 'readiness', 'readiness', 'Prontidão', r.status, 'blocking', 'high', 'partial', `Análise ainda sem base suficiente (${r.status}).`))
    } else if (r.status === 'provider_limited' || r.status === 'insufficient_history' || r.status === 'not_ready') {
      out.push(di(f, 'readiness', 'readiness', 'Prontidão', r.status, 'uncertain', 'medium', 'partial', `Base limitada para análise (${r.status}).`))
    }
  }

  const bundle: DecisionInputBundle = {
    positive: out.filter(x => x.direction === 'positive'),
    negative: out.filter(x => x.direction === 'negative'),
    neutral: out.filter(x => x.direction === 'neutral'),
    uncertain: out.filter(x => x.direction === 'uncertain'),
    blocking: out.filter(x => x.direction === 'blocking'),
    contextual: out.filter(x => x.direction === 'contextual'),
    all: out,
  }
  return bundle
}
