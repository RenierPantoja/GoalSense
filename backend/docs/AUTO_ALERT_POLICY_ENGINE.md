# Auto Alert Policy Engine + Shadow Mode (Phase B25)

The first controlled-automation layer for the Auto Engine. An EXPLICIT, auditable policy decides
whether an `AutoOpportunity` may become a monitored alert. It is **shadow-first**: by default it
only records what it WOULD do and explains why. Real auto-creation requires every flag + the
policy mode + all critical gates. No odds, no Telegram, no bet — ever.

## Decision flow
```
AutoOpportunity → Auto Alert Policy → guard gates → decision → (audit + learning event)
                                                       │
                            blocked / shadow_would_create / suggest_manual_review /
                            auto_created / skipped_duplicate / skipped_policy_disabled
                                                       │ (auto_created only)
                                          monitored alert (provenance source=auto_alert_policy)
                                                       │
                                          B23 resolution → outcome → B24 calibration
```

## Modes (`AutoAlertPolicyMode`)
- `disabled` — never evaluated.
- `shadow_only` (default for the template) — records `shadow_would_create`; **never creates**.
- `suggest_manual` — records `suggest_manual_review`; **never creates** (user promotes manually).
- `auto_create_monitored` — creates an alert ONLY when all flags + gates allow; otherwise degrades
  to `shadow_would_create`.

## Flags (defaults — shadow-first, create OFF)
| Flag | Default | Effect |
|------|---------|--------|
| `ENABLE_AUTO_ALERT_POLICY` | `false` | Master switch; scanner only evaluates when true. |
| `ENABLE_AUTO_ALERT_SHADOW_MODE` | `true` | Shadow recording (informational flag). |
| `ENABLE_AUTO_ALERT_CREATE` | `false` | Required for any real auto-creation. |
| `ENABLE_AUTO_ENGINE_TO_ALERTS` | `false` | Required for any real auto-creation. |
| `ENABLE_AUTO_ALERT_TELEGRAM` | `false` | Reserved; **not implemented**. Never sends Telegram. |
| `ENABLE_AUTO_ALERT_POLICY_CONFIG` | `false` | Gates POST/PATCH policy mutations (403 when off). |
| `AUTO_ALERT_MIN_SCORE` | `70` | Template default min score. |
| `AUTO_ALERT_MIN_SAMPLE_QUALITY` | `moderate` | Template default min calibration sample. |
| `AUTO_ALERT_MAX_PER_FIXTURE` | `1` | Template default. |
| `AUTO_ALERT_MAX_PER_RUN` | `3` | Template default. |
| `AUTO_ALERT_REQUIRE_CALIBRATION` | `true` | Template default; blocks when calibration absent. |
| `AUTO_ALERT_REQUIRE_NO_CRITICAL_BLOCKERS` | `true` | Template default. |

Auto-create executes only when `ENABLE_AUTO_ALERT_POLICY && ENABLE_AUTO_ALERT_CREATE &&
ENABLE_AUTO_ENGINE_TO_ALERTS && policy.enabled && policy.mode==='auto_create_monitored'` AND every
critical gate passes AND the opportunity is not a duplicate.

## Gates (`utils/autoAlertPolicyGuard.util.ts`, PURE)
Each gate is `{name, passed, severity (info|warning|critical), reason, evidence}`. A single failed
**critical** gate ⇒ `blocked`. Gates: `opportunity_status` (strong/watch), `min_score`,
`confidence_band`, `data_quality` (poor/unknown blocked unless explicitly allowed),
`no_critical_blockers` (risk gate), `not_dismissed`, `max_per_fixture`, `max_per_run`,
`league_allowed`, `team_allowed`, `minute_window` (warning), and calibration gates
(`calibration_present`, `calibration_sample_quality`, `score_bucket_sample` (warning),
`calibration_unknown_rate` (warning), `calibration_failed_rate` (warning)). Duplicate /
already-promoted ⇒ `skipped_duplicate`. Policy/mode off ⇒ `skipped_policy_disabled`.
High `unknown` is a **warning**, never a block — `unknown` is never a failure.

## Calibration coupling (B24)
The guard reads `getAutoOpportunityTypeProfile(type)` (B24). With `requireCalibration=true`, a
missing profile or sample quality below `minSampleQuality` ⇒ blocked. Score is signal-quality,
never probability; the policy never turns it into one.

## Auto-create machinery
`autoOpportunityAlertPromotion.service.createAutoAlertFromPolicy` reuses the B22 path with sentinel
`patternId='auto_engine_manual'` (NO performance counter), `evidenceJson.source='auto_alert_policy'`
+ provenance `{ source:'auto_alert_policy', policyId, evaluationId, opportunityId, … }`, a Signal
Ledger entry (`radarName='Motor Automático — Política'`), a `ManualPromotedAlertLink` (idempotent),
and an auditable action. Because of the sentinel patternId, B23 resolves these alerts and B24
calibration includes their outcomes. No Telegram, no odds.

## Scanner integration (`autoEngine.service.ts`)
After opportunities are persisted (write mode) AND `ENABLE_AUTO_ALERT_POLICY=true`, the run
evaluates strong/watch opportunities against all enabled policies
(`evaluateOpportunitiesForRun`). Wrapped: a policy error never breaks the scan; the run note
records the tally. The scanner works unchanged when the policy is off.

## Persistence (Firebase real, Noop empty/no-throw)
Collections `autoAlertPolicies`, `autoAlertPolicyEvaluations`. Repo: create/update/get/list
policies; create/get/list evaluations (+ by opportunity / by policy). Overview is derived in the
service from evaluations + policies.

## Routes
- `GET /api/intelligence/auto-engine/auto-alert-policies`
- `GET /api/intelligence/auto-engine/auto-alert-policies/templates/default`
- `GET /api/intelligence/auto-engine/auto-alert-policies/:id`
- `POST /api/intelligence/auto-engine/auto-alert-policies` (403 unless `…POLICY_CONFIG=true`)
- `PATCH /api/intelligence/auto-engine/auto-alert-policies/:id` (403 unless `…POLICY_CONFIG=true`)
- `POST /api/intelligence/auto-engine/opportunities/:id/evaluate-auto-alert-policy` (runs shadow even without create)
- `GET /api/intelligence/auto-engine/opportunities/:id/policy-evaluations`
- `GET /api/intelligence/auto-engine/auto-alert-policy/evaluations`
- `GET /api/intelligence/auto-engine/auto-alert-policy/overview`
No auth layer yet (documented risk; single-user `default`).

## Learning events (observational, `source:'auto_alert_policy'`)
`auto_alert_policy_evaluated`, `auto_alert_policy_shadow_would_create`, `auto_alert_policy_blocked`,
`auto_alert_policy_suggested_manual_review`, `auto_alert_policy_auto_created`. Memory/audit only —
never feeds scoring or calibration automatically.

## Smoke
`node scripts/smokeAutoAlertPolicy.mjs` — disabled/shadow/suggest/auto modes, every critical gate,
high-unknown-as-warning, default-template safety, Noop safety. All pass.

## Limitations (honest, remaining)
- Auto-create is rarely exercised (requires the full flag set); default creates nothing.
- Single-policy precedence: each enabled policy is evaluated independently (no conflict resolution).
- Risk-gate gates rely on the opportunity's own gate; blocked opportunities never reach auto-create.
- No Telegram (not implemented), no odds, no per-user policies/auth, no policy→scoring feedback.

## Verification
- `npm run typecheck` ✓ · `npm run build` ✓ · all four auto-engine smokes ✓

---

## B26 — policy routes are now permission-guarded (extension)

Policy config (`POST`/`PATCH`) requires `policy:config` + admin/owner + `ENABLE_AUTO_ALERT_POLICY_CONFIG`;
policy evaluate requires `policy:evaluate` (+ rate limit). Env gates are unchanged and are checked
first by the guard (env off ⇒ 403 even for owner). Denials and successes are recorded in the admin
audit. See [`AUTH_ADMIN_GUARDRAILS.md`](./AUTH_ADMIN_GUARDRAILS.md).

---

## B28 — cloud go/no-go (extension)

In staging/production the policy stays disabled and auto-create OFF by default; the go/no-go
checklist (`BACKEND_CLOUD_STAGING_RUNBOOK.md`) treats `ENABLE_AUTO_ALERT_CREATE=true` or
`ENABLE_AUTO_ENGINE_TO_ALERTS=true` without explicit sign-off as NO-GO. Policy/auto-create state is
visible in `/api/system/diagnostics` (admin). No policy behavior changed.
