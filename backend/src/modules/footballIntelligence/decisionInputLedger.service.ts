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
import type {
  TeamFundamentalMemoryProfile, MatchupFundamentalMemoryProfile,
  HistoricalPatternContextProfile, TabooCandidate,
} from './memory/fundamentalMemory.types.js'

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
  // B45: optional historical-memory inputs (advisory; never block).
  homeFundamentalMemory?: TeamFundamentalMemoryProfile | null
  awayFundamentalMemory?: TeamFundamentalMemoryProfile | null
  matchupMemory?: MatchupFundamentalMemoryProfile | null
  patternContext?: HistoricalPatternContextProfile[]
  usableTaboos?: TabooCandidate[]
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

  // B45: historical fundamental memory (advisory; reliability ≠ probability).
  for (const [side, mem] of [['home', src.homeFundamentalMemory], ['away', src.awayFundamentalMemory]] as const) {
    if (!mem) continue
    if (mem.memoryState === 'insufficient_history') {
      out.push(di(f, 'fundamental_memory', `fundamental_memory_${side}`, `Memória fundamental ${side}`, 'insufficient_history', 'uncertain', 'low', 'unavailable', 'Sem memória fundamental suficiente — insufficient_history (não é negativo).', mem.limitations.slice(0, 1)))
    } else if (mem.overallSample.quality === 'misleading_risk') {
      out.push(di(f, 'fundamental_memory', `fundamental_memory_${side}`, `Memória fundamental ${side}`, 'misleading_risk', 'uncertain', 'low', 'poor', 'Memória potencialmente enganosa (antiga/contexto misto) — sample_quality_warning.'))
    } else {
      const dir: DecisionDirection = mem.overallSample.quality === 'strong' ? 'positive' : 'contextual'
      const wh: WeightHint = mem.overallSample.quality === 'strong' ? 'medium' : 'low'
      out.push(di(f, 'fundamental_memory', `fundamental_memory_${side}`, `Memória fundamental ${side}`, `${mem.memoryState}/${mem.overallSample.quality}`, dir, wh, 'partial', 'Memória fundamental do clube como apoio; confiança de dado, não probabilidade.'))
    }
  }
  if (src.matchupMemory) {
    const m = src.matchupMemory
    if (m.matchupState === 'insufficient_data') {
      out.push(di(f, 'matchup_memory', 'matchup_memory', 'Memória de confronto', 'insufficient_data', 'uncertain', 'low', 'unavailable', 'Confronto direto insuficiente — não é tabu.', m.limitations.slice(0, 1)))
    } else {
      out.push(di(f, 'matchup_memory', 'matchup_memory', 'Memória de confronto', `${m.matchupState} (${m.maturity})`, 'contextual', m.maturity === 'high' ? 'medium' : 'low', 'partial', 'Memória de confronto interna como apoio; confrontos antigos pesam menos.'))
    }
  }
  for (const p of src.patternContext ?? []) {
    if (p.recommendation === 'stay_out') {
      out.push(di(f, 'pattern_context_memory', `pattern_context_${p.patternKey}_${p.contextKey}`, `Padrão×contexto`, `${p.patternName}/${p.contextLabel}`, 'negative', 'medium', 'partial', `stay_out_memory_reason: contexto historicamente desfavorável (${p.sample.quality}).`))
    } else if (p.recommendation === 'use_with_confidence') {
      out.push(di(f, 'pattern_context_memory', `pattern_context_${p.patternKey}_${p.contextKey}`, `Padrão×contexto`, `${p.patternName}/${p.contextLabel}`, 'positive', 'medium', 'partial', 'Contexto historicamente favorável (apoio observacional).'))
    }
  }
  for (const t of src.usableTaboos ?? []) {
    out.push(di(f, 'taboo_memory', `taboo_${t.id}`, 'Restrição histórica', t.status, t.status === 'supported' ? 'negative' : 'uncertain', t.status === 'supported' ? 'medium' : 'low', 'partial', `taboo_supported: ${t.description}`, t.limitations.slice(0, 1)))
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
