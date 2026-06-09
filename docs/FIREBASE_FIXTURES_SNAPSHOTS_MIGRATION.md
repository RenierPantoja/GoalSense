# Firebase Fixtures + LiveSnapshots Migration (Phase E4)

Phase E4 adds Firestore adapters for **Fixtures** and **LiveSnapshots**, and
migrates the **Live Monitor** (`liveMonitor.service` + `liveMonitor.routes`) to
the repository layer. The backend in firebase mode can now capture live fixtures
and snapshots without Postgres.

Prisma remains the default and is unchanged in behaviour.

## Collections

### `fixtures/{provider}__{providerFixtureId}` — deterministic id

| Field | Type | Notes |
|-------|------|-------|
| provider | string | e.g. `espn` |
| providerFixtureId | string | provider's match id |
| canonicalKey | string | cross-provider dedup key (teams + kickoff) |
| homeName | string | |
| awayName | string | |
| competition | string | |
| status | string | `NS` \| `1H` \| `HT` \| `2H` \| `ET` \| `BT` \| `P` \| `FT` \| `AET` \| ... |
| startTime | string (ISO) | normalized from Date |
| createdAt | string (ISO) | |
| updatedAt | string (ISO) | stamped on every write |

The deterministic doc id (`provider__providerFixtureId`, `/` sanitized to `_`)
makes per-provider creates idempotent — the same match never duplicates.
Cross-provider dedup is handled by `liveMonitor.service.upsertFixture`, which
falls back to `findByCanonicalKey` and reuses the existing fixture id.

**Status regression protection** stays in the service (`shouldUpdateStatus`):
the adapter only performs CRUD and never decides status precedence.

### `liveSnapshots/{autoId}`

| Field | Type | Notes |
|-------|------|-------|
| fixtureId | string | references `fixtures` doc id |
| provider | string | |
| minute | number \| null | |
| status | string | |
| scoreHome | number | |
| scoreAway | number | |
| penaltyHome | number \| null | |
| penaltyAway | number \| null | |
| dataQuality | string | `rich` \| `partial` \| `poor` (computed by service) |
| statsJson | string \| null | JSON object; null when no stats → not rich |
| eventsJson | string \| null | JSON array of timed events |
| capturedAt | string (ISO) | stamped on create; drives ordering/windows |
| createdAt | string (ISO) | |

Snapshots are immutable (auto id) — history is never overwritten. Empty payloads
stay `null` and are not treated as rich. `shootoutEventsJson` / `warningsJson`
are **not** stored because the current pipeline does not produce them; they will
be added only when the producer does (no invented fields).

## Repository methods → query strategy

### FixtureRepository

| Method | Strategy |
|--------|----------|
| findById | doc get |
| findByProviderId | doc get on deterministic id (fast, no query) |
| findByCanonicalKey | `where canonicalKey == … limit 1` (automatic single-field index) |
| listLive | `where status in [...]` + in-memory sort by `updatedAt` desc |
| create | `set` on deterministic id, Date → ISO, skip undefined |
| update | `set(merge)`, skip undefined, stamps `updatedAt` |

### LiveSnapshotRepository

| Method | Strategy |
|--------|----------|
| findLatestByFixture | `where fixtureId == …` + in-memory sort `capturedAt` desc → first |
| findAfter | `where fixtureId == …` + in-memory `capturedAt > after` + sort asc + slice |
| listRecent (fixtureId) | `where fixtureId == …` + in-memory sort desc + slice |
| listRecent (no fixtureId) | `orderBy capturedAt desc limit` (automatic single-field index) |
| create | auto id, Date → ISO, stamps `capturedAt`/`createdAt` |

Single-equality queries + in-memory refinement avoid mandatory composite indexes
at current single-user volume (consistent with E2/E3). ISO timestamps sort
lexicographically by time, so string comparison drives ordering and resolution
windows.

## Recommended composite indexes (production scale)

As live volume grows, create these and switch the adapters to server-side
`where + orderBy + limit`:

- `fixtures`: `status` ASC, `updatedAt` DESC
- `fixtures`: `canonicalKey` ASC (single-field; automatic)
- `liveSnapshots`: `fixtureId` ASC, `capturedAt` DESC
- `liveSnapshots`: `capturedAt` DESC (single-field; automatic)
- `liveSnapshots`: `dataQuality` ASC, `capturedAt` DESC

## Migrated code

- `backend/src/modules/live/liveMonitor.service.ts` — `upsertFixture` and
  `captureLiveSnapshot` now use `repos.fixtures` / `repos.liveSnapshots`;
  `recordProviderHealth` uses `repos.providerHealth`. No `prisma` import remains.
  Enrichment, dataQuality V2, and the smart snapshot diff are unchanged.
- `backend/src/modules/live/liveMonitor.routes.ts` — `/live-snapshots/recent`,
  `/fixtures/live`, `/provider-health` all use the repository layer.

## Workers (not migrated in E4 — prepared for E5/E6)

The background workers still use Prisma directly and require
`PERSISTENCE_PROVIDER=prisma`:
- `liveMonitor.worker.ts` calls `processLiveFixtures` (now repo-backed) but the
  worker loop itself only orchestrates and records health — it works in both
  modes once the service is repo-backed (it does not touch Prisma directly).
- `commandEvaluation.service.ts` (pattern evaluation worker) reads
  `prisma.pattern` / `prisma.fixture` / `prisma.liveSnapshot` and writes
  `prisma.alert` directly.
- `alertResolution.service.ts` (resolution worker) reads `prisma.alert` /
  `prisma.liveSnapshot` and writes via `prisma.$transaction` directly.

The contracts already expose everything these workers need
(`fixtures.listLive`, `liveSnapshots.findLatestByFixture`,
`liveSnapshots.findAfter`, `alerts.*`, `alertResolutions.*`), so E5/E6 can
migrate them without contract changes.

## Limitations after E4

- **Pattern evaluation + resolution workers** still require prisma mode.
- **Performance analytics** still uses Prisma aggregations (E6).
- **Odds** persistence is not migrated (E5) — throws a clear error in firebase mode.
- **No data migration** has been performed; firebase mode starts from empty
  collections.

## Verification

Backend: `npm run db:generate` (local binary, not `npx prisma`), `npm run typecheck`, `npm run build` — all pass.
Frontend: `npm run check:encoding`, `npx tsc --noEmit`, `npx vite build` — all pass.
