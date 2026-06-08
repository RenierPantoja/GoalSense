/**
 * API-Football Odds Provider Adapter (Phase D2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements OddsProviderAdapter for the API-Football (API-Sports) v3 API.
 * Uses the /odds endpoint to fetch real odds by fixture ID.
 *
 * RULES:
 * - Never invent odds. If the API returns nothing, return [].
 * - Never expose the API key outside this file.
 * - Respect ODDS_FETCH_TIMEOUT_MS.
 * - Log diagnostics (latency, status, market count) but never log the API key.
 */
import { env } from '../../env.js'
import type {
  OddsProviderAdapter,
  OddsProviderName,
  OddsMarketType,
  NormalizedOddsMarket,
} from './oddsProvider.types.js'

// ─── API-Football response types ─────────────────────────────────────────────

interface ApiFootballOddsValue {
  value: string
  odd: string
}

interface ApiFootballBet {
  id: number
  name: string
  values: ApiFootballOddsValue[]
}

interface ApiFootballBookmaker {
  id: number
  name: string
  bets: ApiFootballBet[]
}

interface ApiFootballOddsFixture {
  league: { id: number; name: string; season: number }
  fixture: { id: number; date: string }
  update: string
  bookmakers: ApiFootballBookmaker[]
}

interface ApiFootballOddsResponse {
  get: string
  parameters: Record<string, string>
  results: number
  response: ApiFootballOddsFixture[]
}

// ─── Market name mapping ─────────────────────────────────────────────────────

const MARKET_NAME_MAP: Record<string, OddsMarketType> = {
  'match winner': 'match_winner',
  'home/away': 'match_winner',
  'goals over/under': 'over_under_goals',
  'over/under': 'over_under_goals',
  'over under': 'over_under_goals',
  'both teams score': 'both_teams_score',
  'both teams to score': 'both_teams_score',
  'asian handicap': 'asian_handicap',
  'corners over under': 'corners',
  'total corners': 'corners',
  'cards over under': 'cards',
  'total cards': 'cards',
  'next goal': 'next_goal',
}

function mapBetNameToMarketType(betName: string): OddsMarketType {
  const key = betName.toLowerCase().trim()
  return MARKET_NAME_MAP[key] || 'custom_unknown'
}

// ─── Line extraction ─────────────────────────────────────────────────────────

/**
 * Extract a numeric line from a selection value like "Over 2.5" or "Under 3.5".
 */
function extractLine(value: string): number | undefined {
  const match = value.match(/[\d]+\.?\d*/);
  if (match) return parseFloat(match[0])
  return undefined
}

// ─── Adapter Implementation ─────────────────────────────────────────────────

export class ApiFootballOddsProvider implements OddsProviderAdapter {
  readonly name: OddsProviderName = 'api_football'

  private get apiKey(): string | undefined {
    return env.ODDS_API_KEY || env.API_FOOTBALL_KEY
  }

  private get baseUrl(): string {
    return 'https://v3.football.api-sports.io'
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  async fetchFixtureOdds(fixtureId: string, providerFixtureId?: string): Promise<NormalizedOddsMarket[]> {
    if (!this.isConfigured()) {
      console.warn('[ApiFootballOdds] Not configured — missing API key')
      return []
    }

    const targetId = providerFixtureId || fixtureId
    const url = `${this.baseUrl}/odds?fixture=${targetId}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), env.ODDS_FETCH_TIMEOUT_MS)
    const startTime = Date.now()

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'x-apisports-key': this.apiKey!,
          'Accept': 'application/json',
        },
      })

      const latency = Date.now() - startTime

      if (res.status === 429) {
        console.warn(`[ApiFootballOdds] Rate limited (429). Latency: ${latency}ms`)
        return []
      }

      if (!res.ok) {
        console.warn(`[ApiFootballOdds] HTTP ${res.status} from ${url}. Latency: ${latency}ms`)
        return []
      }

      const data: ApiFootballOddsResponse = await res.json()

      if (!data.response || data.response.length === 0) {
        console.info(`[ApiFootballOdds] No odds data for fixture ${targetId}. Latency: ${latency}ms`)
        return []
      }

      const markets = this.normalize(data)
      console.info(`[ApiFootballOdds] Fetched ${markets.length} markets for fixture ${targetId}. Latency: ${latency}ms`)
      return markets
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn(`[ApiFootballOdds] Timeout after ${env.ODDS_FETCH_TIMEOUT_MS}ms for fixture ${targetId}`)
      } else {
        console.error(`[ApiFootballOdds] Error fetching odds for fixture ${targetId}:`, err.message)
      }
      return []
    } finally {
      clearTimeout(timeout)
    }
  }

  async fetchAlertOdds(_alertId: string, _candidateMarkets: OddsMarketType[]): Promise<NormalizedOddsMarket[]> {
    // Delegated through odds.service.ts which calls fetchFixtureOdds
    // This method exists to satisfy the interface but is not called directly.
    return []
  }

  /**
   * Feasibility probe for the /odds/live endpoint (Phase D2.2).
   * Does NOT plug into the main flow. Returns diagnostic info only.
   * Used to decide whether D3 should be Live Odds Integration.
   */
  async probeLiveOddsEndpoint(providerFixtureId?: string): Promise<{
    available: boolean
    httpStatus: number | null
    requiresUpgrade: boolean
    marketsReturned: number
    bookmakersReturned: number
    latencyMs: number
    error?: string
    rawShapeNotes?: string
  }> {
    if (!this.isConfigured()) {
      return { available: false, httpStatus: null, requiresUpgrade: false, marketsReturned: 0, bookmakersReturned: 0, latencyMs: 0, error: 'Not configured' }
    }

    const url = providerFixtureId
      ? `${this.baseUrl}/odds/live?fixture=${providerFixtureId}`
      : `${this.baseUrl}/odds/live`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), env.ODDS_FETCH_TIMEOUT_MS)
    const startTime = Date.now()

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'x-apisports-key': this.apiKey!, 'Accept': 'application/json' },
      })
      const latencyMs = Date.now() - startTime

      // 403/plan errors indicate upgrade required
      const requiresUpgrade = res.status === 403 || res.status === 499

      if (!res.ok) {
        return { available: false, httpStatus: res.status, requiresUpgrade, marketsReturned: 0, bookmakersReturned: 0, latencyMs, error: `HTTP ${res.status}` }
      }

      const data: any = await res.json()
      // API-Football returns plan errors inside `errors` even with 200
      const hasErrors = data?.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0)
      if (hasErrors) {
        const errStr = JSON.stringify(data.errors).slice(0, 200)
        return { available: false, httpStatus: res.status, requiresUpgrade: errStr.toLowerCase().includes('plan') || errStr.toLowerCase().includes('subscription'), marketsReturned: 0, bookmakersReturned: 0, latencyMs, error: errStr }
      }

      const responseArr = Array.isArray(data?.response) ? data.response : []
      let bookmakers = 0
      let markets = 0
      for (const entry of responseArr) {
        const bms = entry.bookmakers || entry.odds || []
        bookmakers += Array.isArray(bms) ? bms.length : 0
        for (const bm of (Array.isArray(bms) ? bms : [])) {
          markets += (bm.bets || bm.odds || []).length
        }
      }

      return {
        available: responseArr.length > 0,
        httpStatus: res.status,
        requiresUpgrade: false,
        marketsReturned: markets,
        bookmakersReturned: bookmakers,
        latencyMs,
        rawShapeNotes: `response[${responseArr.length}]`,
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime
      return { available: false, httpStatus: null, requiresUpgrade: false, marketsReturned: 0, bookmakersReturned: 0, latencyMs, error: err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unknown') }
    } finally {
      clearTimeout(timeout)
    }
  }

  normalize(raw: unknown): NormalizedOddsMarket[] {
    const data = raw as ApiFootballOddsResponse
    if (!data?.response || !Array.isArray(data.response)) return []

    const markets: NormalizedOddsMarket[] = []
    const now = new Date().toISOString()

    for (const entry of data.response) {
      const providerFixtureId = String(entry.fixture?.id || '')
      const capturedAt = entry.update || now

      for (const bookmaker of entry.bookmakers || []) {
        for (const bet of bookmaker.bets || []) {
          const marketType = mapBetNameToMarketType(bet.name)

          for (const val of bet.values || []) {
            const oddsNum = parseFloat(val.odd)
            if (isNaN(oddsNum) || oddsNum <= 0) continue // skip invalid / suspended

            const line = extractLine(val.value)

            markets.push({
              provider: 'api_football',
              providerFixtureId,
              bookmaker: bookmaker.name,
              marketType,
              selection: val.value,
              line,
              odds: oddsNum,
              capturedAt,
            })
          }
        }
      }
    }

    return markets
  }
}
