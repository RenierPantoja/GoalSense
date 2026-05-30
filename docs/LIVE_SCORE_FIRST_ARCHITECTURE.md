# Live Score-First Architecture

## Philosophy

Score, status, and minute are the most critical live data. They must update globally and frequently. Stats, events, pressure graphs, and narration are detail data that loads on demand.

## Current Architecture (Already Implemented)

### Score Layer (Global, Lightweight, Frequent)

```
ESPN Scoreboard (/api/espn-live) → getLiveFixtures() → reconcileAllFixtureScores() → All Surfaces
                                                              ↑
                                              liveScoreCache (fed by Match Detail + Command Center)
```

- **Endpoint**: `/api/espn-live` — returns all fixtures with score/status/minute
- **Cache-Control**: `max-age=5` (Netlify CDN)
- **Client fetch**: `cache: 'no-store'`
- **Polling**: Adaptive (10s critical, 15s normal, 45s idle)
- **Dedup**: `deduplicateIntraProvider` + `finalDeduplicateFixtures`
- **Score reconciliation**: `reconcileAllFixtureScores()` applies cached event-confirmed scores

### Detail Layer (On-Demand, Heavy)

```
ESPN Summary (/apis/site/v2/sports/soccer/all/summary?event=ID) → Stats + Events + Commentary
```

- **Fetched by**: Match Detail (for opened match), Command Center (for top 15 monitored)
- **Contains**: boxscore stats, keyEvents, commentary, rosters, linescores
- **Feeds**: liveScoreCache (goal events), statsMap, eventsMap, pressure graph

### Separation

| Data | Source | Frequency | Scope |
|------|--------|-----------|-------|
| Score/Status/Minute | Scoreboard | 10-15s | All live fixtures |
| Penalty Score | Scoreboard + Summary | 5-15s | Fixtures in P/PEN status |
| Stats | Summary | 12-25s | Top 15 monitored (Command Center) |
| Events/Timeline | Summary | 8-12s | Opened match (Match Detail) |
| Pressure Graph | Summary events | 8-12s | Opened match |
| Commentary | Summary | 12s | Opened match |

## Polling Strategy

| Surface | Score/Status | Stats/Events |
|---------|-------------|--------------|
| Live Radar | 10s (critical) / 15s (normal) | Not fetched |
| Matches Page | Via Live Radar data | Not fetched |
| Match Detail | 5s (penalties) / 8s (critical) / 12s (normal) | Same cycle (summary) |
| Command Center | 12s (critical+patterns) / 20s (normal) | 20-25s (top 15 only) |

## Score Sources (Priority)

1. **Event-confirmed** (highest): Goal detected in keyEvents/timedEvents before scoreboard updates
2. **Provider scoreboard**: ESPN competitor.score field
3. **API-Football score**: score.goals from API-Football
4. **football-data score**: score.fullTime from football-data.org

## Non-Regression Rules

- Score never decreases unless explicit correction event
- Minute never decreases (except halftime reset which is a status change)
- Status never regresses (FT > P > ET > 2H > HT > 1H > NS)
- Penalty score never decreases
- Cache entries expire after 5 minutes

## Global Score Cache Flow

1. Match Detail parses ESPN summary → detects goal in keyEvents → `updateScoreCache(fixtureId)`
2. Command Center fetches stats → detects goal in timedEvents → `feedScoreCacheFromEvents(fixtureId)`
3. Next `getLiveFixtures()` call → `reconcileAllFixtureScores()` → applies cached score to all fixtures
4. Live Radar, Matches Page, Command Center all receive reconciled fixtures

## Limitations

- If no one opens Match Detail or Command Center for a match, the cache isn't fed (scoreboard is the only source)
- Cache is in-memory (doesn't persist across page reloads)
- ESPN scoreboard has ~15-30s propagation delay from real event
- Without WebSocket/SSE, polling is the ceiling for real-time updates
- Google may use faster feeds (direct stadium data)

## What This Architecture Does NOT Do

- Does NOT create a separate score-only endpoint (ESPN scoreboard already IS score-only — it's lightweight)
- Does NOT fetch summary for all matches (only top 15 in Command Center + opened match)
- Does NOT use localStorage for score persistence (in-memory only, expires in 5min)
- Does NOT invent scores or simulate clocks

## Multi-Provider Score Race (Already Implemented)

### How It Works

`getLiveFixtures()` fetches ESPN + football-data + API-Football in parallel. The merge process IS the score race:

1. ESPN fixtures added first (best logos)
2. football-data checked — if same match exists, `pickBestFixture()` chooses the one with better status/minute
3. API-Football checked — same logic, plus score/minute merge if duplicate

`pickBestFixture()` decides the winner by:
1. Status score (P > ET > 2H > HT > 1H > NS)
2. Minute (higher wins)
3. Penalty score presence
4. Logo presence

### Field-Level Source Metadata

Each fixture carries `_scoreSource?: string` for debugging:
- `"espn"` — ESPN won (default, first in array)
- `"api_football (won by minute over espn)"` — API-Football had fresher minute
- `"events_confirmed (was espn)"` — Score cache corrected a stale provider score

### Why a Separate "Score Race" Module Is Unnecessary

The existing `getLiveFixtures()` + `pickBestFixture()` + `reconcileAllFixtureScores()` pipeline already:
- Fetches all providers in parallel ✅
- Picks the best version per match ✅
- Applies event-confirmed corrections ✅
- Never regresses ✅
- Tags the source for debugging ✅

Creating a separate `liveScoreRace.ts` module would duplicate this logic without adding value.
