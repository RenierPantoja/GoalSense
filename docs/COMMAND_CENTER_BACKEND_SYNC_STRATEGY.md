# Command Center Backend Sync Strategy

## Current State

- **PatternContext** uses localStorage as primary storage
- **commandBackendClient** exists with graceful degradation
- **patternBackendAdapter** converts between frontend/backend formats
- **useBackendSync** checks backend health on mount

## Sync Phases

### Phase 1: Health Check (Current ✅)
- Frontend checks if `VITE_COMMAND_BACKEND_URL` is set
- If set, pings `/api/health`
- Reports online/offline status
- No data migration yet

### Phase 2: Read Mirror (Next)
- On mount, if backend online, fetch patterns from backend
- Compare with localStorage
- Show discrepancies in advanced mode
- No writes to backend yet

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
