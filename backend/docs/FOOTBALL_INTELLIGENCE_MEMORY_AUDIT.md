# Football Intelligence Memory — Audit (Phase B12)

Read-only audit of the **real** alert path before implementing the memory
foundation. No file was changed during this audit.

## 1. Current alert flow (creation)

`backend/src/workers/patternEvaluation.worker.ts` (interval `PATTERN_WORKER_INTERVAL_MS`, default 15s, gated by `PATTERN_WORKER_ENABLED`) calls
`runPatternEvaluation(maxFixtures)` in
`backend/src/modules/command/commandEvaluation.service.ts`.

Pipeline per run:
1. `repos.patterns.listActive('default')`
2. `repos.fixtures.listLive(['1H','2H','HT','ET','BT'], maxFixtures)`
3. per fixture → `repos.liveSnapshots.findLatestByFixture(id)` (reject if > 5 min old)
4. `buildPatternInput(fixture, snapshot)` → `PatternEvaluationInput`
5. `deriveMatchContext(fixture.competition)` → `MatchContext`
6. per pattern:
   - `evaluatePatternScope(...)` (scope/exclusions/onlyPreMatch) → skip if out
   - `evaluatePatternAgainstInput(pattern, input)` → `EvaluationResult`
     (matchedConditions, totalConditions, confidence, signalState, reasons, blockers, momentum)
   - if `shouldAlert`: `maxTriggersPerMatch` cap → duplicate guard → `repos.alerts.create({...evidenceJson...})`

**Data available at creation** (rich, reliable to persist):
- pattern (id, name, conditions, severity, action, minConfidence, scope)
- fixture (homeName, awayName, competition, canonicalKey, status)
- input (minute, score, stats?, events?, dataQuality, provider)
- evalResult (matched/total conditions, confidence, signalState, reasons[], blockers[], momentum)
- scopeDecision.reason, matchContext (competitionType/stage/importance)

This is the **ideal hook** for `SignalLedgerEntry` + `SignalEvidenceSnapshot`.

## 2. Current alert flow (resolution)

`backend/src/workers/alertResolution.worker.ts` (default 30s, gated by `RESOLUTION_WORKER_ENABLED`)
calls `resolvePendingAlerts(maxAlerts)` in
`backend/src/modules/command/alertResolution.service.ts`.

Pipeline:
1. `repos.alerts.listPending('default', max)`
2. guard `repos.alertResolutions.findByAlertId(id)` (already resolved → skip)
3. `resolveSingleAlert` → `findAfter(fixtureId, createdAt, 50)` snapshots →
   window analysis → `ResolutionResult { outcome, resolutionType, windowMinutes, evidence }`
4. `repos.alertResolutions.resolveAlert(id, outcome, {...})` (atomic batch)
5. `repos.performance.applyResolutionToCounters(...)`

`outcome ∈ confirmed | confirmed_partial | failed | unknown | expired`.
**`unknown` is never coerced to `failed`.** This is where `AlertOutcomeRecord`,
the ledger `resolved` transition, `SignalFailureAnalysis` (only when `failed`)
and `LearningEvent` should be written.

## 3. Data gaps today (honest)

| Domain | Status | Reason |
|--------|--------|--------|
| live stats (shots/SOT/possession/corners/cards/fouls/offsides/saves) | partial | ESPN `boxscore`, only top live fixtures enriched |
| timed events (goal/card/sub/var) | partial | ESPN `summary`, not all matches |
| xG / dangerous attacks | **absent** | provider does not deliver |
| pre-match context (form, injuries, lineups, suspensions) | **absent** | no rich pre-match API yet |
| head-to-head | **absent** | not collected |
| standings / table position | **absent** | not collected |
| competition type / stage / importance | heuristic | derived from competition name only (`matchContext.service.ts`) |
| odds | out of scope this phase | — |

Everything absent must be recorded as `unknown`/`null` with an `unavailableReason`
— never `0`, never invented.

## 4. Safe integration points

- **Creation**: append a non-blocking call inside `runPatternEvaluation` right
  after `repos.alerts.create(...)` resolves, passing the already-built context.
- **Resolution**: append a non-blocking call inside `resolvePendingAlerts` right
  after `resolveAlert(...)`.
- **Repository**: add `intelligence` to the `Repositories` aggregate
  (`repositories/contracts.ts` + `repositories/index.ts`). Firebase adapter for
  `firebase` mode; a Noop adapter for `prisma` mode (no new Prisma models this
  phase → memory simply not persisted under Prisma, documented).
- **Routes**: new `intelligence.routes.ts` mounted at `/api`.

## 5. Risks to the current engine & mitigations

| Risk | Mitigation |
|------|------------|
| Ledger write fails → alert lost | All memory writes are wrapped in try/catch and **never** block alert creation/resolution. |
| Extra Firestore reads/writes inflate cost | Deterministic doc ids (idempotent), one ledger + one outcome per alert, capped list reads. |
| Prisma mode crash on missing models | Noop adapter implements the full contract without persistence. |
| Double counting on re-run | Deterministic ids (`led_${alertId}`, outcome id = alertId) + merge writes. |
| Breaking scope/maxTriggers/duplicate/Telegram | No change to those code paths; memory is additive and side-effect-only. |

## 6. Conclusion

The alert path is well-defined and stable. The memory layer can be attached
additively at two non-blocking hooks (creation + resolution) plus a Firebase
repository and read-only routes, with zero risk to existing behaviour and zero
invented data (absences recorded as `unknown` with a reason).
