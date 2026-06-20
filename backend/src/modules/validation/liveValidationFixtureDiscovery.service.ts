/**
 * Live Validation Fixture Discovery (Phase B37) — read-only, guard-respecting.
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds fixtures eligible for a session from ALREADY-collected data
 * (`fixtures.listLive`), filtered by the session scope and bounded by the local
 * fixture cap. NEVER calls a provider, never invents fixtures. Provider/coverage
 * absent → empty list with a limitation (not a failure).
 */
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import type { LiveValidationFixtureScope } from './liveValidation.types.js'

const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT']
const HISTORICAL_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'FT', 'AET', 'PEN', 'P', 'NS']

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
function matchesNames(list: string[] | undefined, value: string): boolean {
  if (!list || list.length === 0) return true
  const v = norm(value)
  return list.some(x => { const n = norm(x); return n === v || (n.length >= 4 && v.includes(n)) || (v.length >= 4 && n.includes(v)) })
}

export interface DiscoveredFixture {
  fixtureId: string; providerFixtureId: string | null; homeTeam: string; awayTeam: string
  competition: string; kickoffAt: string | null; status: string
}

export interface DiscoveryResult { fixtures: DiscoveredFixture[]; limitations: string[] }

export async function discoverSessionFixtures(scope: LiveValidationFixtureScope): Promise<DiscoveryResult> {
  const repos = createRepositories()
  const limitations: string[] = []
  const cap = Math.min(scope.maxFixtures ?? env.LOCAL_MAX_LIVE_FIXTURES, env.LOCAL_MAX_LIVE_FIXTURES)

  // Explicit fixtureIds → resolve each (read-only).
  if (scope.fixtureIds && scope.fixtureIds.length > 0) {
    const out: DiscoveredFixture[] = []
    for (const fid of scope.fixtureIds.slice(0, cap)) {
      try {
        const fx = await repos.fixtures.findById(fid)
        if (fx) out.push(toDiscovered(fx))
        else limitations.push(`Fixture ${fid} não encontrada no backend.`)
      } catch { limitations.push(`Falha ao ler fixture ${fid}.`) }
    }
    if (out.length === 0) limitations.push('Nenhuma fixture explícita resolvida (cobertura ausente, não é falha).')
    return { fixtures: out, limitations }
  }

  // Otherwise list live (or scheduled-inclusive) and filter by names.
  const statuses = scope.includeScheduled ? HISTORICAL_STATUSES : LIVE_STATUSES
  let live: any[] = []
  try { live = await repos.fixtures.listLive(statuses, 200) }
  catch { limitations.push('Não foi possível listar jogos (provider/persistência indisponível).'); return { fixtures: [], limitations } }

  let filtered = live.filter((fx: any) => {
    if (scope.excludeFinished && (fx.status === 'FT' || fx.status === 'AET' || fx.status === 'PEN')) return false
    if (!matchesNames(scope.leagueNames, fx.competition || '')) return false
    if (scope.teamNames && scope.teamNames.length > 0) {
      const home = matchesNames(scope.teamNames, fx.homeName || '')
      const away = matchesNames(scope.teamNames, fx.awayName || '')
      if (!home && !away) return false
    }
    return true
  })

  if (filtered.length > cap) { limitations.push(`Escopo reduzido ao cap local de ${cap} jogos (guard B31 respeitado).`); filtered = filtered.slice(0, cap) }
  if (filtered.length === 0) limitations.push('Nenhum jogo elegível no escopo agora (cobertura ausente, não é falha).')

  return { fixtures: filtered.map(toDiscovered), limitations }
}

function toDiscovered(fx: any): DiscoveredFixture {
  return {
    fixtureId: String(fx.id), providerFixtureId: fx.providerFixtureId ?? null,
    homeTeam: fx.homeName || 'unknown', awayTeam: fx.awayName || 'unknown',
    competition: fx.competition || 'unknown',
    kickoffAt: fx.startTime ? (fx.startTime instanceof Date ? fx.startTime.toISOString() : String(fx.startTime)) : null,
    status: fx.status || 'NS',
  }
}
