# Live Session Dynamic Fixture Attach (B39)

Attaches fixtures that go live **mid‑session** to a running Live Validation Session, so
the session keeps observing games that started after it was launched.

## How it works

`liveValidationDynamicFixtureAttach.service.ts`:

1. Confirms the session is `running`.
2. Re‑runs the read‑only discovery (`discoverSessionFixtures`) against the session
   scope. Discovery reads **already‑collected** live data (`fixtures.listLive`) — it
   never calls a provider (unless `LIVE_VALIDATION_DYNAMIC_ATTACH_PROVIDER_LOOKUP=true`,
   which is off by default).
3. Filters out fixtures already attached.
4. Attaches new matches, respecting two caps:
   - the local fixture cap (`LOCAL_MAX_LIVE_FIXTURES`, guard B31), and
   - the per‑run cap (`LIVE_VALIDATION_DYNAMIC_ATTACH_MAX_PER_RUN`).
5. Records a `fixture_attached` session event per attach and a `DynamicFixtureAttachRun`
   summarizing the scan, then calls `invalidateSessionContext()` so attribution sees the
   new fixtures immediately.

Every step is non‑fatal. Coverage‑absent (no eligible live fixtures yet) is a
**limitation, not a failure**. Fixtures are never invented.

## Scheduler

`liveValidationDynamicAttach.scheduler.ts` runs `runDynamicAttachAllSessions` on an
unref interval (`LIVE_VALIDATION_DYNAMIC_ATTACH_INTERVAL_MS`, min 15s). It is flag‑gated
and registered in the worker registry as `dynamicFixtureAttach` (pausable/resumable at
runtime; env stays unchanged on pause).

## API

- `GET  /validation/live-sessions/:id/dynamic-attach-runs` → recent runs
- `GET  /validation/live-sessions/dynamic-attach-runs/:runId` → one run
- `POST /validation/live-sessions/:id/dynamic-attach/run` → run now (operator+)

## DynamicFixtureAttachRun

| field | meaning |
|---|---|
| `scannedFixtures` | eligible fixtures discovered this run |
| `matchedFixtures` | new candidates (not yet attached) |
| `attachedFixtures` | actually attached this run |
| `skippedFixtures` | skipped by cap/per‑run limit/error |
| `providerCallsBlocked` | provider lookups intentionally avoided |
| `status` | `completed` \| `completed_with_limitations` \| `failed_non_fatal` |

## Env flags

| flag | default | effect |
|---|---|---|
| `ENABLE_LIVE_VALIDATION_DYNAMIC_ATTACH` | `true` | enable service + scheduler |
| `LIVE_VALIDATION_DYNAMIC_ATTACH_INTERVAL_MS` | `60000` | scheduler interval |
| `LIVE_VALIDATION_DYNAMIC_ATTACH_PROVIDER_LOOKUP` | `false` | allow provider lookups (off = read collected data only) |
| `LIVE_VALIDATION_DYNAMIC_ATTACH_MAX_PER_RUN` | `20` | max fixtures attached per run |

## Limitations

- Without a provider lookup, attach only sees fixtures already collected by the live
  pipeline; a brand‑new live game appears once the pipeline has ingested it.
- The local cap always wins: a full session will defer extra fixtures (reported as a
  limitation), never exceed the cap.
- Attaching changes nothing about scores/outcomes; it only widens what the session
  observes from here on.
