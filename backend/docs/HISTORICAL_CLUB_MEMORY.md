# Historical Club Memory (B45 / Bloco 2)

Deep, honest memory per club so the GoalSense does not analyze each game "as if for
the first time" — built from the GoalSense's OWN history (signal ledger + alert
outcomes via B39 `buildTeamMemory`), never from a provider, never invented.

## Files
- `memory/fundamentalMemory.types.ts` — all contracts.
- `memory/memorySampleQuality.service.ts` — PURE sample-quality engine (the heart).
- `memory/teamFundamentalMemory.service.ts` — `buildTeamFundamentalMemory(teamId)`,
  `buildTeamMemoryForTodayFixtures`, `explainTeamFundamentalMemory`.

## What it produces (`TeamFundamentalMemoryProfile`)
- `overallSample`: `SampleQualityAssessment` (strong / usable / weak / insufficient /
  misleading_risk / unknown) — reliability is **data-confidence, not a win
  probability**.
- `homeAway`: home/away split (counts only; absence stays absent — no zero-filling).
- `goals` / `cards`: observed only when ledger carries goal/card context; otherwise
  `observed=false` with the explicit caveat "ausência ≠ 0".
- `patternHistory`: per pattern, confirmed / confirmed_partial / failed / unknown /
  not_evaluable kept distinct (`unknown`/`not_evaluable` are NEVER failures).
- `contextBehaviors`: knockout / high-importance / late-game behavior, each carrying
  its own sample quality.
- `memoryState`: `insufficient_history` → `developing` → `usable` → `mature`.

## Sample Quality Engine (PURE)
`evaluateSampleQuality` is fully deterministic from counts + recency:
- no sample → `insufficient` (`canConclude=false`);
- small effective sample (< usable threshold) → `weak`;
- mostly-old with little recent evidence → `misleading_risk`;
- `>= strong threshold` recent in-context → `strong` (the only `canConclude=true`).

Thresholds from env: `HISTORICAL_MEMORY_MIN_SAMPLE_FOR_STRONG` (8),
`HISTORICAL_MEMORY_RECENCY_DAYS` (730).

## internalMemory vs providerMemory
This module is `goalsense_internal_memory` only. Provider snapshots (B40–B44) are kept
SEPARATE and never merged into internal memory.

## Persistence
Collections under Firebase: `teamFundamentalMemoryProfiles`. Under Prisma/Noop the
repo is Noop → reads empty → `insufficient_history` (honest, not negative).

## Inviolable rules
Small samples never become strong conclusions; old/different-context cases are
down-weighted; absence is never zero; memory is advisory and never changes
score/confidence/patterns/alert results.
