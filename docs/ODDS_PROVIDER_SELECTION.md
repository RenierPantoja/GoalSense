# Odds Provider Selection Prep (Phase D1.1)

## Overview
This document evaluates the leading candidate providers for odds intelligence integration in Phase D2.
Our requirements demand a provider that can map live fixtures accurately, update odds quickly (real-time/live), and provide standard markets like Over/Under, Corners, Match Winner, and Cards.

## 1. API-Football (Current API)
We already use API-Football for fixtures and live events.
* **Prós**: Fixture IDs will map 1:1 perfectly, no complex resolution needed. We already have the API structure configured.
* **Contras**: Live odds endpoints are sometimes delayed or miss certain lower-tier leagues. Heavy usage of live odds endpoints might require a more expensive plan depending on frequency.
* **Cobertura**: Good coverage, matches our fixture list exactly.
* **Mercados**: Covers goals, winners, asian handicap. Corners/cards might be limited for some leagues.

## 2. The Odds API
* **Prós**: Excellent aggregation of multiple bookmakers. Good for finding the absolute best odds across the market.
* **Contras**: Fixture IDs are completely different from API-Football. We would need a fuzzy-matching system (e.g., matching by team names and kickoff time) which is prone to errors.
* **Cobertura**: Strongest in major leagues, might lack niche live matches.
* **Custo**: Often priced per request, aggregating multiple books is expensive.

## 3. Sportmonks
* **Prós**: Extremely robust for betting data specifically. Real-time updates via websocket available.
* **Contras**: Same as The Odds API: fixture ID mismatch. Requires building a mapper.
* **Cobertura**: Very high.

## 4. Betfair / Pinnacle (Direct API)
* **Prós**: The gold standard for sharp odds and high limits.
* **Contras**: Strict compliance, API limits, heavy restrictions depending on geolocation. Highly complex JSON structures.

## Recommendation for Phase D2
**API-Football** is the recommended starting point for D2.
Since we already rely on API-Football for the `fixtureId`, using their `/odds` endpoint allows us to bypass the complex and error-prone "Fixture ID Mapping" problem entirely. We can pass the `providerFixtureId` directly. If in the future we need sharper odds, we can build a fuzzy mapper, but for D2, API-Football provides the cleanest path to MVP.

> **Status (D2 Complete):** The `ApiFootballOddsProvider` adapter is now implemented and integrated in `apiFootballOdds.provider.ts`. It calls `GET https://v3.football.api-sports.io/odds?fixture={id}` with the `x-apisports-key` header, normalizes the response to `NormalizedOddsMarket[]`, and gracefully handles rate limits, timeouts, and empty responses.

## Provider Contract
Any provider must implement the `OddsProviderAdapter` interface defined in `oddsProvider.types.ts`:
```typescript
export interface OddsProviderAdapter {
  name: OddsProviderName
  isConfigured(): boolean
  fetchFixtureOdds(fixtureId: string, providerFixtureId?: string): Promise<NormalizedOddsMarket[]>
  fetchAlertOdds(alertId: string, candidateMarkets: OddsMarketType[]): Promise<NormalizedOddsMarket[]>
  normalize(raw: unknown): NormalizedOddsMarket[]
}
```

### Dealing with Complexities:
* **Missing Markets**: If a market isn't available, `fetchFixtureOdds` should simply omit it from the returned array. The UI handles empty arrays gracefully.
* **Suspended Odds**: Suspended odds should not be returned, or they should be filtered out during the `normalize` phase.
* **Decimal Odds**: The `normalize` function must enforce `Float` format (decimal). Fractional or moneyline must be converted.

## No-Goes (Current Limits)
- No auto-execution (betting).
- No affiliate links/redirects to bookmakers.
- No stake calculation.
- Odds are not embedded into Telegram signals.
