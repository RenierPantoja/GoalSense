# Auto Alert Policy Engine + Shadow Mode — Audit (Phase B25)

Read-only audit before building the policy layer. Locks the real B19–B24 flow so the policy can
evaluate opportunities, record explainable shadow decisions, and (only with every flag + policy
gate satisfied) auto-create a monitored alert — defaulting to **never creating** anything.

## How opportunities are produced & persisted (B19)
`autoEngine.service.runAutoEngineScan` scans live fixtures → `scanFixture` builds `AutoOpportunity`
objects (status `candidate|watch|strong|blocked`, `score`, `confidenceBand`, `evidence.dataQuality`,
`riskGate.blockReasons/warnings`, `contextFit`, `relatedPatternIds`). Persisted via
`repos.intelligence.upsertAutoOpportunity` **only when `ENABLE_AUTO_ENGINE_WRITE=true`**. The run
returns ranked opportunities on `(run as any).opportunities`. → The policy hook goes **after**
persistence, gated by `ENABLE_AUTO_ALERT_POLICY`.

## How manual promotion creates an alert (B22)
`autoOpportunityAlertPromotion.service.promoteOpportunityToManualAlert`: sentinel
`patternId='auto_engine_manual'` (no performance counter), `evidenceJson` carries
`{ source:'auto_opportunity_manual', provenance:{ opportunityId, opportunityType, … },
telegramEligible:false, oddsEligible:false }`, builds a Signal Ledger entry, a
`ManualPromotedAlertLink` (`mpa_${opportunityId}`, idempotent), an auditable action, and an
observational learning event. → B25 auto-create reuses the SAME machinery with provenance
`source:'auto_alert_policy'` (+ `policyId`, `evaluationId`). The sentinel patternId keeps real
patterns clean AND makes B23 `isPromotedAlert` detect it (so it resolves through the honest cycle
and feeds B24 calibration).

## Outcome loop & calibration (B23/B24)
B23 `isPromotedAlert(alert)` = `patternId==='auto_engine_manual'` OR `evidenceJson.source` is a
promotion source → resolves promoted alerts, writes `AutoOpportunityOutcomeSummary` +
`PromotedAlertOutcomeLink`. B24 aggregates promoted outcomes into a SEPARATE calibration profile
(`getAutoEngineCalibrationOverview`, `getAutoOpportunityTypeProfile(type)`). → The policy guard
reads B24 calibration: requires a type profile with sample quality ≥ min, bounded unknown/failed
rates, and not an "insufficient sample" bucket when `requireCalibration=true`.

## Duplicate / user-state guards (B21/B22)
`AutoOpportunityUserState` (via `getAutoOpportunityUserState`) carries `dismissed`,
`promotedAlertId`. `getManualPromotedAlertLink(opportunityId)` detects an already-promoted opp. →
Policy must block when dismissed / already promoted / duplicate.

## Decision model (B25)
`AutoOpportunity → guard gates → decision`:
`blocked | shadow_would_create | suggest_manual_review | auto_created | skipped_duplicate |
skipped_policy_disabled | skipped_engine_disabled`. Each gate is `{name, passed, severity
(info|warning|critical), reason, evidence}`. A single failed **critical** gate ⇒ `blocked`.
Mode drives the positive path:
- `shadow_only` ⇒ `shadow_would_create` (NEVER creates).
- `suggest_manual` ⇒ `suggest_manual_review` (NEVER creates).
- `auto_create_monitored` ⇒ `auto_created` ONLY when `ENABLE_AUTO_ALERT_POLICY=true` AND
  `ENABLE_AUTO_ALERT_CREATE=true` AND `ENABLE_AUTO_ENGINE_TO_ALERTS=true` AND `policy.enabled` AND
  all critical gates pass AND not duplicate; otherwise degrades to `shadow_would_create`.

## Flags (defaults — shadow-first, create OFF)
`ENABLE_AUTO_ALERT_POLICY=false`, `ENABLE_AUTO_ALERT_SHADOW_MODE=true`,
`ENABLE_AUTO_ALERT_CREATE=false`, `ENABLE_AUTO_ALERT_TELEGRAM=false` (not implemented),
`ENABLE_AUTO_ALERT_POLICY_CONFIG=false` (gates POST/PATCH policy config),
`AUTO_ALERT_MIN_SCORE=70`, `AUTO_ALERT_MIN_SAMPLE_QUALITY=moderate`, `AUTO_ALERT_MAX_PER_FIXTURE=1`,
`AUTO_ALERT_MAX_PER_RUN=3`, `AUTO_ALERT_REQUIRE_CALIBRATION=true`,
`AUTO_ALERT_REQUIRE_NO_CRITICAL_BLOCKERS=true`.

## New modules / persistence
- `autoEngine/autoAlertPolicy.types.ts` (contracts).
- `autoEngine/utils/autoAlertPolicyGuard.util.ts` (PURE gates + decision; smoke-testable).
- `autoEngine/utils/autoAlertPolicyTemplate.util.ts` (PURE default template from env-like inputs).
- `autoEngine/autoAlertPolicyEvaluation.service.ts` (load → guard → persist evaluation + learning
  event → optional auto-create via promotion machinery).
- `autoEngine/autoAlertPolicyConfig.service.ts` (CRUD + flag checks + overview + template).
- Collections `autoAlertPolicies`, `autoAlertPolicyEvaluations` (+ repo methods; Noop empty/no-throw).

## Invariants verified
No odds, no Telegram, no bet/stake anywhere. Default creates nothing (shadow). Auto-create requires
the full flag set + policy mode. Sentinel patternId keeps manual-pattern counters/profiles clean.
Opportunity score/confidence never rewritten. B24 learning stays observational. Firebase persists;
Noop returns empty / accepts writes without throwing. Scanner keeps working if policy is off or
throws (policy is wrapped, non-fatal).

## Out of scope (deferred)
Telegram for auto alerts; per-user policies/auth; ML thresholds; policy feedback into scoring;
multi-policy precedence beyond "evaluate each enabled policy".
