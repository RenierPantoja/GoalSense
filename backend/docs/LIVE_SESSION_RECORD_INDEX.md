# Live Session Record Index (B39)

Auxiliary, idempotent index that links a Live Validation Session to the records it
produced (snapshots, signals, alerts, outcomes, auto‑opportunities, policy
evaluations, evidence references). It lets the Lab query a session's records with one
indexed read instead of fanning out per fixture, and powers scoped operational
metrics.

## Principles

- The index is **never the source of truth**. It is a denormalized convenience.
- Legacy records (created before B39, or without `validationSessionId`) fall back to
  the B38 fixture/window grouping and are reported as `inferred_fixture_window`.
- `inferred` never becomes `exact`. A link is `exact_session_id` only when the
  underlying record carried the session id at creation time.
- Every write is **non‑fatal** (`void` / try‑catch). A failed link never blocks the
  domain write that triggered it.
- The index never changes any calculation: score, confidence, counters, patterns,
  outcomes, and results are untouched.

## Data model

`LiveValidationRecordLink` (collection `liveValidationRecordLinks`):

| field | meaning |
|---|---|
| `id` | deterministic `lvl_<sha1(sessionId|recordType|recordId)>` — idempotent |
| `validationSessionId` / `sessionId` | owning session |
| `recordType` | `snapshot` \| `signal_ledger` \| `alert` \| `outcome` \| `auto_opportunity` \| `policy_evaluation` \| `evidence_reference` \| … |
| `recordId` | id of the linked record |
| `fixtureId`, `alertId`, `opportunityId`, `outcomeId`, `policyEvaluationId`, `evidenceReferenceId`, `snapshotId` | optional cross‑refs |
| `attributionStrength` | `exact_session_id` \| `inferred_fixture_window` \| `unknown` |
| `source` | writer that created it (`ledger`, `auto_engine`, `policy`, `live_monitor`, `reindex`, …) |
| `linkReason`, `limitations` | honest provenance |

The deterministic id makes re‑linking the same record a no‑op (idempotent upsert at the
repository layer).

## Writers (where links are created)

| Record | Service | Metric incremented |
|---|---|---|
| signal_ledger + alert | `intelligenceMemory.recordAlertCreated` | `signalsCreated`, `alertsCreated` |
| outcome | `intelligenceMemory.recordAlertResolved` | `outcomesResolved` (+`unknownOutcomes`) |
| auto_opportunity | `autoEngine.service` | `opportunitiesCreated` |
| policy_evaluation | `autoAlertPolicyEvaluation.service` | `policyEvaluations` |
| snapshot | `liveMonitor.captureLiveSnapshot` | `snapshotsWritten` |

All only fire when the record actually carries a `validationSessionId` (i.e. it was
created during a running session with attribution — see B38).

## Scoped metrics

`liveValidationSessionMetrics.service.ts` keeps an in‑memory per‑session accumulator,
debounced and flushed on an interval (`LIVE_VALIDATION_SESSION_METRICS_FLUSH_MS`) into
`liveValidationSessionMetricCounters`. Metrics are **operational counters**, not
probabilities and not a hit‑rate. They can be rebuilt deterministically from the index
via `rebuildSessionMetricsFromLinks` (used by `POST :id/metrics/rebuild`).

## API

- `GET  /validation/live-sessions/:id/record-links` → `{ links, coverage }`
- `GET  /validation/live-sessions/:id/metrics` → scoped counter (or `null`)
- `POST /validation/live-sessions/:id/metrics/rebuild` → rebuild from index (operator+)

GET reads are open/honest; POST requires operator+ (`run:scan`).

## Reindex script

`npm run reindex:live-session-records -- --sessionId <id> [--persist] [--limit N]`

Dry‑run by default. With `--persist` (and `ENABLE_LIVE_VALIDATION_SESSION_REINDEX=true`)
it creates **exact** links only for records that already carry the session id. It never
fabricates exact links for legacy/inferred records.

## Env flags

| flag | default | effect |
|---|---|---|
| `ENABLE_LIVE_VALIDATION_SESSION_METRICS` | `true` | enable scoped counters + flush |
| `LIVE_VALIDATION_SESSION_METRICS_FLUSH_MS` | `30000` | debounce/flush interval |
| `ENABLE_LIVE_VALIDATION_SESSION_REINDEX` | `false` | allow reindex `--persist` |

## Limitations

- The index reflects only records created during a running session with attribution.
  Historical sessions show `inferred_fixture_window` grouping (B38), never exact.
- The Noop (Prisma fallback) repository does not persist links/counters/runs; the
  feature degrades to the B38 fixture/window view. Use Firebase for persistence.
- Scoped counters are best‑effort operational signals; they never replace or alter
  score, confidence, pattern results, or outcome classification.
