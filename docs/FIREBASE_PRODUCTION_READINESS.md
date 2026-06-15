# Firebase Production Readiness (Phase E7)

Preparation, validation, and safe migration planning for running the backend on
Firebase/Firestore in controlled production. **Prisma is not removed and the
default `PERSISTENCE_PROVIDER` stays `prisma`.** This phase adds the plans,
scripts (dry-run by default), index recommendations, retention policy, and the
switch checklist needed before any default change.

## Firestore collection inventory

All collections are scoped to a single user (`userId = "default"`) today.

### `providerHealth/{autoId}`
- Fields: `provider`, `endpoint`, `status` (`ok`\|`degraded`\|`down`), `latencyMs`, `errorMessage`, `checkedAt`, `createdAt`.
- Written by: Live Monitor worker (`recordProviderHealth`). Read by: `/api/provider-health`.
- Retention: 7–30 days. Growth: HIGH (one per fetch). TTL cleanup recommended.
- Index: `provider + checkedAt desc` (recommended).

### `telegramChannels/{autoId}`
- Fields: `userId`, `name`, `chatId`, `type`, `isActive`, `rulesJson`, `createdAt`, `updatedAt`.
- Written/read by: Telegram service + routes.
- Retention: permanent (config). Growth: LOW.

### `signalDeliveries/{alertId}__{channelId}` (deterministic id)
- Fields: `userId`, `alertId`, `channelId`, `status` (`pending`\|`sent`\|`failed`\|`skipped`), `provider`, `messageText`, `errorMessage`, `sentAt`, `createdAt`.
- Written/read by: Telegram service (send / approval queue / ignore).
- Retention: keep for audit. Growth: MEDIUM.
- Indexes: `channelId + createdAt desc`, `channelId + status + createdAt desc`.

### `patterns/{autoId}`
- Fields: `userId`, `name`, `description`, `status`, `severity`, `scope`, `action`, `minConfidence`, `requireRichData`, `onlyLive`, `onlyPreMatch`, `conditionsJson`, `scopeFilterJson`, `extendedJson`, `templateId`, `createdAt`, `updatedAt`.
- Written/read by: Patterns service (frontend write-through). `archive` = soft delete (`status=archived`).
- Retention: permanent. Growth: LOW.

### `alerts/{autoId}`
- Fields: `userId`, `patternId`, `fixtureId`, `status`, `confidence`, `signalState`, `triggerMinute`, `triggerScoreHome/Away`, `evidenceJson`, `temporalEvidenceJson`, `duplicateSignature`, `createdAt`, `updatedAt`.
- Written by: Pattern worker + alerts API. Read by: alerts API, Telegram queue, performance.
- Retention: KEEP FULL (feeds performance). Growth: MEDIUM/HIGH.
- Indexes: `userId + createdAt desc`, `patternId + createdAt desc`, `fixtureId + createdAt desc`, `duplicateSignature + createdAt desc`, `userId + status + createdAt desc`.

### `alertResolutions/{alertId}` (deterministic id)
- Fields: `alertId`, `resolutionStatus`, `resolutionType`, `windowMinutes`, `evidenceJson`, `resolvedAt`, `createdAt`.
- Written by: Resolution worker + resolve API (atomic batch with alert status). Source of truth for performance.
- Retention: KEEP FULL. Growth: MEDIUM.

### `fixtures/{provider}__{providerFixtureId}` (deterministic id)
- Fields: `provider`, `providerFixtureId`, `canonicalKey`, `homeName`, `awayName`, `competition`, `status`, `startTime`, `createdAt`, `updatedAt`.
- Written by: Live Monitor (upsert, status-regression guarded). Read by: workers, odds, `/fixtures/live`.
- Retention: basic history. Growth: MEDIUM.
- Indexes: `status + updatedAt desc`; `canonicalKey` (auto single-field).

### `liveSnapshots/{autoId}`
- Fields: `fixtureId`, `provider`, `minute`, `status`, `scoreHome/Away`, `penaltyHome/Away`, `dataQuality`, `statsJson`, `eventsJson`, `capturedAt`, `createdAt`. Immutable.
- Written by: Live Monitor (only on change). Read by: workers, `/live-snapshots/recent`.
- Retention: 7–30 days (HIGH growth; oldest can be pruned per fixture). 
- Index: `fixtureId + capturedAt desc`; `capturedAt desc` (auto).

### `oddsSnapshots/{autoId}`
- Fields: `fixtureId`, `provider`, `bookmaker`, `marketType`, `selection`, `line`, `odds`, `currency`, `rawJson`, `capturedAt`, `createdAt`. Point-in-time, immutable.
- Written/read by: Odds service. Retention: 7–30 days. Growth: MEDIUM (when odds enabled).
- Indexes: `fixtureId + capturedAt desc`, `marketType + capturedAt desc`.

### `alertOddsContexts/{alertId}__{marketType}` (deterministic id)
- Fields: `alertId`, `fixtureId`, `marketType`, `selectedLine`, `bestOdds`, `bookmaker`, `provider`, `capturedAt`, `createdAt`.
- Written/read by: Odds service. Retention: keep with alert. Growth: LOW.

### `patternPerformanceCounters/{patternId}`
- Fields: counts (`totalAlerts`, `resolvedAlerts`, `confirmed`, `confirmedPartial`, `failed`, `unknown`, `expired`, `useful`, `sumConfidence`), rates (`usefulRate`, `failedRate`, `unknownRate`, `confirmedRate`), breakdown maps (`byMomentumSource`, `byDataQuality`, `byProvider`, `byResolutionType`), `createdAt`, `lastUpdatedAt`.
- Written by: performance hooks (idempotent). Read by: performance service (counter-first). Growth: LOW (one per pattern).

### `performanceCounterProcessed/{alertId}` (deterministic id)
- Fields: `alertId`, `patternId`, `createdApplied`, `resolvedApplied`, `appliedAt`.
- Idempotency markers preventing double-counting. Growth: tracks alerts (MEDIUM); prune with alerts.

## Recommended indexes

See `backend/firestore.indexes.recommended.json` (reference) and the deployable
`firestore.indexes.json` at the repo root (Phase E8). **None are required today** — no
composite index error was hit during E6.1 runtime QA because every adapter uses
single-equality queries + in-memory sort/filter. Create the composite indexes
before switching adapters to server-side `where + orderBy + limit` at scale.

Deploy (when Firebase CLI is configured): `firebase deploy --only firestore:indexes`.

## Provider diagnostic

`GET /api/health` reports the active provider without secrets (Phase E8):
`persistenceProvider`, `databaseUrlConfigured`, `firebaseConfigured`,
`firebaseProjectId` (masked, e.g. `goal***892`).

## Maintenance scripts (all dry-run by default)

| Script | Purpose | Default | Destructive? |
|--------|---------|---------|--------------|
| `scripts/firebaseCleanupQaData.mjs` | remove QA docs by conservative markers | dry-run (counts) | only with `--confirm` |
| `scripts/rebuildPerformanceCounters.mjs` | rebuild every pattern counter via the dev rebuild endpoint | dry-run (lists) | no (rebuild is idempotent; `--confirm` to run) |
| `scripts/migratePrismaToFirebase.mjs` | read-only Prisma inventory + shape validation | dry-run | no (writes NOT implemented) |

## Observability (minimum metrics)

Available via status endpoints / logs:
- Live Monitor: `/api/live-monitor/status` → `totalRuns`, `consecutiveErrors`, `lastError`, `totalFixturesSeen`, `totalSnapshotsCreated`, rich/partial/poor counts.
- Pattern worker: `/api/pattern-worker/status` → `totalRuns`, `totalAlertsCreated`, `totalBlocked`, `totalDuplicatesBlocked`, `consecutiveErrors`, `lastError`.
- Resolution worker: `/api/resolution-worker/status` → `totalResolved`, confirmed/partial/failed/unknown/expired, `consecutiveErrors`, `lastError`.
- Counter apply failures: logged as `[PatternWorker] counter onAlertCreated failed ...` / `[ResolutionWorker] counter applyResolution failed ...` (warnings; never block the primary write).
- Telegram deliveries: `/api/telegram/deliveries` (sent/failed/skipped).
- Firestore read cap: `PERFORMANCE_READ_CAP=2000` (documented in `FIREBASE_PERFORMANCE_ANALYTICS.md`).

## Related docs

- `FIREBASE_DATA_MIGRATION_PLAN.md`
- `FIREBASE_RETENTION_POLICY.md`
- `FIREBASE_DEFAULT_SWITCH_CHECKLIST.md`
- `FIREBASE_STAGING_SWITCH_REPORT.md` (E8), `FIREBASE_DEFAULT_SWITCH_REPORT.md` (E9)
- `FIREBASE_BACKUP_RUNBOOK.md`, `FIREBASE_ROLLBACK_RUNBOOK.md` (E9)
- `LIVE_WORKER_VALIDATION_RUNBOOK.md`, `FIREBASE_LIVE_WORKER_VALIDATION_REPORT.md` (E9.1)
- `FIREBASE_BACKEND_REPOSITORIES.md`, `FIREBASE_PERFORMANCE_ANALYTICS.md`, `BACKEND_PERSISTENCE_STRATEGY.md`
