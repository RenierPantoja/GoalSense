import { env } from '../../env.js'
import type { OddsProviderName, OddsProviderResponse } from './oddsProvider.types.js'
import { ApiFootballOddsProvider } from './apiFootballOdds.provider.js'

/**
 * Abstraction layer for fetching odds from external providers.
 * Phase D2: Routes to ApiFootballOddsProvider when configured.
 */

const apiFootballProvider = new ApiFootballOddsProvider()

export function getConfiguredProvider(): OddsProviderName {
  if (env.ODDS_ENABLED !== 'true') return 'none'
  const name = env.ODDS_PROVIDER?.toLowerCase()
  if (name === 'api_football') return 'api_football'
  if (name === 'odds_api') return 'odds_api'
  if (name === 'sportmonks') return 'sportmonks'
  return 'none'
}

export function getResolvedApiKey(): string | undefined {
  return env.ODDS_API_KEY || env.API_FOOTBALL_KEY
}

export async function fetchLiveOdds(fixtureId: string, providerFixtureId?: string): Promise<OddsProviderResponse> {
  const provider = getConfiguredProvider()

  if (provider === 'none') {
    return { success: false, markets: [], error: 'Odds intelligence disabled or provider set to none' }
  }

  if (provider === 'api_football') {
    if (!apiFootballProvider.isConfigured()) {
      return { success: false, markets: [], error: 'API-Football odds key not configured. Set ODDS_API_KEY or API_FOOTBALL_KEY.' }
    }

    const markets = await apiFootballProvider.fetchFixtureOdds(fixtureId, providerFixtureId)

    if (markets.length === 0) {
      return { success: false, markets: [], error: 'No odds available from API-Football for this fixture' }
    }

    return { success: true, markets }
  }

  // Future providers
  return {
    success: false,
    markets: [],
    error: `Provider ${provider} is not yet implemented.`,
  }
}
