# Live Session Record Index — Audit (Phase B39)

> Where to add a dedicated session→record index, scoped metrics, and dynamic
> fixture attachment, reusing the B38 attribution hooks. Auxiliary index only;
> never the source of truth; never alters results/scores/counters/patterns.

## 1. Existing attribution hooks (B38) — where links/metrics can be emitted
| Record | Hook (already resolves attribution) |
|--------|-------------------------------------|
| snapshot | `liveMonitor.captureLiveSnapshot` (resolveSessionAttribution + event) |
| signal_ledger + alert | `intelligenceMemory.recordAlertCreated` |
| outcome | `intelligenceMemory.recordAlertResolved` |
| auto_opportunity | `autoEngine.service` write loop |
| policy_evaluation | `autoAlertPolicyEvaluation.service` |
| evidence_reference | `evidenceLineage.buildReference` (validationSessionId) |

Each is non-fatal. Adding a `linkRecordToSession(...)` + `incrementSessionMetric(...)`
beside the existing event is low-risk and additive.

## 2. Index design
- New collection `liveValidationRecordLinks`: one doc per (session, record), id is
  deterministic (`lvl_<sha(sessionId|recordType|recordId)>`) → idempotent.
- `attributionStrength`: `exact_session_id` (record carries validationSessionId) vs
  `inferred_fixture_window` (fallback) vs `unknown`.
- `listSessionLinkedRecordsIndexed(sessionId)` reads by `validationSessionId` (single
  indexed query) instead of fanning out per fixture (B38 cost).

## 3. Metrics design
- `liveValidationSessionMetricCounters` (bucket `total`/`hour`): upserted with a
  debounced in-memory accumulator flushed every `LIVE_VALIDATION_SESSION_METRICS_FLUSH_MS`.
- Writer-level increments (signals/alerts/opportunities/policy/outcomes/snapshots).
- Provider/guard metrics remain process-wide; the report marks scoped vs
  `process_global_fallback`. `rebuildSessionMetricsFromLinks` recomputes from links.

## 4. Dynamic attach
- `liveValidationDynamicFixtureAttach.service.ts` scans `fixtures.listLive` (already
  collected; no provider call unless `LIVE_VALIDATION_DYNAMIC_ATTACH_PROVIDER_LOOKUP=true`),
  matches the running session's scope (reusing the discovery filter), attaches new
  fixtures (respecting `LOCAL_MAX_LIVE_FIXTURES` and a per-run cap), records
  `fixture_attached` events + a `DynamicFixtureAttachRun`, and invalidates the
  context cache. A controlled scheduler runs it on an interval (unref, flag-gated).

## 5. Cache invalidation
- B38 `invalidateSessionContext()` is already called on every lifecycle change;
  dynamic attach also invalidates after attaching so new fixtures attribute promptly.

## 6. Honesty
- Index/metrics failure → non-fatal; legacy data without links → fixture/window
  fallback marked inferred; `inferred` never becomes `exact`; unknown/not_evaluable/
  pending never failures.

## 7. Files
validation/liveValidationIndex.types.ts (new), liveValidationRecordIndex.service.ts,
liveValidationSessionMetrics.service.ts, liveValidationDynamicFixtureAttach.service.ts,
liveValidationDynamicAttach.scheduler.ts; repo (contract+firebase+noop); writer
integrations; linkedRecords (index-first) + report (B39); routes; env; server.ts +
workerRegistry; frontend types/api/Lab/LocalOps/badges; reindex + smoke; docs.
