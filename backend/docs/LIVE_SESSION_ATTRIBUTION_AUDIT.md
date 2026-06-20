# Live Session Attribution — Audit (Phase B38)

> Where `validationSessionId` can be stamped on records created during an active
> session, cheaply and non-fatally, without touching score/confidence/counters/
> patterns/result.

## 1. Safe insertion points (already non-fatal hooks)
| Record | Writer | Hook added in |
|--------|--------|---------------|
| LiveSnapshot | `liveMonitor.service.captureLiveSnapshot` | B31/B34 |
| SignalLedgerEntry | `intelligenceMemory.recordAlertCreated` | B12/B33/B34 |
| AlertOutcomeRecord | `intelligenceMemory.recordAlertResolved` | B12/B34 |
| AutoOpportunity | `autoEngine.service` write loop | B34 |
| AutoAlertPolicyEvaluation | `autoAlertPolicyEvaluation.service` | B34 |
| EvidenceSnapshotReference | `evidenceLineage.service` link helpers | B33/B34 |

Each already has a `try/catch`/`void` non-fatal site → adding an optional
`validationSessionId` field + a session event is low-risk and additive.

## 2. Cheap active-session resolution
- A module-level **context cache** (`liveValidationSessionContext.service.ts`) holds
  the running session + its attached fixtureId set, refreshed with a short TTL
  (default 15s) and invalidated on lifecycle changes. Writers call a cheap
  `resolveSessionForFixture(fixtureId)` (set lookup; no per-write Firestore read).
- Attribution rule: attach iff a session is `running` AND auto-attach AND the
  fixtureId is in the session's attached set OR the scope is broad (no
  fixtureIds/leagueNames/teamNames). `paused`/`completed`/`cancelled` never attach.

## 3. Fields (all optional, compatible with legacy)
`validationSessionId?` (+ `sessionAttachedAt?`) on SignalLedgerEntry, AlertOutcomeRecord,
AutoOpportunity, AutoAlertPolicyEvaluation, EvidenceSnapshotReference, LinkSnapshotInput,
and the live snapshot doc. Legacy records without it stay valid ("sem sessão").

## 4. Outcome breakdown
- `recordAlertResolved` already knows `ctx.result` (confirmed / confirmed_partial /
  failed / unknown). The session report aggregates outcomes by `validationSessionId`
  (exact) with a fixture/window fallback (inferred), classifying confirmed /
  confirmed_partial / failed / unknown / not_evaluable / pending. unknown &
  not_evaluable are NEVER failures.

## 5. Report priority
1) records with exact `validationSessionId`; 2) session events; 3) fixture/window
fallback marked `inferred_session_grouping`. `attributionCoverageRate` = exact / total.

## 6. Honest limitations carried forward
- Provider/snapshot guard metrics remain process-wide; the session-scoped versions
  are derived from attributed records + events, not isolated counters.
- League/team-only scopes rely on the attached-fixtures set captured at start (auto
  attach); fixtures going live after start are attributed only if broad scope.

## 7. Files
validation/liveValidationSessionContext.service.ts (new),
validation/liveValidationAttribution.service.ts (new),
validation/liveValidationSessionMetrics.service.ts (new), report service (B38 update),
types (optional fields), intelligenceMemory/autoEngine/policy/evidence/liveMonitor
integrations, routes (linked-records), backfill + smoke, frontend types/api/Lab/badges.
