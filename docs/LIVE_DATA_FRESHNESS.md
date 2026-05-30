# Live Data Freshness Engine

## Problem

GoalSense was showing ~1 minute delay compared to Google for live matches. Root cause: CDN cache (12s) + polling intervals (15-25s) + ESPN propagation delay (~15-30s) = ~37-67s total perceived delay.

## Solution

Multi-layer freshness improvements:

### 1. CDN Cache Reduction
- Netlify functions: `max-age=12` → `max-age=5` (espn-live, live-fusion)
- Vercel API routes: `Cache-Control: no-store, max-age=0`

### 2. Client-Side Cache Busting
- All ESPN fetches now use `{ cache: 'no-store' }`:
  - `getLiveFixtures()` (apiClient.ts) — already had it ✅
  - MatchCenterPage ESPN scoreboard fetches — **fixed**
  - MatchCenterPage ESPN summary fetches — **fixed**
  - CommandCenterPage ESPN summary fetches — **fixed**

### 3. Adaptive Polling

| Context | Before | After |
|---------|--------|-------|
| Live Radar (critical moment) | 15s | **10s** |
| Live Radar (normal live) | 15s | 15s |
| Live Radar (no live) | 15s | 45s |
| Match Detail (critical) | 15s | **8s** |
| Match Detail (normal live) | 15s | **12s** |
| Match Detail (not live) | 60s | 60s |
| Command Center (critical + patterns) | 25s | **12s** |
| Command Center (normal live) | 25s | **20s** |
| Command Center (no live) | 60s | 60s |

### 4. Critical Live Mode

`isCriticalLiveMoment(fixture)` returns true when:
- Extra time or penalties (ET, BT, P)
- Final phase (75'+)
- Tight score (≤1 goal diff) in second half (60'+)

Critical mode triggers faster polling across all pages.

### 5. Stale Detection

`detectLiveStaleness(fixture, previous, fetchedAt)` detects:
- Data older than 45s in critical moment → severity: high
- Data older than 60s for any live match → severity: medium
- Minute frozen across multiple fetches → severity: medium

### 6. Race Condition Protection

`shouldApplyUpdate(current, incoming, currentFetchedAt, incomingFetchedAt)`:
- Never regresses status (FT > LIVE > HT > 1H > NS)
- Never regresses minute
- Only applies if incoming is genuinely newer/better

## Architecture

```
src/lib/liveFreshness.ts
├── isCriticalLiveMoment(fixture)
├── getAdaptivePollingInterval(fixtures)
├── getMatchDetailPollingInterval(fixture)
├── getCommandCenterPollingInterval(fixtures, hasPatterns)
├── detectLiveStaleness(fixture, previous, fetchedAt)
├── calculateFreshnessScore(fetchedAt, fixture)
└── shouldApplyUpdate(current, incoming, ...)
```

## Limitations

- Minimum delay depends on ESPN's own data propagation (~15-30s from real event)
- Google may use a different, faster feed (direct stadium data)
- Aggressive polling must respect API rate limits
- CDN cache of 5s is the minimum practical value for serverless functions
- Without WebSocket/SSE, polling is the only option for real-time updates
