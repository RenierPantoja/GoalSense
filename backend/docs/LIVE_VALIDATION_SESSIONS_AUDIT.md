# Live Validation Sessions — Audit (Phase B37)

> How the live monitor selects fixtures and where session data can be grouped,
> so a controlled validation session can be layered ON TOP without altering any
> trigger/result/score/outcome calculation.

## 1. How fixtures are selected today
- `liveMonitor.worker.ts` → `fetchEspnLiveFixtures()` (all live) → `processLiveFixtures()`.
  There is NO per-fixture allow-list; the B31 `applyFixtureCap` bounds the count.
- Auto Engine (`autoEngine.service.ts`) scans `repos.fixtures.listLive(...)`.
- Pattern worker (`commandEvaluation.service.ts`) evaluates `repos.fixtures.listLive(...)`.
- Conclusion: a session's `fixtureScope` is a **filter/lens**, not a new collector.
  The session reduces what we *report on*; it must never expand beyond the local cap
  and never force provider calls.

## 2. Where data is generated (groupable by fixtureId)
| Data | Repo read for session aggregation |
|------|------------------------------------|
| Snapshots / coverage | `dataCoverageMonitor` + `liveSnapshots.findLatestByFixture` |
| Provider/guard metrics | `livePipelineGuard.getGuardMetrics` (process-wide) |
| Signals (ledger) | `intelligence.listSignalLedgerEntries({ fixtureId })` |
| Alerts | `alerts.findByFixtureIds(fixtureId)` |
| Outcomes | `intelligence.getAlertOutcomeByAlertId` per alert |
| Opportunities | `intelligence.listAutoOpportunitiesByFixture(fixtureId)` |
| Evidence links | `intelligence.listEvidenceSnapshotReferencesByFixture(fixtureId)` |

Every one of these is keyed by `fixtureId`, so a session that knows its fixture set
can build an honest summary by reading existing data — **no new write path** in the
hot loops, zero risk to B12–B36.

## 3. Design decision (safe, observational)
- A session persists: the session record, its attached fixtures, its operational
  events, and generated reports (4 new Firebase collections).
- The summary/report are **aggregated on demand** from the existing repos for the
  session's fixtures within the session window. We do NOT thread `sessionId` into
  `SignalLedgerEntry`/`AutoOpportunity`/snapshot writes (deep, risky, would touch
  B12 hot paths). This keeps the inviolable preservation intact.
- The session lifecycle (start/pause/complete/cancel) is metadata only; it never
  starts/stops workers automatically and never changes guard mode/env.

## 4. Guards honored
- Fixture discovery reads `fixtures.listLive` (already-collected) and respects the
  B31 fixture cap; it never calls a provider without budget. If nothing is live →
  `ready`/`running` with a coverage-absent limitation (NOT a failure).

## 5. Env + auth
- `ENABLE_LIVE_VALIDATION_SESSIONS=true`, `LIVE_VALIDATION_ALLOW_MULTIPLE_RUNNING=false`,
  `LIVE_VALIDATION_AUTO_ATTACH=true`, `LIVE_VALIDATION_REPORT_LIMIT=1000`.
- Routes: GET open/viewer; mutating (create/start/...) operator+; report operator+.

## 6. Files
validation/liveValidation.types.ts, liveValidation.service.ts,
liveValidationFixtureDiscovery.service.ts, liveValidationEventRecorder.service.ts,
liveValidationReport.service.ts, utils/liveValidationReport.util.ts (pure),
routes/liveValidation.routes.ts; repositories (contract+firebase+noop); env.ts;
server.ts; frontend liveValidation types/api + LiveValidationLab + LocalOps integration; docs.

## 7. Honest limitation (documented)
Per-record `sessionId` tagging and per-alert/opportunity session badges are NOT
implemented in B37 (would require threading into B12 writers). The session groups
data by fixture + time window instead. Tagging is a future enhancement.
