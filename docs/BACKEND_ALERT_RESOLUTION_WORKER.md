# Backend Alert Resolution Worker

## Overview

Phase B8 introduces a worker that resolves pending alerts by analyzing post-trigger snapshots. The worker is conservative and honest: unknown ≠ failed.

## Architecture

```
Resolution Worker (every 30s)
  ├── Load pending alerts from DB
  └── For each alert:
        ├── Infer resolution type from pattern name
        ├── Get resolution window (8-15 min)
        ├── Load snapshots after alert creation
        ├── Analyze events/stats in window
        ├── Resolve: confirmed | confirmed_partial | failed | unknown | expired
        ├── Create AlertResolution record
        └── Update Alert.status
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RESOLUTION_WORKER_ENABLED` | `false` | Must be `true` to start |
| `RESOLUTION_WORKER_INTERVAL_MS` | `30000` | Resolution check interval |
| `RESOLUTION_WORKER_MAX_ALERTS` | `50` | Max alerts per cycle |

## Resolution Types & Windows

| Type | Window | Confirmation Criteria |
|------|--------|----------------------|
| goal_pressure | 12 min | Goal event or score increase |
| late_goal | 15 min | Goal event or score increase |
| over_trend | 15 min | Goal event or score increase |
| open_game | 15 min | Goal event or score increase |
| dominance | 15 min | Goal event or score increase |
| favorite_risk | 15 min | Goal event or score increase |
| underdog_threat | 15 min | Goal event or score increase |
| corner_pressure | 8 min | Corner event or corner stat increase |
| card_heat | 12 min | Card event or card stat increase |
| custom_unknown | 10 min | Goal as fallback |

## Resolution Outcomes

| Outcome | When |
|---------|------|
| `confirmed` | Expected event occurred with timed event evidence |
| `confirmed_partial` | Score/stat changed but no timed event to confirm |
| `failed` | Window expired with sufficient data, event didn't occur |
| `unknown` | Insufficient data to confirm or deny |
| `expired` | Alert too old (3× window) without any snapshots |

## Unknown vs Failed Rules

**Unknown** when:
- No snapshots available after alert
- Provider didn't deliver events/stats
- Match entered shootout before window
- Insufficient data coverage

**Failed** when:
- Window expired AND data was sufficient (has events + stats)
- Match finished without expected outcome
- Clear evidence that event didn't happen

**Never** mark failed when:
- Provider didn't deliver data
- Snapshots are missing
- Data quality is poor

## Shootout Handling

- If match enters shootout (status P/PEN), goal-type patterns resolve as `unknown`
- Shootout goals do NOT confirm goal_pressure patterns
- This prevents false confirmations from penalty kicks

## Snapshot Window Analysis

For each alert, the worker:
1. Loads snapshots captured AFTER the alert's `createdAt`
2. Filters events within the resolution window (triggerMinute → triggerMinute + windowMinutes)
3. Counts goals, corners, cards within window
4. Checks if match finished
5. Assesses data availability (hasTimedEvents, hasStats)

## Safety Guards

- Already-resolved alerts are skipped (race condition guard)
- Alerts too young (< window) with no data are skipped (not forced)
- Alerts too old (> 3× window) are force-resolved
- Transaction ensures Alert.status and AlertResolution are atomic

## Observability

| Route | Description |
|-------|-------------|
| `GET /api/resolution-worker/status` | Worker state, resolution counts by outcome |

## Performance Integration

After resolution, the Performance Backend Analytics automatically reflects the new data because it queries Alert + AlertResolution tables directly. No additional integration needed.

## Limitations

- Resolution type inferred from pattern name (heuristic, not perfect)
- Favorite/underdog context not available (resolves as unknown if unclear)
- Only ESPN events available for confirmation
- No odds-based resolution
- Single-user/default
