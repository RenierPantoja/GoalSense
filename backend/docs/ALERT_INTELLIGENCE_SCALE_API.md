# Alert Intelligence Scale API (Phase B18)

Server-side search with real pagination, a cached overview, and env-gated CSV
export. Read-only; honest; no alerts/Telegram/pattern/confidence changes.

## Search — `GET /api/intelligence/alerts/search`
Query: all overview filters + `limit` (default 50, max 100), `cursor` (offset),
`sortBy` (`createdAt|confidence|minute`), `sortDirection` (`asc|desc`).
Returns:
```
{ items: AlertSearchItem[], total, totalApprox, nextCursor, hasMore, appliedFilters[] }
```
`AlertSearchItem` is **normalized** (stable shape — no undefined):
`id, alertId, source, fixtureId, patternId, patternName, fixtureLabel, leagueName,
homeTeam, awayTeam, minute, scoreState, severity, confidence, result, status,
dataQuality, provider, createdAt, resolvedAt, hasLedger, hasOutcome,
hasFailureAnalysis, learningEventCount, failureReason, summaryReason,
canOpenAnalysis, limitations[]`. Missing data → `null`/`unknown` + a `limitations`
note (e.g. "sem resultado registrado"); alerts without a ledger are identifiable.

New filters added in B18: `severity`, `patternName` (+ existing period/pattern/
league/team/result/dataQuality/provider/minuteWindow/failureReason/min-maxConfidence/
hasFailureAnalysis/hasLearningEvent/q).

Cursor is an offset over the sorted, filtered set with a stable tiebreak by
`alertId`. Joins run in memory over the repository read cap (2000).

## Overview — `GET /api/intelligence/alerts/overview` (now cached)
Wrapped by `alertIntelligenceCache.service.ts`. Response carries `cacheHit`,
`generatedAt`, `ttlSeconds`. Env:
- `ENABLE_ALERT_INTELLIGENCE_CACHE` (default `false`)
- `ALERT_INTELLIGENCE_CACHE_TTL_SECONDS` (default 60)
- `ALERT_INTELLIGENCE_CACHE_MAX_KEYS` (default 64)
On miss/disabled/error it recomputes from the real memory (never serves fake data).

## CSV export — `GET /api/intelligence/alerts/export.csv`
Env-gated by **`ENABLE_ALERT_EXPORT`** (default `false`) → 403 with an honest
message when off. Same filters as search; capped at 5000 rows. Columns:
createdAt, alertId, patternName, fixtureLabel, leagueName, homeTeam, awayTeam,
minute, scoreState, severity, confidence, result, status, dataQuality, provider,
failureReason, hasFailureAnalysis, learningEventCount, summaryReason. Cells are
sanitized against spreadsheet formula injection (`=,+,-,@` prefixed with `'`) and
quote-escaped. No secrets/tokens exported.

## Security
Read endpoints remain unauthenticated (single-user local backend); export is
env-gated; sensitive POSTs stay gated as before. A proper auth/admin layer is a
documented future phase.

## Limitations
- In-memory joins capped at 2000 records — fine at current volume; a server-side
  paginated/indexed store is the scale follow-up.
- Overview cache is per-process in-memory (no shared cache across instances).
- No auth on read endpoints; export protected only by env flag.
