/**
 * Causal Insight Generator (B48 / Bloco 5) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Turns a classified case into human-readable insights. Every insight needs evidence;
 * without evidence it carries a limitation. No bet/odds/stake language. Insights are
 * advisory: `autoApplicable=false`, `requiresHumanReview=true`.
 */
import type { CausalLearningCase, CausalLearningInsight } from './causalLearning.types.js'

let seq = 0
function insightId(caseId: string, kind: string): string { seq = (seq + 1) % 1e9; return `cli_${caseId}__${kind}_${seq.toString(36)}` }

function mk(c: CausalLearningCase, insightType: CausalLearningInsight['insightType'], severity: CausalLearningInsight['severity'], title: string, explanation: string, evidence: string[], suggestedRefinement: string | null): CausalLearningInsight {
  return {
    id: insightId(c.id, insightType), fixtureId: c.fixtureId, patternId: c.patternId, caseId: c.id,
    insightType, severity, title, explanation, evidence,
    suggestedRefinement, autoApplicable: false, requiresHumanReview: true,
    createdAt: new Date().toISOString(),
    limitations: evidence.length === 0 ? ['Sem evidência suficiente — insight apenas indicativo.'] : ['Insight observacional; não aplica mudança.'],
  }
}

export function generateGovernanceInsights(c: CausalLearningCase): CausalLearningInsight[] {
  const out: CausalLearningInsight[] = []
  if (c.failureCategories.includes('ignored_blocker')) out.push(mk(c, 'governance_policy', 'critical', 'Bloqueador ignorado', 'A governança recomendaria bloquear, mas o alerta foi criado e falhou.', [`governance=${c.governanceAction}`, `outcome=${c.outcomeResult}`], 'Reforçar gate de bloqueio antes de alertar (revisão humana).'))
  if (c.failureCategories.includes('ignored_wait_reason')) out.push(mk(c, 'governance_policy', 'important', 'Espera ignorada', 'A governança recomendaria esperar, mas o alerta foi criado e falhou.', [`governance=${c.governanceAction}`, `outcome=${c.outcomeResult}`], 'Esperar dado crítico/temporal antes de alertar (revisão humana).'))
  if (c.classification === 'overconservative') out.push(mk(c, 'governance_policy', 'caution', 'Possível conservadorismo excessivo', 'A governança bloquearia em shadow, mas o resultado confirmou — avaliar se a política está rígida demais.', [`governance=${c.governanceAction}`, `outcome=${c.outcomeResult}`, `link=${c.linkStrength}`], 'Avaliar afrouxar a regra específica (revisão humana; sem aplicar).'))
  if (c.successCategories.includes('governance_blocked_correctly') || c.successCategories.includes('governance_waited_correctly')) out.push(mk(c, 'governance_policy', 'info', 'Governança ajudou', 'A decisão de esperar/bloquear foi coerente com o resultado.', [`governance=${c.governanceAction}`, `outcome=${c.outcomeResult}`], null))
  return out
}

export function generateInfluenceInsights(c: CausalLearningCase): CausalLearningInsight[] {
  const out: CausalLearningInsight[] = []
  if (c.failureCategories.includes('influence_overestimated')) out.push(mk(c, 'variable_influence', 'important', 'Influência superestimada', 'A leitura de influência era favorável, mas o resultado falhou.', [`outcome=${c.outcomeResult}`], 'Reduzir magnitude de variáveis de baixa confiabilidade para esta família (revisão humana).'))
  if (c.failureCategories.includes('influence_underestimated')) out.push(mk(c, 'variable_influence', 'caution', 'Influência subestimada', 'Sinais negativos foram subponderados frente ao resultado.', [`outcome=${c.outcomeResult}`], 'Reavaliar peso de variáveis contraditórias (revisão humana).'))
  return out
}

export function generateMemoryInsights(c: CausalLearningCase): CausalLearningInsight[] {
  const out: CausalLearningInsight[] = []
  if (c.failureCategories.includes('memory_misleading')) out.push(mk(c, 'memory', 'caution', 'Memória enganou', 'A memória parecia apoiar, mas a amostra era fraca/antiga.', [`link=${c.linkStrength}`], 'Exigir amostra forte antes de pesar memória (revisão humana).'))
  if (c.failureCategories.includes('weak_sample_overweighted')) out.push(mk(c, 'memory', 'caution', 'Amostra fraca supervalorizada', 'Uma amostra pequena foi tratada com peso indevido.', [], 'Rebaixar magnitude quando sample weak (revisão humana).'))
  return out
}

export function generateDataAcquisitionInsights(c: CausalLearningCase): CausalLearningInsight[] {
  const out: CausalLearningInsight[] = []
  if (c.failureCategories.includes('missing_critical_domain')) out.push(mk(c, 'data_acquisition', 'important', 'Domínio crítico ausente prejudicou', 'A falta de um domínio crítico reduziu a qualidade da análise.', [`outcome=${c.outcomeResult}`], 'Buscar domínio/colher manual antes de alertar (revisão humana).'))
  if (c.failureCategories.includes('stale_data')) out.push(mk(c, 'data_acquisition', 'caution', 'Dado desatualizado', 'Dado stale foi usado na decisão.', [], 'Atualizar domínio antes de confiar (revisão humana).'))
  return out
}

export function generateProviderInsights(c: CausalLearningCase): CausalLearningInsight[] {
  const out: CausalLearningInsight[] = []
  if (c.classification === 'provider_limited' || c.failureCategories.includes('provider_limitation')) out.push(mk(c, 'provider_quality', 'info', 'Limitação de provider', 'A análise fundamentalista foi limitada por falta de provider/endpoint.', [`classification=${c.classification}`], 'Configurar provider/mapeamento para o domínio (revisão humana).'))
  return out
}

export function generateTimingInsights(c: CausalLearningCase): CausalLearningInsight[] {
  const out: CausalLearningInsight[] = []
  if (c.classification === 'too_early' || c.failureCategories.includes('red_card_shock')) out.push(mk(c, 'live_recheck', 'caution', 'Confirmação ao vivo necessária', 'A leitura pré-jogo foi invalidada por evento ao vivo — confirmação ao vivo era necessária.', [...c.failureCategories], 'Exigir confirmação ao vivo para esta família (revisão humana).'))
  return out
}

export function generateInsightsForCase(c: CausalLearningCase): CausalLearningInsight[] {
  if (!c.evaluable) return []
  return [
    ...generateGovernanceInsights(c),
    ...generateInfluenceInsights(c),
    ...generateMemoryInsights(c),
    ...generateDataAcquisitionInsights(c),
    ...generateProviderInsights(c),
    ...generateTimingInsights(c),
  ]
}
