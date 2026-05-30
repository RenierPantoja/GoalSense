# Backend Snapshot Data Contract

## Overview

This document defines the stable data contract for LiveSnapshot records stored by the backend worker. Pattern evaluation (Phase B7) will consume these snapshots — the contract must be reliable.

## statsJson Schema

```typescript
interface LiveMatchStats {
  possessionHome?: number    // 0-100 percentage
  possessionAway?: number    // 0-100 percentage
  shotsHome?: number         // integer count
  shotsAway?: number
  shotsOnTargetHome?: number // integer count
  shotsOnTargetAway?: number
  cornersHome?: number       // integer count
  cornersAway?: number
  yellowCardsHome?: number   // integer count
  yellowCardsAway?: number
  redCardsHome?: number      // integer count
  redCardsAway?: number
  foulsHome?: number         // integer count
  foulsAway?: number
  offsidesHome?: number      // integer count
  offsidesAway?: number
  savesHome?: number         // integer count
  savesAway?: number
}
```

### Rules
- All fields are optional — absent means provider didn't deliver
- `undefined` means "not available", NOT zero
- Values are real numbers from provider, never invented
- Possession is percentage (0-100), not fraction
- Stats come from ESPN boxscore/statistics array

## eventsJson Schema

```typescript
interface BackendTimedEvent {
  provider: 'espn'
  minute: number              // Required — events without minute are excluded
  addedTime?: number          // Added time (e.g., 45+2 → minute=45, addedTime=2)
  type: string                // See type map below
  side: 'home' | 'away' | 'unknown'
  teamName?: string
  playerName?: string
  description?: string
}
```

### Event Types
| Type | Meaning | Offensive? |
|------|---------|-----------|
| `goal` | Regular goal | Yes |
| `own_goal` | Own goal | No (defensive error) |
| `penalty_scored` | Penalty converted (in-game) | Yes |
| `penalty_missed` | Penalty missed/saved (in-game) | No |
| `yellow_card` | Yellow card | No |
| `red_card` | Red card (or second yellow) | No |
| `substitution` | Player substitution | No |
| `offside` | Offside call | No |
| `goal_disallowed` | Goal ruled out (VAR/offside) | No |
| `var` | VAR review | No |
| `unknown` | Unrecognized event type | No |

### Rules
- Events WITHOUT a minute are excluded (not timed events)
- Events with `side: 'unknown'` are preserved but not used for momentum
- `goal_disallowed` does NOT count as a goal
- Shootout penalties are NOT included in eventsJson
- Cards and substitutions are NOT offensive pressure
- Minute format "45'+2" is parsed as minute=45, addedTime=2

## shootoutEventsJson Schema (Future)

```typescript
interface ShootoutEvent {
  provider: 'espn'
  sequence: number
  side: 'home' | 'away' | 'unknown'
  playerName?: string
  outcome: 'scored' | 'missed' | 'saved' | 'post' | 'unknown'
  description?: string
}
```

### Rules
- Only extracted when match is in penalty shootout (status P/PEN)
- Never mixed with regular game events
- `scored` increments penalty score
- `missed`/`saved`/`post` do NOT increment score

## dataQuality Assessment

| Level | Criteria |
|-------|----------|
| `rich` | Has stats (shotsOnTarget OR possession) AND has timed events |
| `partial` | Has stats OR events (not both) |
| `poor` | Only scoreboard data (score/status/minute) |

## Snapshot Storage Rules

A new snapshot is stored when ANY of these change:
1. Status changed (e.g., 1H → HT)
2. Score changed
3. Minute changed
4. Events count increased (new events detected)

A snapshot is NOT stored when:
- Payload is identical to last snapshot
- Only `capturedAt` changed
- Summary failed but scoreboard unchanged

## Limitations

- ESPN summary may not exist for all leagues/matches
- Some matches only have scoreboard data (poor quality)
- Stats are aggregated (not per-minute breakdown)
- Events depend on ESPN keyEvents/details availability
- Shootout structure varies by ESPN response format
- Rate limit: max 10 summaries per worker cycle (configurable)

## How Pattern Worker Should Consume Snapshots (Phase B7)

1. Load latest snapshot for fixture
2. Parse `statsJson` → use for condition evaluation (possession, shots, corners, etc.)
3. Parse `eventsJson` → use for momentum/recency (filter offensive types, check last 10 min)
4. Check `dataQuality` → if 'poor', apply data-limited precision gate
5. Never trust stats that are `undefined` — treat as "not available"
6. Never invent events from stats (stats are aggregated, not timed)
