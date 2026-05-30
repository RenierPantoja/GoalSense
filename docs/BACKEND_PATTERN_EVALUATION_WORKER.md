# Backend Pattern Evaluation Worker

## Overview

Phase B7 introduces a backend worker that evaluates active patterns against enriched live snapshots and creates alerts when conditions are met with sufficient confidence. The worker is conservative, auditable, and disabled by default.

## Architecture

```
Pattern Evaluation Worker (every 15s)
  ├── Load active patterns from DB
  ├── Load live fixtures from DB
  ├── Load latest snapshot per fixture
  └── For each pattern × fixture:
        ├── Hard gates (status, action, data quality)
        ├── Condition evaluation
        ├── Momentum assessment
        ├── Confidence calculation
        ├── Duplicate guard
        └── Create alert if ready_to_alert
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PATTERN_WORKER_ENABLED` | `false` | Must be `true` to start |
| `PATTERN_WORKER_INTERVAL_MS` | `15000` | Evaluation interval |
| `PATTERN_WORKER_MAX_FIXTURES` | `20` | Max fixtures per cycle |

## Hard Gates (Blockers)

| Gate | Condition | Result |
|------|-----------|--------|
| Pattern not active | `status !== 'active'` | Blocked |
| Suggest only | `action === 'suggest_only'` | Blocked |
| Penalty shootout | `status === 'P' or 'PEN'` | Blocked |
| Match not live | Status not in [1H, 2H, HT, ET, BT] | Blocked |
| Finished/cancelled | FT, AET, CANC, PST, SUSP, NS | Blocked |
| Rich data required | `requireRichData && quality !== 'rich'` | Blocked |
| Critical + poor data | `severity === 'critical' && quality === 'poor'` | Blocked |
| No conditions | Empty conditions array | Blocked |
| Stale snapshot | Snapshot > 5 min old | Skipped |
| Duplicate alert | Same signature within 5 min | Blocked |

## Condition Evaluation

Supported condition types:
- `is_live`, `minute_between`, `score_tied`, `score_diff_lte`
- `goals_total_gte`, `goals_total_lte`
- `possession_gte`, `home_possession_gte`, `away_possession_gte`
- `shots_on_target_gte`, `home_shots_on_target_gte`, `away_shots_on_target_gte`
- `corners_gte`, `home_corners_gte`, `away_corners_gte`
- `cards_gte`, `shots_total_gte`, `is_final_phase`

Unknown condition types → conservative: don't match (returns false).

## Confidence Calculation

```
Base: matchRatio × 80 (up to 80 from conditions)
+ 15 if momentum from timed_events
+ 5 if momentum from stats_proxy
+ 5 if dataQuality === 'rich'
Cap: 99
```

## Signal States

| State | Criteria |
|-------|----------|
| `ready_to_alert` | confidence >= minConfidence AND matchRatio >= 0.7 AND momentum.strength !== 'none' |
| `strong_candidate` | confidence >= minConfidence AND matchRatio >= 0.6 |
| `watch_only` | matchRatio >= 0.5 but not enough for alert |
| `blocked` | Hard gate failed |

Only `ready_to_alert` creates an alert.

## Momentum Assessment

- Uses timed events from snapshot's eventsJson
- Window: last 10 minutes
- Offensive types: goal, own_goal, penalty_scored, shot_on_target, shot_off_target, corner, dangerous_attack
- Cards/substitutions are NOT offensive pressure
- Falls back to stats_proxy if no events available

## Duplicate Guard

- Signature: `patternId:fixtureId:scoreHome-scoreAway:minuteBucket`
- Window: 5 minutes
- Also checks by patternId + fixtureId within window (broader)
- Prevents spam from repeated evaluations

## Alert Creation

When signal is `ready_to_alert` and duplicate guard passes:
- Creates Alert record with full evidence
- `evidenceJson`: patternName, teams, competition, reasons, triggerSnapshot, source
- `temporalEvidenceJson`: momentumSource, recencyConfidence, recentEventsUsed
- `duplicateSignature`: for future dedup
- `source`: 'backend_worker'

## Observability

| Route | Description |
|-------|-------------|
| `GET /api/pattern-worker/status` | Worker state, counts, errors |

## What the Worker Does NOT Do

- Does not send Telegram notifications
- Does not integrate odds
- Does not resolve alerts (separate concern)
- Does not replace frontend evaluation
- Does not run without explicit opt-in

## Limitations

- Only evaluates against latest snapshot (no historical trend)
- Only ESPN provider data available
- No pre-match context evaluation
- No favorite team detection (backend doesn't know user favorites yet)
- Single-user/default
- No horizontal scaling

## Next Steps

1. Alert resolution worker (auto-resolve based on final score)
2. Telegram notification integration
3. Frontend consumption of backend alerts
4. Pre-match context from historical snapshots
5. Multi-provider enrichment
