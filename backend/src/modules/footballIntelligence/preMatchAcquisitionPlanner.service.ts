/**
 * Pre-Match Acquisition Planner (B40).
 * ─────────────────────────────────────────────────────────────────────────────
 * For each of TODAY's selected fixtures, decides WHAT to fetch and WHEN, across the
 * temporal windows T-24h / T-6h / T-90min / T-60min / T-15min / live / post. Only
 * today's MatchDayScope fixtures; never the whole world. Lineup before its window =
 * not_available_yet (not a failure). Unsupported domains are not retried forever.
 */
import { createRepositories } from '../../repositories/index.js'
import { selectFixturesForAnalysis } from './matchDayScope.service.js'
import { getProvidersForDomain, listRegisteredProviders } from './providers/providerRegistry.service.js'
import type { AcquisitionDomain } from './providers/provider.types.js'
import type { PreMatchAcquisitionTask, AcquisitionWindow } from './preMatchAcquisition.types.js'

const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P']
const FINISHED = ['FT', 'AET', 'PEN']

const WINDOW_DOMAINS: Record<AcquisitionWindow, AcquisitionDomain[]> = {
  'T-24h': ['fixture_details', 'competition_context', 'standings', 'team_form', 'head_to_head', 'squads', 'injuries', 'suspensions'],
  'T-6h': ['injuries', 'suspensions', 'competition_context', 'probable_lineups'],
  'T-90min': ['probable_lineups', 'confirmed_lineups', 'injuries', 'suspensions'],
  'T-60min': ['confirmed_lineups'],
  'T-15min': ['confirmed_lineups'],
  'live': ['live_events', 'live_stats'],
  'post': ['post_match_stats'],
}

const WINDOW_PRIORITY: Record<AcquisitionWindow, PreMatchAcquisitionTask['priority']> = {
  'T-24h': 'low', 'T-6h': 'medium', 'T-90min': 'high', 'T-60min': 'critical', 'T-15min': 'critical', 'live': 'high', 'post': 'low',
}

export function currentWindow(minutesToKickoff: number | null, status: string): AcquisitionWindow | null {
  if (FINISHED.includes(status)) return 'post'
  if (LIVE.includes(status)) return 'live'
  if (minutesToKickoff == null) return 'T-24h'
  if (minutesToKickoff <= 15) return 'T-15min'
  if (minutesToKickoff <= 60) return 'T-60min'
  if (minutesToKickoff <= 90) return 'T-90min'
  if (minutesToKickoff <= 360) return 'T-6h'
  return 'T-24h'
}

/** A lineup domain is "not available yet" when we are still earlier than its window. */
function isLineupNotAvailableYet(domain: AcquisitionDomain, minutesToKickoff: number | null): boolean {
  if (minutesToKickoff == null) return domain === 'confirmed_lineups' || domain === 'probable_lineups'
  if (domain === 'confirmed_lineups') return minutesToKickoff > 90
  if (domain === 'probable_lineups') return minutesToKickoff > 360
  return false
}

export async function planAcquisitionForFixture(fixtureId: string, now: Date = new Date()): Promise<PreMatchAcquisitionTask[]> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return []
  const kickoff = fixture.startTime ? new Date(fixture.startTime).getTime() : null
  const minutesToKickoff = kickoff != null ? Math.round((kickoff - now.getTime()) / 60000) : null
  const window = currentWindow(minutesToKickoff, fixture.status)
  if (!window) return []

  const domains = WINDOW_DOMAINS[window]
  const nowIso = now.toISOString()
  return domains.map(domain => {
    const providers = getProvidersForDomain(domain).map(p => p.providerName)
    const declared = listRegisteredProviders().some(p => p.domains.includes(domain))
    let status: PreMatchAcquisitionTask['status'] = 'scheduled'
    const limitations: string[] = []
    if (isLineupNotAvailableYet(domain, minutesToKickoff)) { status = 'not_available_yet'; limitations.push('Janela de escalação ainda não chegou.') }
    else if (!declared) { status = 'skipped_unsupported'; limitations.push('Nenhum provider declara suporte (provider_not_supported).') }
    else if (providers.length === 0) { status = 'skipped_unsupported'; limitations.push('Nenhum provider configurado (provider_not_configured).') }
    return {
      fixtureId, domain, window, scheduledFor: nowIso, priority: WINDOW_PRIORITY[window],
      reason: `Janela ${window} para ${domain}.`, providerCandidates: providers, status,
      lastRunAt: null, resultAvailability: null, limitations,
    }
  })
}

export async function planAcquisitionForToday(now: Date = new Date(), max?: number): Promise<{ fixtureId: string; tasks: PreMatchAcquisitionTask[] }[]> {
  const fixtures = await selectFixturesForAnalysis(now, max).catch(() => [])
  const out: { fixtureId: string; tasks: PreMatchAcquisitionTask[] }[] = []
  for (const f of fixtures) {
    const tasks = await planAcquisitionForFixture(f.fixtureId, now).catch(() => [])
    out.push({ fixtureId: f.fixtureId, tasks })
  }
  return out
}
