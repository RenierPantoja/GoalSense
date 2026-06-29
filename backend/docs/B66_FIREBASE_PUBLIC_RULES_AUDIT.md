# B66 — Firebase Public Rules Audit

## Active public rules (pre-B66, deployed in B65)
Public READ on 7 raw collections; all client writes denied; default-deny elsewhere.

## Collections exposed for public read & their fields

| Collection | Key fields (raw) | Sensitive content? |
|---|---|---|
| espnLiveFirstWorkerRuns | id, status, mode, startedAt, stoppedAt, heartbeatAt, leaseExpiresAt, processId, hostId, fixtureIds, sessionId, pollIntervalSeconds, snapshotsCaptured, rechecksTriggered, postMatchResolved, errors, warnings, limitations | `processId`/`hostId` are low-value host identifiers; `errors` could in theory carry stack fragments |
| liveMonitoringSessions | id, status, startedAt, endedAt, fixtureIds, snapshotsCaptured, governanceEvaluations, liveRechecks, errors, warnings, limitations | `errors`/`warnings` free-text |
| liveMonitoringFixtureStates | id, sessionId, fixtureId, lastSnapshotAt, snapshotCount, lastStatus, lastMinute, lastScore, updatedAt | none material |
| espnLiveFirstFixtureLeases | fixtureId, sessionId, workerRunId, acquiredAt, heartbeatAt, leaseExpiresAt, status, owner, limitations | `owner` = processId@hostId (host identifier) |
| espnLiveFirstRecoveryReports | id, generatedAt, orphanedSessionsFound, recoveredSessions, closedSessions, reasons, limitations | none material |
| liveFirstPostMatchOutcomes | fixtureId, sessionId, finalStatus, finalScore, outcome, evaluable, reason, governanceEvaluations, governanceAccuracy, snapshotCount, eventsDetected, limitations, createdAt | none material |
| dailyValidationReports | date, backendHealth, goNoGoStatus, liveFirstReal, fixturesAnalyzed, snapshots, evaluable cases, limitations, generatedAt | none material |

### Sensitive-content scan
- secret / token / API key / service account / private_key / client_email: **none** (worker never writes these into telemetry docs).
- PII / email / IP / precise location: **none**.
- raw ESPN payload / headers / sensitive logs: **none** (raw `statsJson`/`eventsJson` live on `liveSnapshots`, which is NOT public).
- Low-value identifiers present: `processId`, `hostId`, `owner` (host process), and free-text `errors`/`warnings` arrays.

## Which collections does Vercel actually need?
The hosted control plane needs: latest worker status, sessions, leases, daily report, causal outcomes, recovery status, freshness. All of these can be served by a **single sanitized collection**.

## Which can become private again?
All 7 raw collections — once the sanitized `controlPlanePublicSummaries` is published and the hosted code reads it exclusively. They are kept as **transitional** public reads only while the deployed Vercel diagnostic/raw-fallback still references them.

## What can be aggregated/sanitized?
Everything the panel shows. Free-text `errors`/`warnings` are reduced to `warningsCount`; host identifiers (`processId`/`hostId`/`owner`) are dropped; only allowlisted fields are published.

## Rollback
Revert `firestore.rules` to default-deny (or B65 raw-only) and `deployFirestoreRulesViaApi.mjs`. Worker (Admin SDK) is unaffected.

## Minimal ideal rule
Public read on `controlPlanePublicSummaries` only; all raw collections admin-only; all client writes denied; default-deny. (Adopted once the Vercel deployment reads the sanitized model exclusively — see `FIREBASE_RULES_HARDENING_B66.md`.)
