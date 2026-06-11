# Firebase Data Migration Plan (Phase E7)

How to populate Firestore for production. No data is migrated automatically in
this phase; this is the plan + a read-only dry-run script.

## Scenarios

### A. localStorage / frontend data
The Command Center frontend keeps patterns and alerts in localStorage (primary)
with write-through sync metadata (`backendId`, `syncStatus`, `lastSyncedAt`).
- Patterns/alerts already created via the frontend write-through end up in
  Firestore through the normal API path once the backend runs in firebase mode.
- Sync metadata stays in localStorage (`goalsense_alert_sync_meta`); it is a
  client concern and is NOT migrated to Firestore.
- Recommendation: let the frontend write-through seed Firestore naturally; do not
  bulk-import localStorage server-side.

### B. Prisma / Postgres data
If a Postgres DB has historical data, the candidate models → collections are:

| Prisma model | Firestore collection | Notes |
|--------------|---------------------|-------|
| Pattern | patterns | keep ids or remap; preserve `conditionsJson`/`extendedJson` strings |
| Alert | alerts | preserve `evidenceJson`/`temporalEvidenceJson`; status as-is |
| AlertResolution | alertResolutions | deterministic id = alertId |
| TelegramChannel | telegramChannels | preserve `rulesJson` |
| SignalDelivery | signalDeliveries | deterministic id = `${alertId}__${channelId}` |
| Fixture | fixtures | deterministic id = `${provider}__${providerFixtureId}` |
| LiveSnapshot | liveSnapshots | high volume — migrate only recent window |
| OddsSnapshot | oddsSnapshots | migrate only recent window |
| AlertOddsContext | alertOddsContexts | deterministic id = `${alertId}__${marketType}` |
| (derived) | patternPerformanceCounters | DO NOT migrate; rebuild from alerts/resolutions after import |

### C. Clean start (recommended for initial production)
Start Firebase empty and let real data accumulate. Simplest, zero migration risk.

## Recommendation

For initial controlled production, prefer **Scenario C (clean start)** or a
**selective** migration (Scenario B limited to: important `patterns` + meaningful
`alerts`/`alertResolutions` history). **Do not migrate QA/garbage data.** After
any alert/resolution import, run the counter rebuild so performance counters are
consistent (`scripts/rebuildPerformanceCounters.mjs --confirm`).

## Dry-run script

`backend/scripts/migratePrismaToFirebase.mjs`:
- Reads Prisma ONLY if `DATABASE_URL` is set (otherwise prints guidance, exits 0).
- Counts rows per model, validates sampled record shapes, reports issues.
- **Never writes to Firebase** in this phase. `--confirm` is acknowledged but
  writing is intentionally disabled until this plan is approved.

```
cd backend
node scripts/migratePrismaToFirebase.mjs            # report
```

## Migration sequence (when approved, future phase)

1. Backup/export current Firestore (`gcloud firestore export`).
2. Run the dry-run; resolve any shape/id conflicts.
3. Import in dependency order: patterns → fixtures → alerts → alertResolutions →
   telegramChannels → signalDeliveries → (recent) liveSnapshots/oddsSnapshots →
   alertOddsContexts.
4. Use deterministic ids where defined (fixtures, resolutions, deliveries, odds
   contexts) to keep relationships and idempotency.
5. Rebuild performance counters from raw.
6. Validate via `/api/performance/*` and the worker status endpoints.

## Safety

- No automatic migration. No production deletes. Real writes not implemented yet.
- Selective > full. Recent window for high-volume snapshot collections.
- Counters are derived — never migrate them; always rebuild.
