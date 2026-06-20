# Local Ops Metrics Persistence (Phase B32)

Optional persistence of the in-memory local-operations guard counters, so
operational history survives backend restarts. **Disabled by default.**

## Flags
```
ENABLE_LOCAL_OPS_METRICS_PERSISTENCE=false
LOCAL_OPS_METRICS_INTERVAL_MS=300000   # 5 min; interval capture only when enabled
LOCAL_OPS_METRICS_RETENTION_DAYS=7     # documented retention window (advisory)
```

## What is captured (`LocalOpsMetricsSnapshot`)
`capturedAt`, `profile`, `guardMode`, `providerCallsAllowed/Blocked`,
`snapshotsWritten`, `snapshotsSkippedDuplicate/Interval/Max`,
`fixturesSkippedByCap`, `readBudgetUsed`, `writeBudgetUsed`, `riskLevel`,
`warnings`. No secrets, no tokens, no payloads.

## How it works
- `captureLocalOpsMetrics()` builds a snapshot from the current counters and, when
  persistence is enabled, writes it via the IntelligenceRepository
  (Firebase collection `localOpsMetrics`; Noop honest under Prisma).
- Optional interval capture starts at boot (`startLocalOpsMetricsCapture`) but only
  runs when persistence is enabled; the timer is `unref`-ed so it never blocks exit.
- Manual capture: `POST /api/system/local-operations/metrics/capture` (operator+).
- History: `GET /api/system/local-operations/metrics/history`.

## Behavior
- Disabled → `capture` returns `persisted: false` with an honest note; history is
  empty with a clear limitation.
- Low write volume by design (interval-driven or manual).

## Limitations (real)
- Under `PERSISTENCE_PROVIDER=prisma` the history is **not** persisted (Noop).
  Use Firebase mode to retain it.
- Counters themselves remain in-memory at runtime; persistence is periodic
  sampling, not continuous accounting.
- Retention-days for metrics is advisory (no automatic pruning of old samples yet).
