# Firebase Live Worker Validation Report (Phase E9.1)

Auditable record of the live-pipeline validation attempt in Firebase mode.

- **Date/time:** 2026-06-15 ~22:55 UTC
- **Active provider:** firebase (controlled env via `backend/.env`)
- **Project:** `goalsense-29892` (masked in `/api/health`: `goal***892`)
- **Workers:** LIVE + PATTERN + RESOLUTION enabled during the window;
  `SUMMARY_ENRICHMENT_ENABLED=true`.

## Live window result

- ESPN provider returned **31 fixtures** per run; `/api/fixtures/live` = **[]**.
- All returned fixtures were already-captured **finished (FT)** matches → smart-diff
  created **0 new snapshots** (`totalSnapshotsCreated: 0`, rich/partial/poor = 0).
- `totalSummariesFetched: 0` — enrichment only targets live-status fixtures, and
  none were live.
- **Conclusion: no live in-progress match was available during the window.**

## Results

| Area | Result |
|------|--------|
| Live Worker | ✅ operational — fetched ESPN, wrote fresh `providerHealth` to Firestore, smart-diff correct (0 dup snapshots). **Rich snapshot capture NOT exercised** (no live match). |
| Pattern Worker | ✅ runs clean — `patternsChecked` read the QA pattern from Firestore, `fixturesChecked:0`, `alertsCreated:0`, `consecutiveErrors:0`, `lastError:null`. **Rich validation PENDING — no live rich match. No fake alert created.** |
| Resolution Worker | ✅ runs clean — `totalRuns` advanced, 0 pending alerts, 0 errors. **PENDING — no real live alert to resolve.** |
| Telegram | `TELEGRAM_ENABLED=false`; status honest. Eligibility/approval-queue logic validated in E6.1; no auto-send, no odds, no token exposed. |
| Performance | Counter logic (incremental + fallback + idempotent rebuild) validated in E6.2/E8/E9 controlled write tests. **Post-live-resolution validation PENDING** (no live alert resolved). |
| Odds | `ODDS_ENABLED=false` → `/api/odds/status` honest, no crash, no fake odds. API-Football still suspended/disabled. |

## QA pattern

- Created `QA_E9_1_LIVE_VALIDATION` (real, `status:active`, `action:register_alert`,
  conservative `is_live` + `minute_between` conditions, `minConfidence:50`).
- No alert was produced (no live fixtures to evaluate).
- Removed afterward: cleanup dry-run matched 1 pattern → `--confirm` → re-dry-run **0**.

## Infra

| Item | Status |
|------|--------|
| Backup / export | **PENDING** — requires owner gcloud/Console access; not executed (not fabricated). Runbook: `FIREBASE_BACKUP_RUNBOOK.md`. |
| Firestore indexes | **PENDING deploy** — Firebase CLI not installed in this environment. `firestore.indexes.json` ready; `firebase deploy --only firestore:indexes` documented. No composite-index error at runtime (single-equality + in-memory sort). |
| Cleanup QA | ✅ executed (dry-run → confirm → verify 0). |
| Rollback Prisma | ✅ preserved + documented (`FIREBASE_ROLLBACK_RUNBOOK.md`); env guard validated. |

## Honesty statement

There were no live in-progress matches during this validation window, so
rich-data Pattern Worker alerting and live Resolution Worker outcomes could not be
validated. The worker cycles, Firestore connectivity, scheduling, smart-diff,
provider-health writes, and clean error-free runs ARE validated. No artificial
alert was created to simulate a live result.

## Pending for E10

- Re-run this validation during a real live rich match (weekend/evening UTC).
- Execute Firestore backup/export (owner access).
- Install Firebase CLI + deploy `firestore.indexes.json`.
- Then proceed to the production cutover + (later) Prisma removal.
