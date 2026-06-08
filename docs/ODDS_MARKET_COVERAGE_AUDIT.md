# Odds Market Coverage Audit

## Overview

Phase D2.1 adds tooling to audit what the odds provider (API-Football) actually delivers — which markets, which bookmakers, and compatibility with each alert pattern type. No EV/ROI, no betting recommendations.

## How to Run the Audit

### Prerequisites
```
ODDS_ENABLED=true
ODDS_PROVIDER=api_football
ODDS_API_KEY=your_key   # or falls back to API_FOOTBALL_KEY
```

### Routes

| Route | Description |
|-------|-------------|
| `GET /api/odds/status` | Provider config: enabled, provider, configured |
| `GET /api/odds/audit/fixture/:fixtureId` | Coverage report + alert compatibility for one fixture |
| `GET /api/odds/audit/live?limit=10` | Coverage reports for recent live/upcoming fixtures + summary |

## Coverage Report

```typescript
interface MarketCoverageReport {
  fixtureId: string
  matchLabel: string
  competition: string
  status: string
  marketsFound: OddsMarketType[]
  bookmakersFound: string[]
  hasMatchWinner: boolean
  hasOverUnderGoals: boolean
  hasBothTeamsScore: boolean
  hasCorners: boolean
  hasCards: boolean
  hasAsianHandicap: boolean
  hasNextGoal: boolean
  unknownMarkets: number
  totalOdds: number
  oddsTiming: 'pre_match' | 'live' | 'unknown'
  capturedAt: string | null
  warnings: string[]
}
```

## Alert → Market Compatibility

| Pattern Type | Candidate Markets | Notes |
|-------------|-------------------|-------|
| goal_pressure | over_under_goals, next_goal, both_teams_score | next_goal rarely in pre-match |
| late_goal | over_under_goals, next_goal, both_teams_score | same |
| over_trend | over_under_goals, next_goal, both_teams_score | over_under widely available |
| corner_pressure | corners | corners often requires higher plan |
| card_heat | cards | cards often requires higher plan |
| favorite_risk | match_winner, asian_handicap | widely available pre-match |
| underdog_threat | match_winner, asian_handicap | widely available pre-match |

Support levels:
- `supported` — all candidate markets found
- `partially_supported` — some found
- `unsupported` — none found

## Odds Timing

- The `/odds` endpoint returns **pre-match** odds
- Live/in-play odds would require `/odds/live` (higher plan)
- For live matches queried via `/odds`, timing is marked `unknown` with warning `live_match_but_prematch_odds_endpoint`

## Snapshot Quality

```typescript
interface OddsSnapshotQuality {
  hasBookmaker, hasMarketType, hasSelection, hasValidOdds, hasCapturedAt: boolean
  timing: 'pre_match' | 'live' | 'unknown'
  quality: 'usable' | 'partial' | 'unusable'
  warnings: string[]
}
```

- `usable` — valid odds + selection + bookmaker + known market
- `partial` — valid odds but missing bookmaker or unknown market
- `unusable` — invalid odds or no selection

## Known Limitations

- Coverage depends on API-Football plan tier
- Corners/cards markets often require higher plans
- Live odds (`/odds/live`) not used in this phase
- `next_goal` market rarely available pre-match
- Bookmaker coverage varies by competition

## What This Phase Does NOT Do

- No EV (expected value) calculation
- No ROI estimation
- No stake recommendations
- No "value bet" labeling
- No betting house links
- No odds sent to Telegram

## Recommendations for D3

1. Confirm plan tier supports corners/cards before relying on those alert types
2. Consider `/odds/live` endpoint if live odds needed (check plan)
3. Focus odds intelligence on match_winner + over_under_goals (best coverage)
4. Treat corner/card odds as best-effort, not guaranteed

## Runtime Validation (Phase D2.2)

### How to run the runtime audit locally

1. Configure `.env`:
   ```
   ODDS_ENABLED=true
   ODDS_PROVIDER=api_football
   ODDS_API_KEY=your_key   # or API_FOOTBALL_KEY
   DATABASE_URL=postgresql://...
   ```
2. Start backend: `npm run dev`
3. Ensure DB has fixtures (run live monitor or seed)
4. Run the audit script:
   ```
   node scripts/runOddsAudit.mjs --limit 15
   ```

The script hits:
- `GET /api/odds/status`
- `GET /api/odds/audit/live?limit=N`
- `GET /api/odds/audit/live-feasibility`

And prints per-fixture coverage + a D3 recommendation.

### Coverage Summary structure
```typescript
{
  fixturesTested, fixturesWithOdds, fixturesWithoutOdds,
  marketCoveragePercent, bookmakerAverage,
  coverageByMarket: { match_winner, over_under_goals, both_teams_score, corners, cards, asian_handicap },
  strongSupportedAlertTypes, weakSupportedAlertTypes, unsupportedAlertTypes,
  recommendationForD3,
}
```

### D3 Decision Framework
| Coverage condition | Recommendation |
|--------------------|----------------|
| ≥60% with corners/cards | D3 — Pre-Match Odds Context Only (full markets) |
| ≥60% match_winner+O/U only | D3 — Pre-Match Odds Context Only (limited niche) |
| <30% coverage | D3 — Add Secondary Odds Provider |
| Otherwise | D3 — Odds UI Refinement Only |

### /odds/live Feasibility Probe
`GET /api/odds/audit/live-feasibility?fixtureId=...` runs `probeLiveOddsEndpoint()`:
- Returns `available`, `httpStatus`, `requiresUpgrade`, `marketsReturned`, `bookmakersReturned`, `latencyMs`
- `requiresUpgrade=true` (403 or plan error) → /odds/live needs higher plan → D3 stays pre-match
- `available=true` → D3 Live Odds Integration is feasible
- Does NOT plug into main flow — diagnostic only

### Runtime Results

> **PENDING USER RUN** — The runtime tables below must be filled by running
> `node scripts/runOddsAudit.mjs` locally with a valid key and populated DB.
> Code and routes are ready; actual coverage data requires a live API key.

| Fixture | Liga | Status | Odds? | Bookmakers | MW | O/U | BTTS | Corners | Cards | AH | Timing | Warnings |
|---------|------|--------|-------|------------|----|----|------|---------|-------|----|----|----------|
| _(run script to populate)_ | | | | | | | | | | | | |
