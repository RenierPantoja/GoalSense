# Evidence Lineage + Snapshot Reference Index (Phase B33)

Links real snapshots to the decisions they supported (alerts, outcomes, backtests,
replays, opportunities, policy evaluations). The goal: stop over-protecting every
snapshot of a fixture by protecting **precisely** the snapshots that have an exact
link — while staying honest when only an inferred link exists.

## Link strength (honest semantics)
| Strength | Meaning |
|----------|---------|
| `exact` | a real `snapshotId` is known and was the actual input (only backtest/replay today) |
| `strong_inferred` | same fixture + same minute/capturedAt window, high confidence |
| `window_inferred` | same fixture + a time window (no exact id) |
| `weak_inferred` | same fixture only / heuristic |
| `unknown` | could not establish a link — **never authorizes a delete** |

Enforced at the boundary: an `exact` request **without** a `snapshotId` is
downgraded to `strong_inferred` (`normalizeLinkStrength`). An inferred link never
becomes exact.

## Sources & kinds
Sources: `signal_ledger`, `alert_outcome`, `failure_analysis`, `backtest_run`,
`backtest_result`, `replay_run`, `replay_step`, `learning_event`,
`auto_opportunity`, `auto_opportunity_outcome`, `promoted_alert`,
`auto_alert_policy_evaluation`, `manual_feedback`, `retention_backfill`.
Kinds: `trigger_state`, `pre_trigger_state`, `post_trigger_state`, `outcome_state`,
`replay_step`, `backtest_evaluation`, `learning_sample`, `auto_opportunity_evidence`,
`policy_gate_evidence`, `manual_review_evidence`, `retention_protection`.

## Where links are created (non-fatal, fire-and-forget; gated by `ENABLE_EVIDENCE_LINEAGE`)
- **Backtest engine** → `exact` links to the snapshot docs it evaluated (`backtest_result`).
- **Replay engine** → `exact` links to the snapshot docs it walked (`replay_step`).
- **Signal ledger** (alert created) → `window_inferred` (`trigger_state`).
- **Alert outcome** (resolved) → `window_inferred` (`outcome_state`).
- **Promoted alert** → `window_inferred` (`auto_opportunity_evidence`).
None change alert results, confidence, counters, scoring or patterns.

## Persistence
Firebase collection `evidenceSnapshotReferences`, deterministic ids (`esr_<sha>`)
→ idempotent. Indexed logically by `snapshotId`, `fixtureId`, `source`+`sourceId`,
`alertId`, `opportunityId`. Noop honest under Prisma mode (no persistence). No secrets.

## Retention integration
`snapshotProtectionIndex.service.ts` consults a snapshot's evidence links first:
- exact/inferred links → precise `linked_to_*` protection reasons;
- no link → falls back to protect-first (recent / fixture-has-alert / `unknown_dependency`).
This lets retention protect ONLY the referenced snapshots instead of every snapshot
of a fixture, while never authorizing a delete on uncertainty.

## API
`GET /api/intelligence/evidence-lineage/snapshots/:id`,
`.../fixtures/:id`, `.../alerts/:id`, `.../opportunities/:id`, `.../search`,
`POST .../backfill` (env-gated + admin/owner; the heavy job runs via the script).

## Limitations (real)
- `exact` links exist only for backtest/replay today (those engines iterate
  snapshot docs). Alerts/outcomes/promotions only know `fixtureId`+minute →
  inferred. Capturing the exact trigger snapshotId would touch B12 paths (out of scope).
- Backtest links cover up to 30 snapshots/fixture; replay up to 60 — bounded to
  limit writes.
- Prisma mode does not persist links (Noop) — use Firebase mode.

---

## B34 update — live exact capture
Triggers, outcomes, opportunities and policy evaluations now carry the **exact**
`snapshotId` they evaluated (when one exists), via typed helpers
`linkTriggerSnapshot` / `linkOutcomeSnapshot` / `linkOpportunitySnapshot` /
`linkPolicySnapshot` / `linkPromotionSnapshot`. This closes the B33 gap where only
backtest/replay produced exact links. Strength stays honest (exact only with a real
id; `snapshot_not_written` limitation otherwise). See `LIVE_ALERT_EVIDENCE_CAPTURE.md`.

---

## B35 update — inline backtest/replay evidence
Backtest results and replay steps now persist their exact snapshot ids inline
(`BACKTEST_REPLAY_INLINE_EVIDENCE.md`), so UI no longer depends solely on the
central Evidence Lineage index for per-row/per-step display. The lineage index
remains the source of truth for cross-source bundles and retention protection.

---

## B36 update — reprocessing patch links
When the B36 reprocessor applies an inline patch to an old backtest result, it
creates a non-fatal **exact** `EvidenceSnapshotReference` (`backtest_result`).
Existing inferred links are kept; exact wins in bundles by strength ranking. See
`BACKTEST_REPLAY_EVIDENCE_REPROCESSING.md`.

---

## B37 note — live validation sessions
Validation session summaries read evidence references per fixture (exact vs inferred
counts) for an honest traceability view. The session layer is observational and does
not create or alter evidence links. See `LIVE_VALIDATION_SESSIONS.md`.

---

## B38 note — session attribution on evidence links
`EvidenceSnapshotReference` now carries an optional `validationSessionId` (stamped
when a record is created during a running validation session). Optional and
legacy-safe; never alters link strength or protection. See `LIVE_SESSION_ATTRIBUTION.md`.
