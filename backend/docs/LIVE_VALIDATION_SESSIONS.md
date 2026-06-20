# Live Validation Sessions (Phase B37)

A controlled, **observational** lens for validating real games while GoalSense runs
locally: pick fixtures/leagues, start/pause/complete a session, and read an honest
summary/report (coverage, snapshots, signals, alerts, opportunities, outcomes,
evidence, operational risk). It NEVER starts workers, changes guard mode/env, or
alters any trigger/result/score/outcome.

## Concept
A session = period + fixture scope + goals + an auditable timeline + a summary/
report. Lifecycle: `draft → ready → running → (paused) → completed | cancelled`.
Single running session by default (`LIVE_VALIDATION_ALLOW_MULTIPLE_RUNNING=false`).

## Flags
```
ENABLE_LIVE_VALIDATION_SESSIONS=true
LIVE_VALIDATION_ALLOW_MULTIPLE_RUNNING=false
LIVE_VALIDATION_AUTO_ATTACH=true
LIVE_VALIDATION_REPORT_LIMIT=1000
```

## How it works (safe by design)
- **Fixture discovery** reads already-collected fixtures (`fixtures.listLive`),
  filtered by the session scope (leagueNames/teamNames/fixtureIds) and bounded by
  the B31 local fixture cap. It NEVER calls a provider and NEVER expands beyond the
  cap. Nothing live → coverage-absent limitation (NOT a failure).
- **Summary/report** are aggregated on demand by READING existing data per fixture
  (snapshots, signal ledger, alerts, outcomes, opportunities, evidence) + the
  process-wide guard metrics. No new write path in the hot loops → zero risk to
  B12–B36.
- **Lifecycle** is metadata only; pausing a session does NOT pause global workers.
- **Recommendations** are cautious and honest (raise snapshot interval, reduce
  fixtures, low provider coverage, run backtest/replay after more data, insufficient
  sample). **Never** profit/hit-rate/odds/stake/bet language.
- **go/no-go**: `go` / `go_with_limitations` / `insufficient_data` / `no_go` — derived
  from coverage + operational risk, never from a promised win-rate.

## Persistence
Firebase collections `liveValidationSessions`, `liveValidationSessionFixtures`,
`liveValidationSessionEvents`, `liveValidationSessionReports`. Noop honest under
Prisma mode. No secrets in events (sanitized; payloads truncated).

## Routes (`/api/validation/live-sessions`)
list/create/get/patch; `start`/`pause`/`resume`/`complete`/`cancel`;
`fixtures`/`events`/`summary`; `POST report` + `GET report`. GET open; mutating
require operator+; env-gated by `ENABLE_LIVE_VALIDATION_SESSIONS`.

## Honesty
zero mock · zero invented data · zero odds · zero Telegram · zero auto-bet ·
auto-create off · coverage-absent ≠ failure · provider-unavailable explicit ·
unknown ≠ failed · not_evaluable ≠ failed · confirmed_partial = partial-useful ·
score/confidence/counters/patterns unchanged.

## Using with profiles
- `safe_local`: validate provider coverage/snapshots with workers off (read-only
  observation of whatever is collected).
- `live_validation`: enable the live worker + enforce guards, create a session for
  the target leagues, watch coverage/signals/opportunities accrue, then complete +
  read the report.

## Limitations (real)
- **Observational grouping**: B37 groups by fixture + window. It does NOT thread a
  per-record `sessionId` into B12 writers (ledger/opportunity/snapshot) — that would
  touch hot paths and risk the inviolable preservation. Per-record tagging + per-
  alert/opportunity session badges are a future enhancement.
- Provider/snapshot metrics are process-wide (not isolated per session).
- Under Prisma mode sessions are not persisted (Noop) — use Firebase mode.
- Discovery sees only fixtures already in the backend; if the live worker is off and
  nothing was collected, the session is honestly empty.

---

## B38 update — real per-record attribution
The B37 limitation (grouping only by fixture/window) is addressed: records created
during a running session are stamped with an optional `validationSessionId`, the
session report adds exact-vs-inferred attribution + an outcome QA breakdown
(unknown/not_evaluable/pending never failures), and linked-records endpoints expose
session alerts/opportunities/evidence/outcomes. See `LIVE_SESSION_ATTRIBUTION.md`.

## B39 — Record index, scoped metrics, dynamic attach

A running session now maintains an auxiliary index of the records it produced, scoped
operational counters (debounced + flushed), and can attach fixtures that go live
mid‑session. New endpoints: `GET :id/record-links`, `GET :id/metrics`,
`POST :id/metrics/rebuild` (operator+), `GET :id/dynamic-attach-runs`,
`POST :id/dynamic-attach/run` (operator+). All additive, non‑fatal, and never alter
calculations. See `LIVE_SESSION_RECORD_INDEX.md` and
`LIVE_SESSION_DYNAMIC_FIXTURE_ATTACH.md`.

## Match Intelligence Fabric (related)

The Match Intelligence Fabric reuses the same internal memory (signal ledger, outcomes)
and the same provider-budget guard to build a per-fixture "match brain" for today's
games and an observe-first alert precheck. It is observational and additive — see
`MATCH_INTELLIGENCE_FABRIC.md`.
