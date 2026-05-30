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
- Individual penalty kick tracking depends on ESPN providing shootout events in keyEvents/plays
- Pressure graph doesn't have a penalty-specific visualization (stops at 120')
- No dedicated penalty shootout UI component yet (planned)

### What Works Now
- Status badge shows "Pênaltis" during shootout
- Status badge shows "Encerrado (Pên.)" after shootout
- Polling is aggressive during penalties (5s Match Detail)
- Command Center recognizes penalty status (won't trigger offensive patterns)
- Live Radar shows correct status
- **Penalty score is extracted from ESPN** when available (shootoutScore/linescores)
- **Penalty score is preserved during fixture merge** (never regresses)
- **`penaltyScore` field exists on `LiveFixture`** type for UI consumption
- **`src/lib/penaltyShootout.ts`** provides full extraction, detection, merge, and display helpers

## Extra Time Handling

- Status `ET` shows "Prorrogação"
- Status `BT` shows "Intervalo prorrogação"
- Status `AET` shows "Encerrado (Prorr.)"
- Polling is critical-mode fast during extra time
- Minute display continues past 90' (e.g., 101', 120')

## UI Integration

### PenaltyShootoutPanel Component

Located at `src/components/matches/PenaltyShootoutPanel.tsx`. Renders:
- Penalty score when available (e.g., "3 - 2")
- Individual kicks with outcome icons when available
- Honest fallback when data is missing

Inserted in MatchCenterPage between DiagnosticPanel and LivePressureGraph.

### Command Center During Penalties

- **Precision Engine Gate 8**: blocks all patterns when `fixture.status.short === 'P'`
- **Auto-Discovery Gate**: blocks all discoveries during penalty shootout
- Blocker message: "Partida em pênaltis — padrões de jogo corrido pausados"
- Penalty kicks do NOT count as goal pressure

### Pressure Graph

- Does not render penalty shootout events as pressure
- Continues showing game flow up to 120' (or whenever penalties started)
- No special penalty visualization (kicks are in the PenaltyShootoutPanel instead)
