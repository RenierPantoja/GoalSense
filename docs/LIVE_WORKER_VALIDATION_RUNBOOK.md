# Live Worker Validation Runbook

How to validate the GoalSense operational pipeline (Live Monitor → Pattern
Evaluation → Resolution → Performance) against a **real live match** in Firebase
mode. No fake alerts — if no rich live match exists, record the pendency honestly.

## Identifying a live window

- The Live Monitor uses the **ESPN** provider (`fetchEspnLiveFixtures`,
  `ESPN_BASE_URL=https://site.api.espn.com/apis/site/v2/sports/soccer`).
- A fixture is "live" when its status is one of `1H`, `2H`, `HT`, `ET`, `BT`, `P`.
- Check `GET /api/fixtures/live` — a non-empty list means there are live matches.
- A snapshot is "rich" when ESPN summary enrichment returns stats AND timed
  events (`dataQuality = 'rich'`); "partial" with one; "poor" with neither.
- Good windows: weekend/evening (UTC) when major leagues + South American
  leagues are in play. If all fixtures are `FT`/`NS`, **do not** validate rich
  alerting — record the pendency.

## Configuration (controlled environment, `backend/.env`)

```
PERSISTENCE_PROVIDER=firebase
FIREBASE_SERVICE_ACCOUNT_PATH=../goalsense-29892-firebase-adminsdk-...json
LIVE_WORKER_ENABLED=true
SUMMARY_ENRICHMENT_ENABLED=true
PATTERN_WORKER_ENABLED=true
RESOLUTION_WORKER_ENABLED=true
```

Start: `cd backend && npm run dev`. Stop the workers afterward by setting the
`*_WORKER_ENABLED` flags back to `false` and restarting.

## QA pattern for live validation

Create a real but clearly-marked pattern (`QA_E9_1_LIVE_VALIDATION`), `status:active`,
`action:register_alert`, conservative conditions (e.g. `is_live` +
`minute_between` + a stat threshold), safe `minConfidence`. Never use impossible
conditions and never force an alert. Remove it afterward with the QA cleanup.

## Validation checklist

1. Live Worker: `/api/live-monitor/status` → `totalSnapshotsCreated` increasing,
   fresh `providerHealth`, rich/partial/poor counts; `/api/fixtures/live` non-empty.
2. Pattern Worker: `/api/pattern-worker/status` → `fixturesChecked > 0`,
   `patternsChecked`, `alertsCreated`/`blocked`/`duplicatesBlocked`, no errors.
3. Resolution Worker: `/api/resolution-worker/status` → resolves real pending
   alerts; `unknown` never becomes `failed`.
4. Performance: counter `source:incremental` updates; rebuild idempotent.
5. Telegram: eligibility/approval queue only (no auto-send, no odds, no token leak).

## Stop / cleanup

```
node scripts/firebaseCleanupQaData.mjs --dry-run
node scripts/firebaseCleanupQaData.mjs --confirm
node scripts/firebaseCleanupQaData.mjs --dry-run   # expect 0
```

## Honesty rule

If no rich live match is available during the window, mark Pattern/Resolution
worker rich validation as **PENDING — no live rich match available**, and do not
fabricate an alert to "complete" the check.
