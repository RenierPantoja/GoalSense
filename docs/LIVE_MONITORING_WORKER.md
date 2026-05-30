# Live Monitoring Worker

## Overview

Phase B6 introduces a backend worker that observes live football matches and captures snapshots into the database. The worker does NOT generate alerts — it only collects data for future pattern evaluation and performance analysis.

## Architecture

```
Worker Loop (every 30s)
  └── ESPN Provider → fetch scoreboard
        └── For each live fixture:
              ├── upsertFixture (create/update in DB)
              ├── captureLiveSnapshot (if changed)
              └── recordProviderHealth
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIVE_WORKER_ENABLED` | `false` | Must be `true` to start the worker |
| `LIVE_WORKER_INTERVAL_MS` | `30000` | Polling interval in milliseconds |
| `ESPN_BASE_URL` | ESPN API URL | Base URL for ESPN scoreboard |

## Providers

### ESPN (Active)
- No API key required
- Fetches from 9 major leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Brasileirão, Champions League, Europa League, Libertadores)
- Maps ESPN status to standard codes (1H, 2H, HT, FT, etc.)
- Timeout: 8s per league request

### API-Football (Future)
- Requires `API_FOOTBALL_KEY`
- Not implemented in this phase

### Football-Data (Future)
- Requires `FOOTBALL_DATA_KEY`
- Not implemented in this phase

## Snapshot Rules

A snapshot is stored only when something changed:
- **First snapshot** for a fixture → always store
- **Status changed** (e.g., 1H → HT) → store
- **Score changed** → store
- **Minute changed** → store
- **No change** → skip (prevents DB spam)

## Data Quality Assessment

Each snapshot gets a quality label:
- `rich` — has shotsOnTarget + possession stats
- `partial` — has some stats but not complete
- `poor` — no stats available (scoreboard-only)

## Fixture Identity

- **Canonical key**: `normalizedHome:normalizedAway:YYYY-MM-DD`
- **Dedup**: First by provider+providerFixtureId, then by canonicalKey
- **Status non-regression**: Status never goes backward (2H → 1H rejected)
- **Team aliases**: PSG, Man City, Bayern, etc. normalized

## Rate Limit Safety

- Timeout per request: 8s
- Max consecutive errors before backoff: 5
- Backoff: interval × 2 on repeated failures
- Gradual recovery after backoff
- Worker disabled by default (opt-in)

## Observability Routes

| Route | Description |
|-------|-------------|
| `GET /api/live-monitor/status` | Worker state: enabled, running, lastRun, errors, counts |
| `GET /api/live-snapshots/recent` | Recent snapshots (filterable by fixtureId, limit) |
| `GET /api/fixtures/live` | Fixtures currently live in DB |
| `GET /api/provider-health` | Provider health records (filterable by provider) |

## What the Worker Does NOT Do

- Does not generate alerts
- Does not evaluate patterns
- Does not send notifications
- Does not integrate odds
- Does not replace frontend live data
- Does not run without explicit opt-in

## Limitations

- Only ESPN provider active (no API-Football/Football-Data yet)
- No detailed stats from scoreboard (requires summary endpoint per match)
- No events from scoreboard (requires separate call)
- Single-user/default (no multi-tenant)
- No horizontal scaling (single instance)

## Summary Enrichment (Phase B6.1)

When `SUMMARY_ENRICHMENT_ENABLED=true`, the worker fetches ESPN summary for live matches to capture:
- **Stats**: possession, shots, shotsOnTarget, corners, yellowCards, redCards, fouls, offsides, saves
- **Timed Events**: goals, own_goals, penalties, shots, corners, cards, substitutions, VAR, goal_disallowed
- **Shootout Events**: sequence, side, player, outcome (scored/missed/saved/post)

### Enrichment Config
| Variable | Default | Description |
|----------|---------|-------------|
| `SUMMARY_ENRICHMENT_ENABLED` | `true` | Enable/disable summary fetching |
| `SUMMARY_ENRICHMENT_MAX_FIXTURES` | `10` | Max fixtures to enrich per cycle |

### Data Quality V2
| Level | Criteria |
|-------|----------|
| `rich` | Has stats (shots/possession) AND timed events |
| `partial` | Has stats OR events (not both) |
| `poor` | Only scoreboard data (score/status/minute) |

### Snapshot Storage Rules
A snapshot is stored when:
- First snapshot for fixture
- Status changed
- Score changed
- Minute changed
- New events detected (events count increased)

## Next Steps

1. Add stats fetching via ESPN summary endpoint for live matches
2. Add API-Football provider for richer data
3. Pattern evaluation on snapshots (Phase B7)
4. Alert generation from worker (Phase B7)
5. Telegram notifications (Phase B8)
