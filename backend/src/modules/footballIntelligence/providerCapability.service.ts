/**
 * Provider Capability Service (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Source of truth for what the backend can ACTUALLY analyze per provider, grounded
 * in the audit (ESPN-only live ingestion; pre-match domains not collected). Never
 * invents coverage. Odds = not_used by design (never a critical gap).
 */
import type {
  IntelligenceDomain, DomainCapability, ProviderCapabilities,
  ProviderReliabilityReport, DomainAnalyzability, CoverageLevel, Reliability, Freshness,
} from './providerCapability.types.js'

const ALL_DOMAINS: IntelligenceDomain[] = [
  'fixtures', 'live_score', 'live_events', 'live_stats',
  'lineups', 'probable_lineups', 'confirmed_lineups',
  'squads', 'players', 'player_stats', 'team_stats',
  'injuries', 'suspensions', 'cards', 'yellow_cards', 'red_cards',
  'standings', 'table_context', 'team_form', 'head_to_head',
  'referee', 'venue', 'competition_stage', 'knockout_context', 'aggregate_score',
  'post_match_stats', 'substitutions', 'tactical_events',
  'weather', 'travel', 'rest_days',
  'market', 'odds',
]

function cap(domain: IntelligenceDomain, coverage: CoverageLevel, reliability: Reliability, freshness: Freshness, note: string, reason?: DomainCapability['reason']): DomainCapability {
  return { domain, coverage, reliability, freshness, note, reason }
}

/** ESPN — the only provider wired into the live ingestion pipeline today. */
function espnDomains(): Record<IntelligenceDomain, DomainCapability> {
  const d: Partial<Record<IntelligenceDomain, DomainCapability>> = {
    fixtures: cap('fixtures', 'full', 'medium', 'realtime', 'ESPN "all" scoreboard (live + recently finished).'),
    live_score: cap('live_score', 'full', 'high', 'realtime', 'Score/minute/status from scoreboard.'),
    live_events: cap('live_events', 'partial', 'medium', 'realtime', 'Timed events from summary endpoint (goals, cards, subs, var, offside).', 'partial_only'),
    live_stats: cap('live_stats', 'partial', 'medium', 'near_realtime', 'Team-level stats via summary, enrichment-gated and budget-limited.', 'partial_only'),
    team_stats: cap('team_stats', 'partial', 'medium', 'near_realtime', 'Possession, shots, SOT, corners, fouls, offsides, saves (team totals).', 'partial_only'),
    cards: cap('cards', 'partial', 'medium', 'realtime', 'Yellow/red totals + card events.', 'partial_only'),
    yellow_cards: cap('yellow_cards', 'partial', 'medium', 'realtime', 'Team totals from stats.', 'partial_only'),
    red_cards: cap('red_cards', 'partial', 'medium', 'realtime', 'Team totals + red_card events.', 'partial_only'),
    substitutions: cap('substitutions', 'limited', 'low', 'realtime', 'Substitution event type only; no player in/out modeling.', 'partial_only'),
    tactical_events: cap('tactical_events', 'limited', 'low', 'realtime', 'Inferred from event stream only.', 'partial_only'),
    post_match_stats: cap('post_match_stats', 'partial', 'medium', 'post_match_only', 'Final snapshot team stats/events.', 'partial_only'),
    player_stats: cap('player_stats', 'limited', 'low', 'realtime', 'Only playerName on events; no per-player stat structures.', 'partial_only'),
    players: cap('players', 'limited', 'low', 'realtime', 'Names appear on events only.', 'partial_only'),
    competition_stage: cap('competition_stage', 'limited', 'low', 'pre_match_only', 'Heuristic from competition name string, not provider data.', 'partial_only'),
  }
  // Everything else: not collected by the backend.
  for (const dom of ALL_DOMAINS) {
    if (d[dom]) continue
    if (dom === 'odds' || dom === 'market') { d[dom] = cap(dom, 'not_used', 'unknown', 'unknown', 'Odds/market intentionally not used by GoalSense.', 'not_used_by_design'); continue }
    if (dom === 'injuries') { d[dom] = cap(dom, 'unavailable', 'unknown', 'unknown', 'Not collected by backend (edge function only, api-football).', 'edge_function_only'); continue }
    if (dom === 'standings' || dom === 'table_context') { d[dom] = cap(dom, 'unavailable', 'unknown', 'unknown', 'Not collected by backend (edge function only).', 'edge_function_only'); continue }
    if (dom === 'referee' || dom === 'venue') { d[dom] = cap(dom, 'unavailable', 'unknown', 'unknown', 'Not collected by backend (present only in api-football edge fixture).', 'edge_function_only'); continue }
    if (dom === 'weather' || dom === 'travel' || dom === 'rest_days') { d[dom] = cap(dom, 'unavailable', 'unknown', 'unknown', 'Not supported.', 'provider_not_supported'); continue }
    d[dom] = cap(dom, 'unavailable', 'unknown', 'unknown', 'Not collected yet by the backend.', 'not_collected_yet')
  }
  return d as Record<IntelligenceDomain, DomainCapability>
}

const PROVIDERS: Record<string, () => Record<IntelligenceDomain, DomainCapability>> = {
  espn: espnDomains,
}

export function getProviderCapabilities(providerName = 'espn'): ProviderCapabilities {
  const builder = PROVIDERS[providerName.toLowerCase()] || espnDomains
  const domains = builder()
  const limitations: string[] = []
  if (!PROVIDERS[providerName.toLowerCase()]) limitations.push(`Provider "${providerName}" desconhecido — usando matriz ESPN como referência.`)
  limitations.push('Apenas ESPN está integrado à ingestão ao vivo do backend; demais providers existem só como edge functions do frontend.')
  limitations.push('Dados pré-jogo (escalações, lesões, suspensões, tabela, H2H, árbitro) não são coletados pelo backend.')
  return { provider: providerName, generatedAt: new Date().toISOString(), domains, limitations }
}

export function explainCapability(domain: IntelligenceDomain, providerName = 'espn'): string {
  const c = getProviderCapabilities(providerName).domains[domain]
  if (!c) return `Domínio ${domain} desconhecido.`
  return `${domain}: cobertura=${c.coverage}, confiabilidade=${c.reliability}, atualidade=${c.freshness}. ${c.note}`
}

export function explainMissingCapability(domain: IntelligenceDomain, providerName = 'espn'): string | null {
  const c = getProviderCapabilities(providerName).domains[domain]
  if (!c) return `Domínio ${domain} desconhecido.`
  if (c.coverage === 'full' || c.coverage === 'partial') return null
  if (c.coverage === 'not_used') return `${domain}: não usado por decisão de produto (não é uma lacuna crítica).`
  return `${domain}: indisponível (${c.reason || 'unknown'}). ${c.note}`
}

/** A domain is analyzable when coverage is full or partial (partial = with caveats). */
export function canAnalyzeDomain(domain: IntelligenceDomain, providerName = 'espn'): DomainAnalyzability {
  const c = getProviderCapabilities(providerName).domains[domain]
  const canAnalyze = !!c && (c.coverage === 'full' || c.coverage === 'partial')
  return {
    domain,
    canAnalyze,
    coverage: c?.coverage ?? 'unknown',
    reliability: c?.reliability ?? 'unknown',
    explanation: canAnalyze
      ? `Analisável (${c!.coverage}). ${c!.note}`
      : (c?.coverage === 'not_used' ? `Não usado por design (${domain}).` : `Não analisável: ${c?.reason || 'unknown'}.`),
  }
}

export function buildProviderReliabilityReport(): ProviderReliabilityReport {
  const providers = Object.keys(PROVIDERS).map(name => {
    const caps = getProviderCapabilities(name)
    const vals = Object.values(caps.domains)
    const fullDomains = vals.filter(v => v.coverage === 'full').length
    const partialDomains = vals.filter(v => v.coverage === 'partial' || v.coverage === 'limited').length
    const unavailableDomains = vals.filter(v => v.coverage === 'unavailable').length
    const notUsedDomains = vals.filter(v => v.coverage === 'not_used').length
    const overallReliability: Reliability = fullDomains >= 2 ? 'medium' : 'low'
    return { provider: name, fullDomains, partialDomains, unavailableDomains, notUsedDomains, overallReliability }
  })
  return {
    generatedAt: new Date().toISOString(),
    providers,
    limitations: ['Relatório reflete apenas a ingestão do backend (ESPN). Cobertura pré-jogo é majoritariamente indisponível.'],
  }
}

export { ALL_DOMAINS }
