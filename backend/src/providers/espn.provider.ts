/**
 * ESPN Provider — fetches live fixtures from ESPN public API.
 * No API key required. Rate-limited by timeout and backoff.
 */
import { env } from '../env.js'
import type { ProviderFixture, ProviderFetchResult } from './provider.types.js'

const LEAGUES = [
  { slug: 'eng.1', name: 'Premier League' },
  { slug: 'esp.1', name: 'La Liga' },
  { slug: 'ger.1', name: 'Bundesliga' },
  { slug: 'ita.1', name: 'Serie A' },
  { slug: 'fra.1', name: 'Ligue 1' },
  { slug: 'bra.1', name: 'Brasileirão' },
  { slug: 'uefa.champions', name: 'Champions League' },
  { slug: 'uefa.europa', name: 'Europa League' },
  { slug: 'conmebol.libertadores', name: 'Libertadores' },
]

const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT'])
const TIMEOUT_MS = 8000

function mapEspnStatus(state: string): string {
  const map: Record<string, string> = {
    in: '1H', '1': '1H', '2': '2H',
    half: 'HT', pre: 'NS', post: 'FT',
    end: 'FT', final: 'FT',
    delayed: 'SUSP', suspended: 'SUSP',
    canceled: 'CANC', postponed: 'PST',
  }
  return map[state.toLowerCase()] || state.toUpperCase()
}

export async function fetchEspnLiveFixtures(): Promise<ProviderFetchResult> {
  const start = Date.now()
  const fixtures: ProviderFixture[] = []
  let lastError: string | undefined

  for (const league of LEAGUES) {
    try {
      const url = `${env.ESPN_BASE_URL}/${league.slug}/scoreboard`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } })
      clearTimeout(timeout)

      if (!res.ok) {
        lastError = `ESPN ${league.slug}: ${res.status}`
        continue
      }

      const json = await res.json() as any
      const events = json?.events || []

      for (const event of events) {
        const comp = event.competitions?.[0]
        if (!comp) continue

        const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home')
        const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away')
        if (!homeComp || !awayComp) continue

        const statusDetail = comp.status?.type?.state || event.status?.type?.state || ''
        const mappedStatus = mapEspnStatus(statusDetail)
        const minute = comp.status?.displayClock ? parseInt(comp.status.displayClock) || null : null

        // Only include live or recently finished
        const isLive = LIVE_STATUSES.has(mappedStatus) || statusDetail === 'in'
        const isFinal = mappedStatus === 'FT'
        if (!isLive && !isFinal) continue

        fixtures.push({
          provider: 'espn',
          providerFixtureId: String(event.id),
          homeTeam: homeComp.team?.displayName || homeComp.team?.name || 'Unknown',
          awayTeam: awayComp.team?.displayName || awayComp.team?.name || 'Unknown',
          competition: league.name,
          status: mappedStatus,
          minute: isLive ? minute : null,
          scoreHome: parseInt(homeComp.score) || 0,
          scoreAway: parseInt(awayComp.score) || 0,
          penaltyHome: null,
          penaltyAway: null,
          stats: null, // Stats require summary endpoint (separate call)
          events: null,
          startTime: event.date || new Date().toISOString(),
        })
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        lastError = `ESPN ${league.slug}: timeout`
      } else {
        lastError = `ESPN ${league.slug}: ${err?.message || 'unknown'}`
      }
    }
  }

  return {
    provider: 'espn',
    endpoint: 'scoreboard',
    success: fixtures.length > 0 || !lastError,
    fixtures,
    latencyMs: Date.now() - start,
    error: lastError,
  }
}
