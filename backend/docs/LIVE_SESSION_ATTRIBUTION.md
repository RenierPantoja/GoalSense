# Live Session Attribution + Outcome QA Breakdown (Phase B38)

Evolves B37 from observational fixture/window grouping to **real per-record session
attribution**: records created during a running session are stamped with an optional
`validationSessionId`, and the session report gains an exact-vs-inferred breakdown
plus an honest outcome QA breakdown. No score/confidence/counter/pattern/result is
changed; attribution is always non-fatal.

## Session context cache (cheap)
`liveValidationSessionContext.service.ts` holds the RUNNING session + its attached
fixtureId set, TTL-cached (15s) and invalidated on lifecycle changes. Writers call
`resolveSessionAttribution(fixtureId)` (set lookup, no per-write Firestore read).
Attribution rule: `running` + auto-attach + (broad scope OR fixture attached).
`paused`/`completed`/`cancelled` never attribute.

## Stamped records (optional fields, legacy-safe)
`validationSessionId` (+ `sessionAttachedAt`) on: live snapshot, `SignalLedgerEntry`,
`AlertOutcomeRecord`, `AutoOpportunity`, `AutoAlertPolicyEvaluation`,
`EvidenceSnapshotReference` (via `LinkSnapshotInput`). Records without it stay valid
("sem sessão"). No critical field renamed.

## Session events from real writes
The writers also emit compact session events: `signal_created`, `alert_created`,
`outcome_resolved` (+ result), `auto_opportunity_created`, `policy_evaluated`,
`snapshot_written` — sanitized, truncated, never fatal.

## Outcome QA breakdown
The report classifies session outcomes: `confirmed`, `confirmed_partial`, `failed`,
`unknown`, `expired`, `not_evaluable`, `pending`. **unknown / not_evaluable /
pending are NEVER failures** (`outcomeFailureRate` = failed / decisive only).

## Report priority + coverage
1) records with exact `validationSessionId`; 2) session events; 3) fixture/window
fallback (`inferred_session_grouping`). Summary adds
`exactSessionAttributionCount`, `inferredSessionGroupingCount`,
`recordsWithoutSessionId`, `attributionCoverageRate`, `outcomeBreakdown`,
`pendingOutcomes`.

## Linked records
`liveValidationLinkedRecords.service.ts` lists alerts/opportunities/evidence/outcomes
for the session's fixtures (reusing existing by-fixture queries), classifying each as
`exact_session_id` or `inferred_fixture_window`. Routes:
`GET .../live-sessions/:id/{linked-records|alerts|opportunities|evidence|outcomes}`.

## Backfill (honest, conservative)
`scripts/backfillLiveValidationSessionAttribution.mjs` (dry-run default;
`--persist` gated by `ENABLE_LIVE_VALIDATION_SESSION_ATTRIBUTION_BACKFILL=true`)
reports exact-vs-inferred grouping but does NOT write inferred sessionId onto old
records (would blur exact vs inferred). Old records are grouped by fixture/window.

## Guarantees
zero mock/invented · zero odds/Telegram/auto-bet · auto-create off · sessionId absent
≠ failure · attribution failure non-fatal · unknown/not_evaluable ≠ failed ·
confirmed_partial = partial-useful · score/confidence/counters/patterns/result
unchanged · B12–B37 preserved · Firebase + Prisma(Noop) preserved.

## Limitations (real)
- League/team-only scopes attribute via the attached-fixtures set captured at start;
  fixtures going live AFTER start attribute only under a broad scope.
- Provider/snapshot guard metrics remain process-wide; session-scoped versions are
  derived from attributed records/events (not isolated counters).
- Prisma mode does not persist sessions/attribution (Noop) — use Firebase mode.
- Backfill never marks historical records as exact (honest); they remain inferred.
