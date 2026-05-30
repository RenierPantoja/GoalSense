# Match Live Advanced Status

## Status Mapping

### ESPN Status → GoalSense Status

| ESPN Status | GoalSense Short | Label |
|-------------|----------------|-------|
| STATUS_FIRST_HALF | 1H | 1º tempo |
| STATUS_SECOND_HALF | 2H | 2º tempo |
| STATUS_IN_PROGRESS | LIVE | Ao vivo |
| STATUS_HALFTIME | HT | Intervalo |
| STATUS_EXTRA_TIME / STATUS_OVERTIME | ET | Prorrogação |
| STATUS_EXTRA_TIME_HALF_TIME | BT | Intervalo prorrogação |
| STATUS_SHOOTOUT / STATUS_PENALTY_SHOOTOUT | P | Pênaltis |
| STATUS_FULL_TIME / STATUS_FINAL | FT | Encerrado |
| STATUS_FINAL_AET / STATUS_FINAL_EXTRA_TIME | AET | Encerrado (Prorr.) |
| STATUS_FINAL_PEN / STATUS_FINAL_SHOOTOUT | PEN | Encerrado (Pên.) |
| STATUS_SCHEDULED / STATUS_PRE_EVENT | NS | Não iniciado |
| STATUS_POSTPONED | PST | Adiado |
| STATUS_CANCELED / STATUS_CANCELLED | CANC | Cancelado |
| STATUS_SUSPENDED / STATUS_DELAYED | SUSP | Suspenso |

### Fallback Heuristics

If no exact match:
- Contains "SHOOTOUT" or "PENALTY" → P
- Contains "EXTRA" or "OVERTIME" → ET
- Contains "PROGRESS" or "HALF" → LIVE
- Contains "FINAL" → FT

## Polling Intervals by Status

| Status | Match Detail | Live Radar | Command Center |
|--------|-------------|------------|----------------|
| P (Penalties) | **5s** | 10s | 12s |
| ET/BT (Extra time) | 8s | 10s | 12s |
| 75'+ tight score | 8s | 10s | 12s |
| Normal live | 12s | 15s | 20s |
| Not live | 60s | 45s | 60s |

## Critical Live Mode

`isCriticalLiveMoment(fixture)` returns true for:
- `P` (penalty shootout) — always critical
- `ET` / `BT` (extra time) — always critical
- Minute ≥ 75 — final phase
- Minute ≥ 60 with score difference ≤ 1 — tight second half

## Penalty Shootout Handling

### Current State
- Status `P` is correctly mapped and displayed as "Pênaltis"
- Polling is fastest (5s) during penalties
- `isCriticalLiveMoment` returns true
- Live fixture guard recognizes `P` as live

### Limitations (Future Work)
- No penalty score field in `LiveFixture` type (only regular score)
- No individual penalty kick tracking
- No penalty shootout UI component
- ESPN may return penalty kicks in `keyEvents` but they're not aggregated
- Pressure graph doesn't have a penalty-specific visualization

### What Works Now
- Status badge shows "Pênaltis" during shootout
- Status badge shows "Encerrado (Pên.)" after shootout
- Polling is aggressive during penalties
- Command Center recognizes penalty status (won't trigger offensive patterns)
- Live Radar shows correct status

## Extra Time Handling

- Status `ET` shows "Prorrogação"
- Status `BT` shows "Intervalo prorrogação"
- Status `AET` shows "Encerrado (Prorr.)"
- Polling is critical-mode fast during extra time
- Minute display continues past 90' (e.g., 101', 120')
