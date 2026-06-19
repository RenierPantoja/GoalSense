# Alert Intelligence API Hardening (Phase B17)

Dedicated backend endpoints so the Alertas 2.0 UI reads real, filtered, related
data instead of improvising on the client. Read-only; deterministic; honest
(`unknown`/`expired` are not failures; `confirmed_partial` is partial usefulness).
No alerts created, no Telegram, no pattern/confidence/counter changes.

## New endpoints (prefix `/api`)

### Failure analysis (real, via API)
- `GET /intelligence/alerts/:alertId/failure-analysis` → `SignalFailureAnalysis | null`
  (200 with `null` when none — never 500, never inferred on read).
- `GET /intelligence/patterns/:patternId/failure-analyses?limit=` → `SignalFailureAnalysis[]`

Backed by new repository methods `getFailureAnalysisByAlertId` (deterministic
`fail_${alertId}` lookup) and `listFailureAnalysesByPattern`. Noop adapter returns
null/[] (Prisma mode safe).

### Alert intelligence overview (server-side metrics)
- `GET /intelligence/alerts/overview` with filters: `dateFrom,dateTo,patternId,
  league,team,result,status,dataQuality,provider,minuteWindow,failureReason,
  minConfidence,maxConfidence,hasFailureAnalysis,hasLearningEvent,q`.
- Returns totals, `usefulRate` (confirmed+partial), `failedRate` (excludes
  unknown/expired), `unknownRate`, avg confidence, avg time-to-resolution,
  `sampleQuality`, and breakdowns by pattern/league/team/minuteWindow/dataQuality/
  provider, `topFailureReasons`, `highUnknownContexts`, latest learning events +
  aggregation run. Empty → honest zeros.

### Alert search (server-side filtered list)
- `GET /intelligence/alerts/search` (same filters) `+ limit,cursor`.
- Returns `{ total, nextCursor, items[] }` where each item joins ledger + outcome
  summary + failure existence + learning-event count.

### Related alerts (explainable relations)
- `GET /intelligence/alerts/:alertId/related`
- `GET /intelligence/patterns/:patternId/related-alerts`
- `GET /intelligence/learning/events/:eventId/related-alerts`
- Relation by shared real dimensions (pattern/league/team/minute window/failure
  reason/outcome/data quality/competition type). Each related item carries
  `relationReasons` + `strength` (`weak|moderate|strong`, downgraded to `weak`
  when the related set is tiny). Never called "proof".

### Learning event drill-down
- `GET /intelligence/learning/events/:eventId` → `{ event, relatedPattern,
  relatedRecommendations, relatedAlertsSummary, relatedAlertsLinkParams }`.
- New repository method `getLearningEventById`.

## Services
- `alertIntelligence.service.ts` — `loadJoinedAlerts()` (ledger ⋈ outcome ⋈
  failure ⋈ learning-event-count, capped by repo read caps), `buildAlertOverview`,
  `searchAlerts`. Reuses B13 `learningStats`/`minuteWindow`/`contextKey` utils.
- `relatedAlerts.service.ts` — `relatedForAlert`, `relatedForPattern`,
  `relatedForLearningEvent`, `learningEventDetail`.

## Honesty & safety
- `usefulRate` = confirmed + confirmed_partial; `failedRate` numerator = failed
  only; `unknownRate` = (unknown + expired) / resolved.
- Joins are in-memory over capped reads (single-user volume), consistent with B13.
- All endpoints tolerate missing data with `null`/`[]` and never 500 on absence.
- Firebase persists; Prisma mode uses the Noop adapter (returns empty).

## Limitations
- Joins are bounded by the repository read cap (2000) — fine at current volume; a
  paginated/aggregated store would be needed at large scale.
- `relatedForLearningEvent` relies on the event carrying `alertId` or `patternId`.
- Overview/search compute on each request (no caching layer yet).
