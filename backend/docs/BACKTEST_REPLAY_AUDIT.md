# Backtest & Replay — Data Audit (Phase B14)

Read-only audit of the historical data the backend already stores, before
building the backtest/replay engine. No invented data.

## 1. Data available

### Live snapshots (`liveSnapshots/{autoId}`)
Immutable per-tick records. Fields used by backtest:
`fixtureId`, `minute`, `scoreHome`, `scoreAway`, `penaltyHome`, `penaltyAway`,
`status`, `statsJson`, `eventsJson`, `dataQuality` (`rich|partial|poor`),
`provider`, `capturedAt` (ISO). History is never overwritten → a fixture's full
captured timeline is recoverable.

Access (`LiveSnapshotRepository`):
- `listRecent({ fixtureId, limit })` → that fixture's snapshots (we sort ascending for replay).
- `findAfter(fixtureId, afterDate, limit)` → chronological post-trigger window.
- `findLatestByFixture(fixtureId)`.

### Fixtures (`fixtures/{provider__id}`)
`id`, `canonicalKey`, `homeName`, `awayName`, `competition`, `status`, `startTime`,
`provider`. `listLive(statuses, limit)` accepts **any** statuses, including
terminal ones (`FT`, `AET`, `PEN`) — so finished fixtures are enumerable.

### Intelligence memory (B12/B13)
Ledger entries, outcomes, failures, learning profiles — usable to correlate but
NOT required for backtest (backtest re-evaluates from raw snapshots).

### Pure, reusable evaluation
- `evaluateCondition(cond, input)` and `evaluatePatternAgainstInput(pattern, input)`
  in `modules/command/commandEvaluation.service.ts` are **pure** (no writes).
- `buildPatternInput(fixture, snapshot)` (`snapshotToPatternInput.ts`).
- `deriveMatchContext(competition)` (`matchContext.service.ts`).
- `evaluatePatternScope` + `parseScopeExtended` + `parseScopeFilter`
  (`backendScopeFilter.service.ts`) — scope can be simulated with **no** alert.

## 2. Data missing / insufficient for "real" backtest

- **No per-fixture full snapshot guarantee**: snapshots exist only for fixtures
  the live worker actually observed; many historical fixtures have **zero**
  snapshots → `not_evaluable`.
- **No date-range fixture query**: we enumerate via `listLive(terminalStatuses)`
  and filter by `startTime` in memory (capped).
- **Sparse stats/events**: ESPN enriches only top live fixtures → many snapshots
  are `partial`/`poor`; corners/cards coverage varies.
- **No xG / dangerous attacks / pre-match / H2H / standings / odds.**
- **Resolution evidence depends on post-trigger snapshots existing.**

## 3. Honest backtest strategy

1. Resolve candidate fixtures from config (explicit ids) or `listLive` over
   live+terminal statuses, filtered by date + pattern scope (`evaluatePatternScope`).
2. Load each fixture's snapshot timeline (`listRecent`), sort ascending.
3. Per snapshot, build an evaluation input (status from the **snapshot**, not the
   fixture's current/FT status) and run the pure evaluator with a normalized
   pattern (`action=register_alert`, `status=active`) — exactly like the B12
   diagnostic, but offline.
4. First snapshot that `shouldAlert` → the simulated trigger point.
5. Estimate outcome **only** from post-trigger snapshots (goals/corners/cards in
   the resolution window). No post data → `unknown`/`not_evaluable`.
6. Build summary + data coverage; persist a backtest run. **No alerts, no
   Telegram, no production counters/profiles touched.**

## 4. Risks of false backtest & mitigations

| Risk | Mitigation |
|------|------------|
| "Backtesting" fixtures with no snapshots | counted as `not_evaluable`; surfaced in `dataCoverage`. |
| Counting `unknown` as failure | `failedRate` numerator = failed only; `unknown`/`not_evaluable` excluded. |
| Inventing the outcome of a signal | outcome estimated only from real post-trigger snapshots; otherwise `unknown`. |
| Assuming any goal confirms any signal | window/criteria derived from signal type (mirrors B8), not "any goal". |
| Ranking on tiny samples | `sampleQuality` gate reused from B13. |
| Side effects from prod resolution | backtest uses its **own** read-only outcome estimator; never calls the resolution worker. |

## 5. Unknown rule

`unknown` ≠ `failed`. Missing post-trigger data ⇒ `unknown` or `not_evaluable`.
`confirmed_partial` counts as partial usefulness. Backtest never inflates nor
destroys performance with absent data.
