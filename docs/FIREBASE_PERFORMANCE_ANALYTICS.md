# Firebase Performance Analytics (Phase E6)

Phase E6 migrates the Performance Analytics service to the repository layer. It
was the last module importing Prisma directly. Performance now runs in both
`PERSISTENCE_PROVIDER=prisma` and `=firebase`, computed **on-demand** in memory
(no denormalized counters yet — see E6.1).

The honesty rules are unchanged: `unknown` never counts as `failed`, rates only
appear with `resolvedCount >= 5`, small samples never produce strong conclusions,
and no metric is invented.

## Pre-E6 Prisma audit (`performance.service.ts`)

| Operation | Models | Used for | Repository equivalent |
|-----------|--------|----------|----------------------|
| `pattern.findFirst({ id, userId })` | Pattern | pattern lookup | `patterns.findById(id, userId)` |
| `alert.findMany({ patternId, userId }, orderBy createdAt desc)` | Alert | per-pattern sample | `alerts.listByPatternId(patternId, userId)` |
| `alertResolution.findMany({ alertId in [...] })` | AlertResolution | resolution-type breakdown | `alertResolutions.findByAlertIds(ids)` |
| `pattern.findMany({ userId, status != archived })` | Pattern | all patterns | `patterns.listAll(userId)` + in-memory `status !== 'archived'` filter |
| `alert.findMany({ userId })` | Alert | summary totals | `alerts.listAllForUser(userId)` |

Fields read from JSON (unchanged):
- `evidenceJson` → `triggerSnapshot.stats` (data quality), `triggerSnapshot.provider` / `provider` (provider breakdown)
- `temporalEvidenceJson` → `momentumSource` (momentum breakdown)

No date fields participate in the calculations (ordering is done by the repos),
so cross-provider `Date` vs ISO-string differences do not affect results.

## On-demand model (chosen for E6)

Performance is computed live by reading alerts/resolutions through the repos and
aggregating in memory. Rationale:
- lowest risk, preserves honest results exactly;
- avoids premature denormalization complexity;
- sufficient for current single-user volume.

**E6.1 (future):** incremental per-pattern counters (updated when the resolution
worker writes a resolution) to avoid scanning all alerts on each request.

## Input adapter

`backend/src/modules/performance/performanceInputAdapter.ts` normalizes records
so the service is provider-agnostic:
- `safeParseJson(value, fallback)` — accepts JSON string OR already-parsed object OR null; never throws.
- `extractPerformanceEvidence(alert)` / `extractTemporalEvidence(alert)`
- `normalizeAlertForPerformance(alert)` → `{ id, status, confidence, evidence, temporal }` (status defaults to `unknown`, confidence to `0`)
- `normalizeResolutionForPerformance(resolution)` → `{ alertId, resolutionType, resolutionStatus }`

This handles Prisma↔Firebase differences (Date vs ISO string, JSON string vs
object, missing fields, malformed evidence) without breaking.

## New repository methods

`AlertRepository`:
- `listByPatternId(patternId, userId, limit?)` — newest-first. Prisma: unbounded when no limit. Firebase: `where patternId ==` + in-memory userId filter + sort + cap.
- `listAllForUser(userId, limit?)` — newest-first. Prisma: unbounded when no limit. Firebase: `where userId ==` + sort + cap.

### Read cap (Firebase)

Prisma performance reads are unbounded (current behaviour preserved exactly).
Firebase applies a safe cap of **2000** records (`PERFORMANCE_READ_CAP` in
`firebaseAlert.repository.ts`) to control read cost. At current single-user
volume this is effectively unbounded. If a pattern ever exceeds the cap, the
sample is truncated to the most recent 2000 — documented here as a known
limitation that E6.1's incremental counters will remove.

## Honesty rules (unchanged)

- `unknown` is a first-class status — never counted as `failed`.
- `pending` is not counted as resolved.
- `confirmed_partial` counts toward `usefulRate` (confirmed + partial).
- `confirmedRate` / `usefulRate` / `failedRate` require `resolvedCount >= 5`; otherwise `null`.
- `unknownRate` requires total `>= 5`; otherwise `null`.
- Reliability: `insufficient_sample` (< 5 alerts), `preliminary` (< 5 resolved),
  `data_limited` (unknownRate > 0.4), `underperforming` (failedRate > 0.5), etc.
- Unrecognized statuses produce a warning and are not silently bucketed.

## Routes (unchanged response shape)

- `GET /api/performance/patterns`
- `GET /api/performance/patterns/:id`
- `GET /api/performance/summary`

The frontend `PerformanceView` (backend-preferred, local fallback) is untouched.

## Recommended Firestore indexes (production scale)

- `alerts`: `patternId` ASC, `createdAt` DESC
- `alerts`: `userId` ASC, `createdAt` DESC

(In-memory sort is used today to avoid mandatory composite indexes locally.)

## Limitations after E6

- On-demand Firestore aggregation scans alerts per request; **E6.1** will add
  incremental counters.
- Firebase reads capped at 2000 for performance queries (documented above).
- No data migration; firebase mode starts from empty collections.
- Full firebase runtime depends on real credentials + populated collections;
  this phase validates typecheck/build + repository wiring.

## Prisma direct-import audit (after E6)

Direct Prisma usage now exists **only** in:
- `backend/src/db/client.ts` (the Prisma client init)
- `backend/src/repositories/prisma/prismaRepositories.ts` (the Prisma adapter)

No service, route, or worker imports Prisma directly.

## Verification

Backend: `npm run db:generate` (local binary, not `npx prisma`), `npm run typecheck`, `npm run build` — all pass.
Frontend: `npm run check:encoding`, `npx tsc --noEmit`, `npx vite build` — all pass.
