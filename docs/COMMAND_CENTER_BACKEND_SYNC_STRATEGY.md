# Command Center Backend Sync Strategy

## Current State

- **PatternContext** uses localStorage as primary storage
- **commandBackendClient** exists with graceful degradation
- **patternBackendAdapter** converts between frontend/backend formats
- **useBackendSync** performs health check + read mirror with diagnostics
- **patternSyncDiagnostics** compares local vs backend patterns
- **patternSyncQueue** manages write-through sync state
- **usePatternWriteThrough** wraps mutations with async backend writes

## Sync Phases

### Phase 1: Health Check ✅
- Frontend checks if `VITE_COMMAND_BACKEND_URL` is set
- If set, pings `/api/health`
- Reports online/offline status
- No data migration yet

### Phase 2: Read Mirror ✅
- On mount, if backend online, fetch patterns from backend
- Convert backend patterns to frontend format via `fromBackendPattern`
- Compare with localStorage patterns using `compareLocalAndBackendPatterns`
- Show diagnostics in advanced mode (Command Center header)
- **No writes to backend**
- **No overwrites of local patterns**
- **No automatic conflict resolution**

#### What Phase 2 Compares
- Pattern matching by: exact ID → stable key (templateId+name) → name+createdAt
- Critical fields checked for divergence: `name`, `status`, `severity`, `action`, `minConfidence`, `requireRichData`, `scope`, `templateId`, `conditions`, `scopeFilter`
- Result categories: matched, divergent, only-local, only-backend

#### How to Interpret Diagnostics
| State | Meaning |
|-------|---------|
| `X sincronizados` | Patterns exist in both and are identical |
| `X divergentes` | Same pattern exists in both but fields differ |
| `X apenas local` | Pattern exists only in localStorage |
| `X apenas backend` | Pattern exists only in backend DB |
| Backend offline | Backend unreachable, localStorage continues as sole source |
| Backend desativado | `VITE_COMMAND_BACKEND_URL` not set |

### Phase 3: Write-Through ✅ (Current)
- On pattern create/update/delete/toggle:
  - Write to localStorage **immediately** (for UI responsiveness)
  - Fire async backend write (non-blocking)
  - If backend succeeds: mark pattern as `synced`, store `backendId`
  - If backend fails: mark as `pending_create` / `pending_update` / `error`
- On backend coming online: auto-sync all pending items
- Manual "Sync pendentes" button in advanced mode

#### Sync Metadata on Pattern
```typescript
backendId?: string          // Backend's cuid for this pattern
syncStatus?: PatternSyncStatus  // synced | pending_create | pending_update | pending_delete | error | local_only
lastSyncedAt?: string       // ISO timestamp of last successful sync
syncError?: string          // Error message if sync failed
```

#### Write-Through Operations
| Operation | Local Effect | Backend Effect |
|-----------|-------------|----------------|
| Create pattern | Immediate add to state | POST /api/patterns (async) |
| Create from template | Immediate add to state | POST /api/patterns (async) |
| Update pattern | Immediate patch in state | PATCH /api/patterns/:backendId (async) |
| Toggle active/paused | Immediate toggle in state | PATCH /api/patterns/:backendId (async) |
| Delete pattern | Immediate remove from state | DELETE /api/patterns/:backendId (async) |

#### Offline Behavior
- All mutations work locally without backend
- Patterns are marked `pending_create` / `pending_update`
- When backend comes online, `syncPendingPatterns()` runs automatically
- Processes: pending_create → pending_update → pending_delete → errors (retry)
- Sequential processing to avoid conflicts

#### Conflict Handling (Conservative)
- Local always wins for pending operations
- Backend does NOT overwrite local automatically
- Divergences visible in Read Mirror diagnostics
- Automatic resolution deferred to Phase 4

#### What Phase 3 Does NOT Do
- Does not use backend as source of truth
- Does not overwrite local patterns with backend data
- Does not delete local patterns because backend doesn't have them
- Does not resolve divergences automatically
- Does not block UI on backend latency

### Phase B4: Alerts Backend Sync + Resolution Persistence ✅ (Current)
- Every Command Center alert (manual pattern + auto-discovery) is sent to backend on creation
- Every resolution (confirmed, failed, expired, etc.) is sent to backend
- localStorage remains primary for alerts
- Backend receives writes async (non-blocking)
- Offline alerts are marked `pending_create` / `pending_resolve`
- When backend comes online, pending alerts are synced automatically

#### Alert Sync Metadata
```typescript
backendId?: string              // Backend's cuid for this alert
syncStatus?: AlertSyncStatus    // synced | pending_create | pending_resolve | error
lastSyncedAt?: string           // ISO timestamp
syncError?: string              // Error message
backendResolutionId?: string    // Backend resolution record ID
```

#### Alert Write-Through Operations
| Operation | Local Effect | Backend Effect |
|-----------|-------------|----------------|
| Register alert | Immediate add to state | POST /api/alerts (async) |
| Resolve alert | Immediate status update | POST /api/alerts/:id/resolve (async) |

#### Duplicate Signature
- Each alert gets a `duplicateSignature`: `patternId:fixtureId:score:minuteWindow`
- Backend checks signature before creating (returns existing if found)
- Frontend treats 409 as "already synced"

#### Resolution Persistence
- Backend stores full resolution: status, type, window, evidence
- `AlertResolution` table linked to `Alert`
- Frontend stores `backendResolutionId` for audit trail

#### Sync Metadata Storage (Hardened in B4.1)
- Sync metadata is stored in a **separate** localStorage key (`goalsense_alert_sync_meta`)
- This prevents AlertsContext state updates from overwriting sync metadata
- `mergeAlertSyncMeta()` merges metadata into alerts for display/processing
- Metadata includes: `backendId`, `syncStatus`, `lastSyncedAt`, `syncError`, `backendResolutionId`

#### QA Results (Phase B4.1)
- **Create online**: Alert appears immediately, POST fires async, backendId saved ✅
- **Resolve online**: Status changes immediately, POST /resolve fires, backendResolutionId saved ✅
- **Create offline**: Alert appears locally, marked pending_create in sync meta ✅
- **Resolve offline**: Status changes locally, marked pending_resolve in sync meta ✅
- **Backend comes online**: pending_create sent first, then pending_resolve (order guaranteed) ✅
- **DuplicateSignature**: Backend returns existing alert (200), frontend marks as synced ✅
- **404 on resolve**: Recreates alert on backend, then resolves ✅
- **Evidence preservation**: evidenceJson includes all evidences, patternName, teams, snapshot ✅
- **TemporalEvidence**: Preserved as separate JSON field ✅
- **Old alerts (no sync meta)**: Continue working, no errors ✅

#### What Phase B4 Does NOT Do
- Does not use backend as source of truth for alerts
- Does not load alerts from backend on mount
- Does not sync performance analytics
- Does not send Telegram notifications
- Does not integrate odds data

### Phase 5: Backend Primary (Future)
- Backend becomes source of truth
- localStorage becomes cache/fallback only
- Patterns loaded from backend on mount
- localStorage updated as mirror
- Automatic conflict resolution with `updatedAt` comparison

### Phase B5: Performance Backend Analytics ✅
- Backend calculates performance from real alerts/resolutions in DB
- Frontend fetches backend performance when online
- Falls back to local analytics when backend unavailable
- Source indicator in advanced mode
- Same metrics/rules as local engine (unknown ≠ failed, min sample 5)
- Breakdowns by momentum source, data quality, provider, resolution type
- Server-side recommendations based on evidence

### Phase B6: Live Monitoring Worker + Snapshot Capture ✅ (Current)
- Backend worker observes live matches via ESPN provider
- Captures fixture records and live snapshots into DB
- Snapshot stored only on change (status, score, minute)
- Provider health recorded per fetch
- Worker disabled by default (`LIVE_WORKER_ENABLED=false`)
- Does NOT generate alerts (observation only)
- Observability routes: /live-monitor/status, /live-snapshots/recent, /fixtures/live, /provider-health

## Conflict Resolution (Phase 4 — Future)

| Scenario | Resolution |
|----------|-----------|
| Backend has pattern, local doesn't | Add to local (backend wins) |
| Local has pattern, backend doesn't | Push to backend (local wins) |
| Both have same ID, different data | Most recent `updatedAt` wins |
| Backend offline during create | Save local, mark pendingSync |
| Backend returns after offline | Sync pending items |

## Adapter

`patternBackendAdapter.ts`:
- `toBackendPayload(pattern)` — converts frontend Pattern to API format
- `fromBackendPattern(raw)` — converts API response to frontend Pattern

## Environment

```
VITE_COMMAND_BACKEND_URL=http://localhost:4000
```

If not set, all backend functions return null and localStorage continues as sole source.

## What Does NOT Change

- PatternContext API (createPattern, updatePattern, etc.)
- AlertsContext API (registerCommandAlert, updateCommandAlertStatus)
- Template system
- Dry-run
- Scanner
- Performance analytics (still localStorage)
- Auto-discovery config

## Risks

- ID mismatch between localStorage (client-generated) and backend (cuid)
- Offline edits may conflict with backend state
- Backend downtime should never block the user
- Migration must be reversible
- Delete on backend may fail silently if pattern was never synced
- Alert fixtureId is ESPN numeric ID stored as string in backend

## Files

| File | Purpose |
|------|---------|
| `src/services/commandBackendClient.ts` | HTTP client with graceful degradation + strict mode |
| `src/services/patternBackendAdapter.ts` | Pattern format conversion (frontend ↔ backend) |
| `src/services/alertBackendAdapter.ts` | Alert format conversion (frontend ↔ backend) |
| `src/services/useBackendSync.ts` | React hook: health + read mirror + diagnostics |
| `src/services/patternSyncDiagnostics.ts` | Comparison engine: local vs backend patterns |
| `src/services/patternSyncQueue.ts` | Pattern write-through sync logic + pending queue |
| `src/services/usePatternWriteThrough.ts` | React hook: wraps pattern mutations with backend writes |
| `src/services/alertSyncQueue.ts` | Alert write-through sync logic + pending queue |
| `src/services/useAlertWriteThrough.ts` | React hook: wraps alert mutations with backend writes |
| `src/features/command/types/commandTypes.ts` | Pattern type with sync metadata fields |
| `src/features/command/contexts/PatternContext.tsx` | localStorage persistence with sync field normalization |
| `src/context/AlertsContext.tsx` | Alert types with sync metadata fields |
| `backend/src/modules/patterns/` | Backend pattern CRUD routes |
| `backend/src/modules/alerts/` | Backend alert CRUD + resolve routes |
| `backend/prisma/schema.prisma` | Database schema |

## Next Steps (Phase 5: Backend Primary)

1. On mount, load patterns from backend (if online)
2. Merge with localStorage (backend wins for conflicts by `updatedAt`)
3. localStorage becomes read cache only
4. All reads go through backend when online
5. Offline mode falls back to localStorage cache
6. Load alerts from backend for cross-device visibility
7. Multi-user support via `userId`
