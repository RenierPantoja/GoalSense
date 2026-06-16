# Owner Gate Execution Log

Honest record of the attempt to close the owner-controlled gates before E10.
Nothing here is fabricated; gates are only marked done with real evidence.

- **Date/time:** 2026-06-15 ~23:xx UTC
- **Environment:** owner dev machine; `npx firebase-tools` v15.20.0 (no global install)

## 1. Firestore index deploy

| Step | Result |
|------|--------|
| `firebase-tools projects:list` | ✅ listed `goalsense-29892` (read works via ambient/ADC) |
| `firebase-tools deploy --only firestore:indexes` (ambient auth) | ❌ `Failed to authenticate, have you run firebase login?` |
| `firebase-tools deploy ...` (forced Admin SDK SA, E9.3) | ❌ `HTTP 403 Permission denied` (SA lacks index/serviceusage roles) |
| `firebase-tools login:list` | ⚠️ `No authorized accounts, run "firebase login"` |

**Status: PENDING.** Deploy requires an interactive `firebase login` (browser
OAuth) that cannot be completed by the agent. **Owner action:**
```
npx firebase-tools login
npx firebase-tools deploy --only firestore:indexes --project goalsense-29892
```
Then paste the deploy output into `FIRESTORE_INDEX_DEPLOY_STATUS.md` and flip the gate.

> Not blocking staging: adapters use single-equality + in-memory sort, so no
> composite index is required at current volume.

## 2. Firestore backup / export

**Status: PENDING.** `gcloud`/`gsutil` not installed; needs the owner's Console or
gcloud session. **Owner action:** `OWNER_GATE_ACTIONS.md` §2; record evidence in
`FIREBASE_BACKUP_EXECUTION_STATUS.md`.

## 3. Live-rich watcher run

| Step | Result |
|------|--------|
| `watchLiveValidationWindow.mjs --duration 3 --interval 45` (real window) | `NO_LIVE_FIXTURES` (no live match), workers ran clean, **no fake alert** |

**Status: PENDING** — rich Pattern/Resolution/Telegram/Performance validation
needs a real live-rich window. Re-run `npm run watch:live:long` during live
football; record evidence when `bestObserved=LIVE_RICH_DATA`.

## GO / NO-GO

**Production cutover: NO-GO.** Index deploy, backup/export, and live-rich worker
validation remain PENDING (owner / live-window dependent). Prisma rollback ready;
default global unchanged; Prisma not removed.
