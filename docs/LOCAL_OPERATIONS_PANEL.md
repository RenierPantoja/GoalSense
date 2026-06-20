# Local Operations Panel — UI (Phase B30)

A discreet operational area inside the Auto Engine cockpit ("Operação Local" segment) to run
GoalSense locally with safety. Operational, not commercial. Honest states; admin/owner controls; no
secrets.

## Types & API
- `features/command/intelligence/localOperationsTypes.ts`: `LocalOperationsStatusDto`,
  `ProviderUsageDto`, `SnapshotGuardDto`, `CoverageDto`, `WorkerDto`, `RISK_LABEL`/`RISK_TONE`.
- `services/localOperationsApi.ts`: `getStatus`, `getProviderUsage`, `getSnapshotGuard`,
  `getCoverage`, `getWorkers`, `pauseWorker`, `resumeWorker`, `resetGuardCounters` — all via the
  token-aware `apiClient` (Bearer when a session exists).

## Panel (`LocalOperationsPanel.tsx`)
- Runtime profile + description + flag-mismatch warning + volume estimate (provider calls/h, writes/
  h, writes/day) and a global risk badge (low/moderate/high/unsafe).
- Provider usage (per-minute/hour counts + blocked), snapshot guard (writes/skips + skip reasons),
  coverage (live/with-snapshot, quality r/p/p/unknown, stale, low-coverage leagues).
- Worker list with status; admin/owner can Pause/Resume pausable workers (runtime only — env
  unchanged); schedulers show "controle por env". Admin can "Zerar contadores".
- Operational warnings card (auto-create ON, Telegram ON, export without auth, provider near limit…).

## States
- `ENABLE_LOCAL_OPERATIONS_PANEL=false` (or 403) → honest "painel desabilitado" note.
- No live games → coverage zero (honest, not failure); unknown/missing always explicit.
- Non-admin → read-only (no pause/resume/reset buttons).

## Verification
- `npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓

---

## B31 additions
The panel now shows live pipeline guard runtime (observe/enforce mode, enabled
guards, recommended action) and per-area metrics (provider allowed/blocked,
snapshot written/skipped breakdown, fixture cap observed/skipped), plus a
snapshot-retention dry-run plan with an admin-only "run (dry-run)" action.
Real deletion is never possible from the UI (no delete backend). See
`LOCAL_OPERATIONS_PIPELINE_GUARDS_UI.md`.

---

## B32 additions
Adds snapshot lifecycle controls (dry-run / mark / soft-delete / hard-delete with
protect-first and strong confirms) and a persistent operational metrics history.
Hard-delete only shows with the explicit flag + real mode and requires admin.
See `SNAPSHOT_LIFECYCLE_UI.md`.

---

## B33 additions
The snapshot lifecycle section notes that protection now uses the Evidence Lineage
index (exact > inferred). The per-alert evidence trail lives in Alertas 2.0 →
Evidências. See `EVIDENCE_LINEAGE_UI.md`.
