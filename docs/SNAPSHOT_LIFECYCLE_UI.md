# Snapshot Lifecycle UI (Phase B32)

The `LocalOperationsPanel` (Auto Engine cockpit → "Operação Local") gains two B32
sections.

## "Ciclo de vida de snapshots"
- Badges: retention enabled/disabled, dry-run/real, raw threshold,
  require-mark-before-delete.
- Counts: scanned, protected, candidates, and per-lifecycle-state (active /
  marked_for_deletion / soft_deleted).
- Shows "Retenção em modo proteção máxima" when everything is protected and there
  are no eligible candidates.
- Admin actions: **Dry-run**, **Marcar** (mark_only), **Soft-delete** (amber, with
  confirm). **Hard-delete** (rose, with strong confirm) only appears when retention
  is enabled, in real mode, and hard-delete flag is on — and the backend still
  requires admin/owner.
- Surfaces mode downgrades and protect-first limitations.

## "Histórico operacional (métricas)"
- Persistence on/off badge + admin "Capturar agora".
- Last captures: timestamp, risk level, guard mode, provider blocks, snapshot
  writes/skips, fixtures capped.
- Honest empty/limitation text when persistence is off or under Prisma mode.

## Safety in the UI
- Protected snapshots are never offered for deletion.
- Hard-delete is hidden unless flags + real mode allow it, and always confirms.
- Soft-delete/mark are reversible; dry-run is always safe.
- No secrets, tokens, or payloads are displayed.

## API / types
`src/services/localOperationsApi.ts`: `getSnapshotRetentionPlan(mode)`,
`getSnapshotRetentionRuns`, `getSnapshotRetentionRun`, `runSnapshotRetention(mode)`,
`getLocalOpsMetricsHistory`, `captureLocalOpsMetrics`. Types in
`localOperationsTypes.ts` (`SnapshotRetentionPlanV2Dto`, `SnapshotRetentionRunDto`,
`SnapshotRetentionCandidateDto`, `SnapshotLifecycleStateDto`,
`SnapshotRetentionModeDto`, `LocalOpsMetricsSnapshotDto`, `LocalOpsMetricsHistoryDto`).

---

## B33 additions
Protection reasons shown in the lifecycle section are now informed by the Evidence
Lineage index (exact vs inferred). The detailed per-alert evidence trail (snapshots,
timeline, strengths) is in Alertas 2.0 → Evidências; ReplayViewer shows a fixture
lineage summary badge. See `EVIDENCE_LINEAGE_UI.md`.
