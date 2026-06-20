/**
 * Variable Extraction Engine (B46 / Bloco 3).
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts structured variables from MatchIntelligencePackage V4 (memory) + its base
 * chain (V3/V2/V1: context, squad, lineup, provider/data readiness, live). NEVER
 * invents a variable: missing critical data becomes an ABSENCE/limitation variable
 * (e.g. `injury_data_missing`), never a negative fact (`no_injuries`). Manual stays
 * manual; provider stays provider; conflicts and weak samples become variables too.
 */
import { buildMatchIntelligencePackageV4, type MatchIntelligencePackageV4 } from '../matchIntelligencePackageV4.service.js'
import { buildSquadAvailabilityV2 } from '../squadAvailabilityEngine.service.js'
import { getDefaultLimitations, isAbsenceLimitation } from './variableTaxonomy.service.js'
import type {
  VariableInfluenceInput, VariableInfluenceCategory, VariableInfluenceSource, VariableInfluenceReliability,
} from './variableInfluence.types.js'

let seq = 0
function mkInput(
  fixtureId: string, patternId: string | null, variableKey: string, category: VariableInfluenceCategory,
  label: string, rawValue: string, source: VariableInfluenceSource,
  dataQuality: VariableInfluenceInput['dataQuality'], reliability: VariableInfluenceReliability,
  opts: { sampleQuality?: VariableInfluenceInput['sampleQuality']; evidenceRefs?: string[]; limitations?: string[] } = {},
): VariableInfluenceInput {
  seq = (seq + 1) % 1e9
  return {
    id: `vin_${Date.now().toString(36)}_${seq.toString(36)}`,
    fixtureId, patternId, variableKey, category, label, rawValue,
    source, dataQuality, sampleQuality: opts.sampleQuality, reliability,
    evidenceRefs: opts.evidenceRefs, limitations: [...new Set([...(opts.limitations ?? []), ...getDefaultLimitations(variableKey)])],
  }
}

const sampleQualityToReliability = (q?: string): VariableInfluenceReliability =>
  q === 'strong' ? 'high' : q === 'usable' ? 'medium' : q === 'misleading_risk' ? 'conflicting'
    : q === 'weak' ? 'weak_sample' : q === 'insufficient' ? 'unavailable' : 'unknown'

export function extractLineupVariables(pkg: MatchIntelligencePackageV4, fixtureId: string, patternId: string | null): VariableInfluenceInput[] {
  const base = pkg.base?.base?.base // V1 MatchIntelligencePackage
  const squad = base?.squads
  const lineupWindow = pkg.base?.base?.lineupWindow
  const out: VariableInfluenceInput[] = []
  if (!squad) return out
  if (squad.waitForLineupRecommended || squad.lineupStatus === 'not_available_yet') {
    out.push(mkInput(fixtureId, patternId, 'lineup_missing', 'lineup', 'Escalação ausente', squad.lineupStatus, 'derived_context', 'unavailable', 'unavailable'))
  } else if (squad.lineupStatus === 'confirmed') {
    out.push(mkInput(fixtureId, patternId, 'lineup_confirmed', 'lineup', 'Escalação confirmada', 'confirmed', 'provider_data', 'partial', 'medium'))
  }
  if ((lineupWindow as any)?.conflict) {
    out.push(mkInput(fixtureId, patternId, 'lineup_conflict', 'lineup', 'Conflito de escalação', 'provável × confirmada', 'derived_context', 'partial', 'conflicting'))
  }
  return out
}

export async function extractInjurySuspensionVariables(pkg: MatchIntelligencePackageV4, fixtureId: string, patternId: string | null): Promise<VariableInfluenceInput[]> {
  const out: VariableInfluenceInput[] = []
  const sq = await buildSquadAvailabilityV2(fixtureId).catch(() => null)
  if (!sq) return out
  if (sq.injuries.available && sq.injuries.items.length > 0) {
    const rel: VariableInfluenceReliability = sq.injuries.source === 'manual' ? 'medium' : 'high'
    out.push(mkInput(fixtureId, patternId, 'key_injury_confirmed', 'injury', 'Lesão confirmada', `${sq.injuries.items.length} (${sq.injuries.source})`, sq.injuries.source === 'manual' ? 'manual_data' : 'provider_data', 'partial', rel))
  } else {
    out.push(mkInput(fixtureId, patternId, 'injury_data_missing', 'injury', 'Dados de lesão ausentes', 'unavailable', 'derived_context', 'unavailable', 'unavailable'))
  }
  if (sq.suspensions.available && sq.suspensions.items.length > 0) {
    const rel: VariableInfluenceReliability = sq.suspensions.source === 'manual' ? 'medium' : 'high'
    out.push(mkInput(fixtureId, patternId, 'key_suspension_confirmed', 'suspension', 'Suspensão confirmada', `${sq.suspensions.items.length} (${sq.suspensions.source})`, sq.suspensions.source === 'manual' ? 'manual_data' : 'provider_data', 'partial', rel))
  } else {
    out.push(mkInput(fixtureId, patternId, 'suspension_data_missing', 'suspension', 'Suspensões ausentes', 'unavailable', 'derived_context', 'unavailable', 'unavailable'))
  }
  // Player importance is unknown without squads.
  out.push(mkInput(fixtureId, patternId, 'player_importance_unknown', 'player_importance', 'Importância de jogador desconhecida', 'unknown', 'derived_context', 'unavailable', 'unknown'))
  return out
}

export function extractContextVariables(pkg: MatchIntelligencePackageV4, fixtureId: string, patternId: string | null): VariableInfluenceInput[] {
  const base = pkg.base?.base?.base
  const ctx = base?.context
  const out: VariableInfluenceInput[] = []
  if (!ctx) return out
  if (ctx.competitionContext?.isKnockout === true) {
    out.push(mkInput(fixtureId, patternId, 'knockout_match', 'knockout', 'Mata-mata', 'sim', 'derived_context', 'partial', 'medium'))
  }
  if (ctx.importanceLevel === 'critical') {
    out.push(mkInput(fixtureId, patternId, 'semi_final_or_final', 'match_importance', 'Decisão', ctx.importanceLevel, 'derived_context', 'partial', 'medium'))
  } else if (ctx.importanceLevel === 'low') {
    out.push(mkInput(fixtureId, patternId, 'low_importance_match', 'match_importance', 'Baixa importância', ctx.importanceLevel, 'derived_context', 'partial', 'low'))
  }
  if ((ctx as any).rivalryLevel && (ctx as any).rivalryLevel !== 'unknown' && (ctx as any).rivalryLevel !== 'none') {
    out.push(mkInput(fixtureId, patternId, 'derby_or_classic', 'rivalry', 'Clássico/derby', String((ctx as any).rivalryLevel), 'derived_context', 'partial', 'low'))
  }
  return out
}

export function extractMemoryVariables(pkg: MatchIntelligencePackageV4, fixtureId: string, patternId: string | null): VariableInfluenceInput[] {
  const out: VariableInfluenceInput[] = []
  // Team memory (home/away) → support/contradict by confirmed vs failed in the profile.
  for (const mem of [pkg.homeMemory, pkg.awayMemory]) {
    if (!mem) continue
    if (mem.memoryState === 'insufficient_history') {
      out.push(mkInput(fixtureId, patternId, 'sample_too_small', 'team_memory', `Memória ${mem.teamName} insuficiente`, 'insufficient_history', 'internal_memory', 'unavailable', 'unavailable', { sampleQuality: 'insufficient' }))
      continue
    }
    const q = mem.overallSample.quality
    if (q === 'misleading_risk' || q === 'weak') {
      out.push(mkInput(fixtureId, patternId, 'sample_too_small', 'team_memory', `Memória ${mem.teamName} fraca`, q, 'internal_memory', 'poor', sampleQualityToReliability(q), { sampleQuality: q }))
    }
  }
  // Matchup memory.
  if (pkg.matchupMemory) {
    const m = pkg.matchupMemory
    if (m.matchupState === 'insufficient_data') {
      out.push(mkInput(fixtureId, patternId, 'sample_too_small', 'matchup_memory', 'Confronto direto insuficiente', 'insufficient_data', 'internal_memory', 'unavailable', 'unavailable', { sampleQuality: 'insufficient', limitations: ['insufficient_data nunca vira tabu.'] }))
    } else if (m.maturity === 'high') {
      out.push(mkInput(fixtureId, patternId, 'matchup_memory_supports_pattern', 'matchup_memory', 'Memória de confronto madura', m.maturity, 'internal_memory', 'partial', 'medium', { sampleQuality: m.sample.quality }))
    }
  }
  // Pattern×context memory.
  for (const p of pkg.patternContextMemory ?? []) {
    if (p.recommendation === 'use_with_confidence') {
      out.push(mkInput(fixtureId, patternId, 'team_memory_supports_pattern', 'pattern_memory', `${p.patternName}/${p.contextLabel}`, p.classification, 'internal_memory', 'partial', sampleQualityToReliability(p.sample.quality), { sampleQuality: p.sample.quality }))
    } else if (p.recommendation === 'stay_out') {
      out.push(mkInput(fixtureId, patternId, 'team_memory_contradicts_pattern', 'pattern_memory', `${p.patternName}/${p.contextLabel}`, p.classification, 'internal_memory', 'partial', sampleQualityToReliability(p.sample.quality), { sampleQuality: p.sample.quality }))
    }
  }
  // Taboos.
  for (const t of pkg.taboos ?? []) {
    if (t.status === 'supported' && t.isUsableConstraint) {
      out.push(mkInput(fixtureId, patternId, 'taboo_supported', 'taboo', t.description, t.status, 'internal_memory', 'partial', sampleQualityToReliability(t.sample.quality), { sampleQuality: t.sample.quality }))
    } else if (t.status === 'weak_sample' || t.status === 'superstition_risk') {
      out.push(mkInput(fixtureId, patternId, 'taboo_weak', 'taboo', t.description, t.status, 'internal_memory', 'poor', 'weak_sample', { sampleQuality: 'weak' }))
    }
  }
  // Similar scenarios.
  if (pkg.similarScenarios && pkg.similarScenarios.usableScenarios > 0) {
    out.push(mkInput(fixtureId, patternId, 'similar_scenario_supports', 'similar_scenario', 'Cenários similares úteis', String(pkg.similarScenarios.usableScenarios), 'internal_memory', 'partial', 'low', { limitations: ['Retrieval ≠ previsão.'] }))
  }
  return out
}

export function extractProviderQualityVariables(pkg: MatchIntelligencePackageV4, fixtureId: string, patternId: string | null): VariableInfluenceInput[] {
  const out: VariableInfluenceInput[] = []
  const v5 = pkg.base?.readinessV5
  if (!v5) return out
  for (const d of v5.blockedCriticalDomains ?? []) {
    out.push(mkInput(fixtureId, patternId, 'critical_data_missing', 'data_readiness', `Domínio crítico ausente: ${d}`, d, 'derived_context', 'unavailable', 'unavailable'))
  }
  for (const d of v5.staleCriticalDomains ?? []) {
    out.push(mkInput(fixtureId, patternId, 'provider_domain_stale', 'data_readiness', `Domínio stale: ${d}`, d, 'provider_data', 'poor', 'stale'))
  }
  for (const d of v5.providerNotConfiguredDomains ?? []) {
    out.push(mkInput(fixtureId, patternId, 'provider_not_configured', 'provider_quality', `Provider não configurado: ${d}`, d, 'derived_context', 'unavailable', 'unavailable'))
  }
  for (const d of v5.endpointMissingDocsDomains ?? []) {
    out.push(mkInput(fixtureId, patternId, 'endpoint_not_implemented', 'provider_quality', `Endpoint não documentado: ${d}`, d, 'derived_context', 'unavailable', 'unavailable'))
  }
  return out
}

export function extractManualDataVariables(pkg: MatchIntelligencePackageV4, fixtureId: string, patternId: string | null): VariableInfluenceInput[] {
  const out: VariableInfluenceInput[] = []
  const manualUsed = pkg.base?.manualDataUsed
  const v5 = pkg.base?.readinessV5
  if (manualUsed && (v5?.manualCriticalDomains.length ?? 0) > 0) {
    out.push(mkInput(fixtureId, patternId, 'manual_data_high_reliability', 'data_readiness', 'Dado manual confiável', v5!.manualCriticalDomains.join(','), 'manual_data', 'partial', 'medium', { limitations: ['Dado manual sempre marcado como manual; nunca finge provider.'] }))
  }
  // Conflict requiring operator review (from V3 base / merge).
  const domainsNeedingAction = pkg.base?.domainsNeedingOperatorAction ?? []
  if (domainsNeedingAction.some(d => d.includes('use_manual_intake') || d.includes('confirm_mapping'))) {
    // not a conflict per se; handled in conflict engine. Skip here.
  }
  return out
}

export function extractLiveVariables(pkg: MatchIntelligencePackageV4, fixtureId: string, patternId: string | null): VariableInfluenceInput[] {
  const base = pkg.base?.base?.base
  const live = base?.live
  const out: VariableInfluenceInput[] = []
  if (!live) return out
  if (base?.phase === 'live' && !live.hasStats) {
    out.push(mkInput(fixtureId, patternId, 'live_stats_unavailable', 'live_event', 'Stats ao vivo ausentes', 'no_stats', 'live_state', 'unavailable', 'unavailable'))
    return out
  }
  for (const e of live.recentEvents ?? []) {
    if (e.type === 'red_card') {
      out.push(mkInput(fixtureId, patternId, e.side === 'home' ? 'red_card_home' : 'red_card_away', 'live_event', `Vermelho aos ${e.minute}'`, e.side, 'live_state', 'rich', 'high'))
    } else if ((e.type === 'goal' || e.type === 'penalty_scored') && e.minute >= 80) {
      out.push(mkInput(fixtureId, patternId, 'late_goal_pressure', 'live_event', `Gol tardio aos ${e.minute}'`, String(e.minute), 'live_state', 'rich', 'high'))
    } else if ((e.type === 'goal') && e.minute <= 15) {
      out.push(mkInput(fixtureId, patternId, 'early_goal', 'live_event', `Gol cedo aos ${e.minute}'`, String(e.minute), 'live_state', 'rich', 'high'))
    }
  }
  return out
}

export async function extractVariablesForFixture(fixtureId: string, patternId: string | null = null, prebuilt?: MatchIntelligencePackageV4 | null): Promise<VariableInfluenceInput[]> {
  const pkg = prebuilt ?? await buildMatchIntelligencePackageV4(fixtureId).catch(() => null)
  if (!pkg) return []
  const [injSusp] = await Promise.all([extractInjurySuspensionVariables(pkg, fixtureId, patternId)])
  return [
    ...extractLineupVariables(pkg, fixtureId, patternId),
    ...injSusp,
    ...extractContextVariables(pkg, fixtureId, patternId),
    ...extractMemoryVariables(pkg, fixtureId, patternId),
    ...extractProviderQualityVariables(pkg, fixtureId, patternId),
    ...extractManualDataVariables(pkg, fixtureId, patternId),
    ...extractLiveVariables(pkg, fixtureId, patternId),
  ]
}

export async function extractVariablesForPattern(fixtureId: string, patternId: string, prebuilt?: MatchIntelligencePackageV4 | null): Promise<VariableInfluenceInput[]> {
  return extractVariablesForFixture(fixtureId, patternId, prebuilt)
}
