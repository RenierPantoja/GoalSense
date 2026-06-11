# Firebase Retention Policy (Phase E7)

Controls Firestore growth and read cost. Initial conservative policy; tune with
real usage. No automated TTL is enabled yet — this documents the intended policy
and how to enforce it later (scheduled cleanup / Firestore TTL fields).

## Per-collection retention

| Collection | Retention | Rationale |
|-----------|-----------|-----------|
| `providerHealth` | 7–30 days | High churn (one per fetch); only recent health matters |
| `liveSnapshots` | 7–30 days | High volume; keep a window per fixture, prune older |
| `oddsSnapshots` | 7–30 days | Point-in-time; short-term relevance |
| `fixtures` | basic history | Keep recent + referenced; low/medium volume |
| `alerts` | FULL history | Feeds performance analytics — never auto-prune |
| `alertResolutions` | FULL history | Source of truth for performance — never auto-prune |
| `alertOddsContexts` | with alert | Point-in-time reference tied to the alert |
| `signalDeliveries` | full (audit) | Telegram delivery audit trail |
| `telegramChannels` | permanent | Configuration |
| `patternPerformanceCounters` | permanent | Derived; one per pattern; tiny |
| `performanceCounterProcessed` | with alerts | Idempotency markers; prune alongside alerts |

## Cost control

- Adapters use single-equality queries + in-memory sort at current volume; add
  the recommended composite indexes (`backend/firestore.indexes.recommended.json`)
  and server-side `limit` before high volume.
- Performance on-demand reads are capped at `PERFORMANCE_READ_CAP=2000`; the
  E6.2 incremental counters avoid full scans for counter-backed patterns.
- High-volume collections (`liveSnapshots`, `oddsSnapshots`, `providerHealth`)
  are the main cost drivers — enforce the window above first.

## Enforcement options (future)

1. **Firestore TTL policy** on a `expiresAt` field (set `expiresAt = createdAt + window`
   for snapshots/health/odds). Native, no code to run.
2. **Scheduled cleanup function** (Cloud Scheduler + a small job) deleting docs
   older than the window in the high-churn collections.

Both must:
- Never touch `alerts` / `alertResolutions` (performance source of truth).
- Be idempotent and logged.
- Default to dry-run with an explicit confirm, like the E7 maintenance scripts.

## What is NOT pruned

`alerts`, `alertResolutions`, `telegramChannels`, `patternPerformanceCounters`,
`patterns`. Pruning resolutions/alerts would corrupt performance history.
