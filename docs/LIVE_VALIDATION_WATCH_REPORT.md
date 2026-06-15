# Live Validation Watch Report (Phase E9.2)

Output of `scripts/watchLiveValidationWindow.mjs` — an observe-only watcher that
polls the running backend (firebase mode) and classifies the live window. It
never creates alerts, manipulates snapshots, forces status/score, or sends
Telegram.

## Watch run

- **Date/time:** 2026-06-15 ~23:05 UTC
- **Backend:** http://localhost:4000 · provider `firebase` · project `goal***892`
- **Window:** 1 min · interval 25s (smoke validation of the watcher itself)
- **Command:** `node scripts/watchLiveValidationWindow.mjs --duration 1 --interval 25 --json`

## Samples

| checkedAt | status | live | snaps | rich | partial | poor | alertsCreated | resolved |
|-----------|--------|------|-------|------|---------|------|---------------|----------|
| 23:05:00Z | NO_LIVE_FIXTURES | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 23:05:25Z | NO_LIVE_FIXTURES | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 23:05:50Z | NO_LIVE_FIXTURES | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Worker errors: none.

## Result

```
bestObserved:        NO_LIVE_FIXTURES
richEverObserved:    false
anyLiveEverObserved: false
alertsCreatedDuringWindow: 0
resolvedDuringWindow:      0
conclusion: No live match during the window — rich worker validation remains
            PENDING (no fake alert created).
```

## Window-state classification

The watcher reports one of:
- `NO_LIVE_FIXTURES` — no live match.
- `LIVE_POOR_DATA` — live but only poor snapshots.
- `LIVE_PARTIAL_DATA` — live with partial snapshots.
- `LIVE_RICH_DATA` — live with rich (stats + timed events) snapshots → workers can
  be validated with real data.

## Status

- This run was a **watcher smoke test** (1-minute window). No live match was
  present, so rich Pattern/Resolution validation remains **PENDING**.
- To validate for real: run the watcher during a live window (weekend/evening UTC),
  e.g. `node scripts/watchLiveValidationWindow.mjs --duration 90 --interval 60`,
  with the backend in firebase mode and all workers enabled. When `bestObserved`
  reaches `LIVE_RICH_DATA` and `alertsCreatedDuringWindow`/`resolvedDuringWindow`
  reflect real worker activity, record the evidence here and flip the relevant
  checklist gates.

## Honesty statement

No artificial alert, snapshot, or score was created. The watcher only reads
status endpoints. The transient `live-validation-watch-result.json` is gitignored.
