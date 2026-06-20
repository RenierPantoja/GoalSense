/**
 * Provider Entity Mapping Derivation (B43).
 * ─────────────────────────────────────────────────────────────────────────────
 * Derives team/competition mappings ONLY from CONFIRMED fixture mappings (real
 * co-occurrence evidence), never from names alone. Same ESPN entity → same external
 * id across ≥ N confirmed fixtures may auto-confirm; divergence → ambiguous; below
 * threshold → candidate. The pure core is unit-tested without any provider.
 */
import { randomUUID } from 'node:crypto'
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { getAdapter } from '../providers/providerRegistry.service.js'
import { normalizeTeamName, normalizeCompetitionName } from './providerIdentity.util.js'
import type {
  ProviderTeamMapping, ProviderCompetitionMapping, EntityMappingDerivationRun, EntityMappingStatus, ConfidenceBand,
} from './providerIdentity.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
export function isDerivationEnabled(): boolean { return flag(env.ENABLE_ENTITY_MAPPING_DERIVATION) }

export interface TeamPair { espnTeamName: string; apiTeamId: string | null; apiTeamName: string; fixtureId: string; country: string | null }
export interface CompetitionPair { espnCompetition: string; apiLeagueId: string | null; apiCompetitionName: string; season: string | null; country: string | null; fixtureId: string }

export interface DeriveOptions { minFixtures: number; autoConfirm: boolean }

function band(score: number): ConfidenceBand { return score >= 0.9 ? 'high' : score >= 0.7 ? 'medium' : score > 0 ? 'low' : 'unknown' }

/** PURE: group team pairs by normalized ESPN name; classify by external-id agreement. */
export function deriveTeamMappingsFromPairs(pairs: TeamPair[], opts: DeriveOptions, secondaryProvider = 'api_football'): ProviderTeamMapping[] {
  const groups = new Map<string, TeamPair[]>()
  for (const p of pairs) {
    if (!p.espnTeamName || !p.apiTeamId) continue
    const key = normalizeTeamName(p.espnTeamName)
    if (!key) continue
    const arr = groups.get(key) || []; arr.push(p); groups.set(key, arr)
  }
  const out: ProviderTeamMapping[] = []
  const ts = new Date().toISOString()
  for (const [key, arr] of groups.entries()) {
    const byId = new Map<string, TeamPair[]>()
    for (const p of arr) { const a = byId.get(p.apiTeamId as string) || []; a.push(p); byId.set(p.apiTeamId as string, a) }
    const distinct = [...byId.entries()].sort((a, b) => b[1].length - a[1].length)
    const top = distinct[0]
    const matchedFixtures = [...new Set(top[1].map(p => p.fixtureId))]
    const conflictingFixtures = distinct.slice(1).flatMap(([, ps]) => ps.map(p => p.fixtureId))
    let status: EntityMappingStatus
    let score: number
    if (distinct.length > 1) { status = 'ambiguous'; score = 0.5 }
    else if (matchedFixtures.length >= opts.minFixtures) { status = opts.autoConfirm ? 'auto_confirmed' : 'candidate'; score = 0.92 }
    else { status = 'candidate'; score = 0.75 }
    out.push({
      id: `ptm_${secondaryProvider}_${key.replace(/\s+/g, '_').slice(0, 40)}`,
      canonicalTeamId: key, canonicalTeamName: top[1][0].espnTeamName,
      primaryProvider: 'espn', primaryProviderTeamId: null,
      secondaryProvider, secondaryProviderTeamId: status === 'ambiguous' ? null : top[0], secondaryProviderTeamName: top[1][0].apiTeamName,
      country: top[1][0].country, competitionHints: [],
      status, confidenceScore: score, confidenceBand: band(score), strength: 'fixture_derived',
      matchedFixtures, conflictingFixtures, matchedFields: ['fixture_co_occurrence'],
      conflictingFields: distinct.length > 1 ? ['multiple_external_ids'] : [],
      limitations: distinct.length > 1 ? ['Mesmo time ESPN mapeou para múltiplos ids externos — ambíguo, requer operador.'] : (status === 'candidate' ? ['Poucas fixtures confirmadas — confirmar manualmente para desbloquear.'] : []),
      audit: [{ at: ts, by: status === 'auto_confirmed' ? 'system_auto' : null, action: status === 'auto_confirmed' ? 'auto_confirmed' : 'created' }],
      createdAt: ts, updatedAt: ts, confirmedAt: status === 'auto_confirmed' ? ts : null, confirmedBy: status === 'auto_confirmed' ? 'system_auto' : null,
    })
  }
  return out
}

/** PURE: same logic for competitions (league id agreement). */
export function deriveCompetitionMappingsFromPairs(pairs: CompetitionPair[], opts: DeriveOptions, secondaryProvider = 'api_football'): ProviderCompetitionMapping[] {
  const groups = new Map<string, CompetitionPair[]>()
  for (const p of pairs) {
    if (!p.espnCompetition || !p.apiLeagueId) continue
    const key = normalizeCompetitionName(p.espnCompetition)
    if (!key) continue
    const arr = groups.get(key) || []; arr.push(p); groups.set(key, arr)
  }
  const out: ProviderCompetitionMapping[] = []
  const ts = new Date().toISOString()
  for (const [key, arr] of groups.entries()) {
    const byId = new Map<string, CompetitionPair[]>()
    for (const p of arr) { const a = byId.get(p.apiLeagueId as string) || []; a.push(p); byId.set(p.apiLeagueId as string, a) }
    const distinct = [...byId.entries()].sort((a, b) => b[1].length - a[1].length)
    const top = distinct[0]
    const matchedFixtures = [...new Set(top[1].map(p => p.fixtureId))]
    let status: EntityMappingStatus; let score: number
    if (distinct.length > 1) { status = 'ambiguous'; score = 0.5 }
    else if (matchedFixtures.length >= opts.minFixtures) { status = opts.autoConfirm ? 'auto_confirmed' : 'candidate'; score = 0.92 }
    else { status = 'candidate'; score = 0.75 }
    out.push({
      id: `pcm_${secondaryProvider}_${key.replace(/\s+/g, '_').slice(0, 40)}`,
      canonicalCompetitionId: key, canonicalCompetitionName: top[1][0].espnCompetition,
      primaryProvider: 'espn', primaryProviderCompetitionId: null,
      secondaryProvider, secondaryProviderCompetitionId: status === 'ambiguous' ? null : top[0], secondaryProviderCompetitionName: top[1][0].apiCompetitionName,
      country: top[1][0].country, season: top[1][0].season, type: null,
      status, confidenceScore: score, confidenceBand: band(score), strength: 'fixture_derived',
      matchedFixtures, conflictingFixtures: distinct.slice(1).flatMap(([, ps]) => ps.map(p => p.fixtureId)),
      limitations: distinct.length > 1 ? ['Mesma competição ESPN mapeou para múltiplas ligas externas — ambíguo.'] : (status === 'candidate' ? ['Poucas fixtures confirmadas — confirmar manualmente.'] : []),
      audit: [{ at: ts, by: status === 'auto_confirmed' ? 'system_auto' : null, action: status === 'auto_confirmed' ? 'auto_confirmed' : 'created' }],
      createdAt: ts, updatedAt: ts, confirmedAt: status === 'auto_confirmed' ? ts : null, confirmedBy: status === 'auto_confirmed' ? 'system_auto' : null,
    })
  }
  return out
}

function opts(): DeriveOptions {
  return { minFixtures: Math.max(1, Number(env.TEAM_MAPPING_MIN_CONFIRMED_FIXTURES) || 2), autoConfirm: flag(env.ENTITY_MAPPING_AUTO_CONFIRM) }
}

export async function deriveEntityMappings(secondaryProvider = 'api_football'): Promise<EntityMappingDerivationRun> {
  const repos = createRepositories()
  const run: EntityMappingDerivationRun = {
    id: `emd_${randomUUID()}`, startedAt: new Date().toISOString(), completedAt: null, secondaryProvider,
    confirmedFixtureMappingsScanned: 0, teamCandidates: 0, teamAutoConfirmed: 0, teamAmbiguous: 0,
    competitionCandidates: 0, competitionAutoConfirmed: 0, competitionAmbiguous: 0, errors: [], status: 'completed', limitations: [],
  }
  if (!isDerivationEnabled()) { run.status = 'disabled'; run.completedAt = new Date().toISOString(); run.limitations.push('Derivação desabilitada.'); await repos.intelligence.createEntityMappingDerivationRun(run).catch(() => {}); return run }

  const adapter = getAdapter(secondaryProvider)
  if (!adapter || !adapter.isConfigured()) { run.status = 'provider_not_configured'; run.completedAt = new Date().toISOString(); run.limitations.push(`Provider ${secondaryProvider} não configurado — não chamado.`); await repos.intelligence.createEntityMappingDerivationRun(run).catch(() => {}); return run }

  const confirmed = [
    ...(await repos.intelligence.listProviderMappingsByStatus('manually_confirmed', 500).catch(() => [])),
    ...(await repos.intelligence.listProviderMappingsByStatus('auto_confirmed', 500).catch(() => [])),
  ].filter(m => m.identityType === 'fixture' && m.secondaryProvider === secondaryProvider)
  run.confirmedFixtureMappingsScanned = confirmed.length

  // Index API-Football fixtures per date (reuses the documented today_fixtures call).
  const teamPairs: TeamPair[] = []
  const compPairs: CompetitionPair[] = []
  const dateCache = new Map<string, Map<string, any>>()
  for (const m of confirmed) {
    try {
      const espn = await repos.fixtures.findById(m.primaryProviderEntityId).catch(() => null)
      if (!espn || !espn.startTime) continue
      const date = new Date(espn.startTime).toISOString().slice(0, 10)
      if (!dateCache.has(date)) {
        const res = await adapter.fetchDomain('today_fixtures', { date }).catch(() => null)
        const list = (res?.canonicalData as any)?.fixtures || []
        const idx = new Map<string, any>(); for (const f of list) idx.set(String(f.id), f)
        dateCache.set(date, idx)
      }
      const apiFx = dateCache.get(date)!.get(String(m.secondaryProviderEntityId))
      if (!apiFx) continue
      teamPairs.push({ espnTeamName: espn.homeName, apiTeamId: apiFx.homeTeamId ?? null, apiTeamName: apiFx.home, fixtureId: m.primaryProviderEntityId, country: apiFx.country })
      teamPairs.push({ espnTeamName: espn.awayName, apiTeamId: apiFx.awayTeamId ?? null, apiTeamName: apiFx.away, fixtureId: m.primaryProviderEntityId, country: apiFx.country })
      compPairs.push({ espnCompetition: espn.competition, apiLeagueId: apiFx.leagueId ?? null, apiCompetitionName: apiFx.competition, season: apiFx.season ?? null, country: apiFx.country, fixtureId: m.primaryProviderEntityId })
    } catch (e: any) { run.errors.push(String(e?.message || e).slice(0, 50)) }
  }

  const teamMaps = deriveTeamMappingsFromPairs(teamPairs, opts(), secondaryProvider)
  const compMaps = deriveCompetitionMappingsFromPairs(compPairs, { ...opts(), minFixtures: Math.max(1, Number(env.COMPETITION_MAPPING_MIN_CONFIRMED_FIXTURES) || 2) }, secondaryProvider)

  for (const tm of teamMaps) {
    const existing = await repos.intelligence.getProviderTeamMapping(tm.id).catch(() => null)
    if (existing && (existing.status === 'rejected' || existing.status === 'manually_confirmed')) continue // respect operator decisions
    await repos.intelligence.saveProviderTeamMapping(tm).catch(() => {})
    if (tm.status === 'auto_confirmed') run.teamAutoConfirmed++; else if (tm.status === 'ambiguous') run.teamAmbiguous++; else run.teamCandidates++
  }
  for (const cm of compMaps) {
    const existing = await repos.intelligence.getProviderCompetitionMapping(cm.id).catch(() => null)
    if (existing && (existing.status === 'rejected' || existing.status === 'manually_confirmed')) continue
    await repos.intelligence.saveProviderCompetitionMapping(cm).catch(() => {})
    if (cm.status === 'auto_confirmed') run.competitionAutoConfirmed++; else if (cm.status === 'ambiguous') run.competitionAmbiguous++; else run.competitionCandidates++
  }

  if (run.teamAmbiguous > 0 || run.competitionAmbiguous > 0 || run.errors.length > 0) run.status = 'completed_with_limitations'
  run.completedAt = new Date().toISOString()
  await repos.intelligence.createEntityMappingDerivationRun(run).catch(() => {})
  return run
}
