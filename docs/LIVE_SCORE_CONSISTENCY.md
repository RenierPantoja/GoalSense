# Live Score Consistency Engine

## Problem

ESPN's `competitor.score` field can lag behind `keyEvents`. A goal event appears in the timeline (and pressure graph tooltip) before the score field updates. This causes the pressure graph to show "1-0" while the header still shows "0-0".

## Root Cause

The MatchCenterPage `parseEspn` function extracted score from `competitor.score` (provider field) but the pressure graph's `goalScoreMap` counted goals from `keyEvents`. These two sources can be out of sync by 15-60 seconds.

## Solution: `canonicalLiveScore.ts`

`buildCanonicalLiveScore(providerHome, providerAway, goalEvents, previousScore)` reconciles:

1. Counts confirmed goal events (goal, own_goal, penalty_scored)
2. Compares event-derived score vs provider score
3. Uses the HIGHER of the two (events can be ahead of provider, or provider can be ahead of events)
4. Never regresses below previous known score

### Rules

| Scenario | Result |
|----------|--------|
| Events show 1-0, provider shows 0-0 | Use 1-0 (events ahead) |
| Events show 1-0, provider shows 2-0 | Use 2-0 (events incomplete) |
| Events show 1-0, provider shows 1-0 | Use 1-0 (consistent) |
| Previous was 1-0, new data shows 0-0 | Keep 1-0 (never regress) |

### Goal Counting

- `goal` → benefits the scoring team's side
- `own_goal` → benefits the OPPOSITE side
- `penalty_scored` → benefits the scoring team's side
- `penalty_missed` → does NOT change score
- Unknown side → skipped (never invent)

### Deduplication

`dedupeGoalEvents()` prevents counting the same goal twice when ESPN returns it in both `keyEvents` and `commentary`. Dedupes by: minute + side + playerName.

## Integration

### MatchCenterPage (parseEspn)

After building the initial `MatchData` from ESPN summary, the score is reconciled:
```typescript
const canonical = buildCanonicalLiveScore(result.home.score, result.away.score, goalEvents)
result.home.score = canonical.home
result.away.score = canonical.away
```

This ensures the header, stats, and all downstream consumers see the reconciled score.

### Pressure Graph

The pressure graph's `goalScoreMap` already counted events correctly. Now the header matches.

### Live Radar / Matches Page / Command Center

These use `getLiveFixtures()` which returns `fixture.score` from the provider. The provider score may still lag, but:
- The Live Radar refreshes every 10-15s
- The provider score catches up within 1-2 polling cycles
- The Match Detail (which has the reconciliation) is always the most accurate

## Limitations

- Only works in Match Detail (where ESPN summary with keyEvents is available)
- Live Radar and Matches Page still depend on provider score from the scoreboard endpoint
- If provider doesn't deliver goal events OR score, there's nothing to reconcile
- Ambiguous events (no team/side) are skipped for safety

## Global Score Cache (`liveScoreCache.ts`)

### Architecture

```
Match Detail (parseEspn) → detects goal in keyEvents → updateScoreCache(fixtureId, canonical)
Command Center (fetchStats) → detects goal in timedEvents → feedScoreCacheFromEvents(fixtureId, ...)
                                          ↓
                              liveScoreCache (in-memory Map)
                                          ↓
getLiveFixtures() → reconcileAllFixtureScores(fixtures) → Live Radar / Matches / Command Center
```

### How It Works

1. **Match Detail** parses ESPN summary, reconciles score with keyEvents, and feeds the cache
2. **Command Center** fetches ESPN summary for monitored matches, extracts timed events, and feeds the cache
3. **`getLiveFixtures()`** (used by Live Radar, Matches, Command Center) calls `reconcileAllFixtureScores()` after dedup, which checks the cache and upgrades any fixture whose cached score is higher than the provider score

### Cache Rules

- Keyed by `fixtureId` (number)
- Entries expire after 5 minutes
- Never regresses (only updates if new score total ≥ existing)
- Only stores scores derived from real events (never invented)

### Integration Points

| Surface | How it gets canonical score |
|---------|---------------------------|
| Match Detail | Direct reconciliation in parseEspn + feeds cache |
| Live Radar | Via `getLiveFixtures()` → `reconcileAllFixtureScores()` |
| Matches Page | Via `getLiveFixtures()` → `reconcileAllFixtureScores()` (if using live endpoint) |
| Command Center | Via `getLiveFixtures()` + feeds cache from stats fetch |
| Pattern Evaluator | Uses fixtures from Command Center (already reconciled) |
| Alert Resolution | Uses fixtures from Command Center (already reconciled) |

### Safeguards

- Cache entries expire after 5 minutes (prevents stale data from old sessions)
- Never reduces score below cached value
- Different fixtures with same team on same day use different fixtureIds (no contamination)
- Penalty shootout score is separate (not mixed with regular score)
