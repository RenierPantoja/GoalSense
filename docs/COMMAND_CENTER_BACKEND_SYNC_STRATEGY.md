# Command Center Backend Sync Strategy

## Current State

- **PatternContext** uses localStorage as primary storage
- **commandBackendClient** exists with graceful degradation
- **patternBackendAdapter** converts between frontend/backend formats
- **useBackendSync** performs health check + read mirror with diagnostics
- **patternSyncDiagnostics** compares local vs backend patterns

## Sync Phases

### Phase 1: Health Check ✅
- Frontend checks if `VITE_COMMAND_BACKEND_URL` is set
- If set, pings `/api/health`
- Reports online/offline status
- No data migration yet

### Phase 2: Read Mirror ✅ (Current)
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

#### What Phase 2 Does NOT Do
- Does not import backend patterns into localStorage
- Does not export local patterns to backend
- Does not resolve conflicts automatically
- Does not delete any patterns
- Does not change the source of truth (localStorage remains primary)

#### How to Interpret Diagnostics
| State | Meaning |
|-------|---------|
| `X sincronizados` | Patterns exist in both and are identical |
| `X divergentes` | Same pattern exists in both but fields differ |
| `X apenas local` | Pattern exists only in localStorage |
| `X apenas backend` | Pattern exists only in backend DB |
| Backend offline | Backend unreachable, localStorage continues as sole source |
| Backend desativado | `VITE_COMMAND_BACKEND_URL` not set |

### Phase 3: Write-Through (Future)
- On pattern create/update/delete:
  - Write to localStorage (immediate, for UI)
  - Write to backend (async, for persistence)
  - If backend fails, mark as `pendingSync`
- On next successful health check, sync pending items

### Phase 4: Backend Primary (Future)
- Backend becomes source of truth
- localStorage becomes cache/fallback only
- Patterns loaded from backend on mount
- localStorage updated as mirror

## Conflict Resolution

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
- Template system
- Dry-run
- Scanner
- Alerts (still localStorage)
- Performance analytics (still localStorage)
- Auto-discovery config

## Risks

- ID mismatch between localStorage (client-generated) and backend (cuid)
- Offline edits may conflict with backend state
- Backend downtime should never block the user
- Migration must be reversible

## Files

| File | Purpose |
|------|---------|
| `src/services/commandBackendClient.ts` | HTTP client with graceful degradation |
| `src/services/patternBackendAdapter.ts` | Format conversion (frontend ↔ backend) |
| `src/services/useBackendSync.ts` | React hook: health + read mirror + diagnostics |
| `src/services/patternSyncDiagnostics.ts` | Comparison engine: local vs backend patterns |
| `backend/src/modules/patterns/` | Backend CRUD routes |
| `backend/prisma/schema.prisma` | Database schema |

## Next Steps (Phase 3: Write-Through)

1. On pattern create/update/delete → async write to backend
2. If backend fails → mark pattern as `pendingSync`
3. On next health check success → retry pending items
4. UI shows sync status per pattern (synced / pending / failed)
5. localStorage remains primary until Phase 4
