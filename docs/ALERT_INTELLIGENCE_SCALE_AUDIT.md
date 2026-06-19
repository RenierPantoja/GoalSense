# Alert Intelligence Scale — Audit (Phase B18)

Audit before migrating the alert list to server-side search. No behaviour changed
during the audit.

## Current state (post-B17)
- `AlertsView` lists alerts from local `triggeredAlerts` + `hybridAlerts` (merged
  local+backend), with local filters and Telegram/odds/hybrid wiring. Heavily
  wired — must be preserved.
- `AlertsIntelligencePanel` wraps it with a segmented control (Sinais / Qualidade /
  Aprendizados) + `AlertOverviewStrip` (server-side overview) + Signal Ledger drawer.
- B17 backend exposes `GET /api/intelligence/alerts/search` (in-memory join over
  capped reads) but the UI list didn't consume it yet.

## Fields available per search row (B17 → normalized in B18)
The ledger join provides: alertId, patternId/radarName, fixtureId, home/away,
league, minute, scoreState, severity, confidence, result, dataQuality (signal),
provider, createdAt/resolvedAt, hasFailureAnalysis, failureReason,
learningEventCount, outcomeReason. B18 normalizes this into a stable
`AlertSearchItem` (adds `source`, `hasLedger`, `hasOutcome`, `canOpenAnalysis`,
`summaryReason`, `limitations`, `status`).

## How to preserve all current cases
- Server-side list (`ServerAlertList`) becomes the **primary** Sinais view when a
  backend is configured; a **"Sinais locais"** toggle keeps the preserved
  `AlertsView` (local/hybrid/Telegram) available. When no backend is configured,
  the panel renders `AlertsView` directly with an honest note.
- "Ver análise" preserved in both lists → opens the Signal Ledger drawer.
- Local-only alerts (no backend ledger) remain visible via the local toggle.

## Pagination
`/alerts/search` returns `{ items, total, totalApprox, nextCursor, hasMore,
appliedFilters }`. Cursor is an offset over the sorted, filtered set (stable
tiebreak by alertId). Page cap 100, default 50. In-memory over the repo read cap
(2000) — documented; a paginated store is the scale follow-up.

## Cache & export seams
- Overview recomputed each request in B17 → B18 adds an in-memory TTL cache
  (`alertIntelligenceCache.service.ts`, env-gated) returning cacheHit/generatedAt/ttlSeconds.
- CSV export = a new `GET /alerts/export.csv` (env-gated `ENABLE_ALERT_EXPORT`),
  reusing the same filters, capped 5000, formula-injection-sanitized.

## Risks
| Risk | Handling |
|------|----------|
| Breaking AlertsView | preserved as the "Sinais locais" view + no-backend fallback. |
| Hiding local alerts | explicit toggle + note; never silently dropped. |
| Export abuse / no auth | env-gated (403 when off) + 5000 cap; documented as future auth. |
| Stale cache | short TTL, manual refresh, cacheHit surfaced in the UI. |
| Large in-memory joins | capped reads; documented scale limitation. |
