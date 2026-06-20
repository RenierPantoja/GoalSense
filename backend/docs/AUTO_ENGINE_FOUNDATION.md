# Automatic Engine — Foundation (Phase B19)

First foundation of the **Intelligent Opportunity Scanner**: a read-only engine
that watches live fixtures and surfaces explainable, ranked **opportunities**
using the patterns/alerts/outcomes, the B13 learning profiles and the match
context. **OFF by default and honest**: no real alerts, no odds, no auto-bet/stake,
no automatic Telegram, no ML, no invented data, no changes to patterns/confidence/
performance counters.

> `unknown` ≠ `failed` · missing data ⇒ **block reason**, never a failure ·
> `confirmed_partial` stays partial usefulness · scores are **signal-quality,
> NOT probabilities** and never a promise of outcome.

## What it produces
For each live fixture it evaluates deterministic strategies and emits
`AutoOpportunity` objects with a score breakdown, an honest risk gate, a context
fit and a plain pt-BR explanation. It answers:
- Which live games show a real, observable opportunity *right now*?
- Why now — which live signals and (when available) which learning context?
- How strong is the evidence, and what is missing/limiting?
- Which active radar performs well in this context (without firing it)?

## Strategies (`autoOpportunityScanner.service.ts`)
Pure per-fixture evaluation, using ONLY data that exists:
- `late_goal_pressure` — ≥70', tight scoreline, recent offensive pressure.
- `first_half_goal_pressure` — 25'–45' of the 1H, tight score, pressure.
- `corners_pressure` — needs corner data; blocked (not failed) when absent.
- `cards_pressure` — needs card data; blocked when absent.
- `dominant_home_pressure` / `dominant_away_pressure` — needs possession + shots.
- `pattern_similarity` — best active radar whose **B13 learning profile** (moderate/
  strong sample, usefulRate ≥ 0.5) matches this minute-window/competition context.
  Learning-dependent: blocked when the sample is below `AUTO_ENGINE_MIN_SAMPLE_QUALITY`.

Missing required stats → `requiredDataPresent=false` → **blocked**. No evidence
with data present → skipped silently (just "nothing here").

## Scoring (`autoSignalScoring.service.ts`)
Deterministic signal-QUALITY blend (0..100): base + live context (recent
offensive events, tight score, live stats present) + pattern/competition/team/
minute-window learning (only when a real sample exists) + data-quality term −
risk penalty (insufficient sample, high unknown rate). Every term carries a
human note. It is explicitly **not** a probability.

## Risk gate (`autoSignalRiskGate.service.ts`)
Conservative — better to block than to signal weakly. Block reasons:
`not_live`, `data_poor` (poor/unknown), `provider_stale` (>5min snapshot),
`missing_required_data`, `no_evidence`, `recent_manual_alert`,
`duplicate_opportunity`, `max_opportunities_per_fixture`,
`sample_quality_insufficient` (learning-dependent only), `historically_weak`,
`too_much_unknown` (≥0.6), `score_below_minimum`. Partial data → allowed but
`reduce` (penalty/warning), never a block. Live-only strategies tolerate an
insufficient sample (limited context, not blocked).

## Confidence band & status (`utils/autoSignalContext.util.ts`)
Band (`low`/`medium`/`high`/`insufficient_data`) is derived from the score but
**capped by sample quality** — never "high" on a low/moderate sample, and
`insufficient_data` whenever live data is poor/unknown. Status `strong` requires
a high score AND a moderate/strong sample; otherwise at most `watch`.

## Explainability (`autoSignalExplainability.service.ts`)
Builds `headline / whyNow / evidenceUsed / historicalContext / risks /
relatedPatternNote`. Never invents H2H, injuries or odds. Flags heuristic
context (competition type derived from the name), flags `limited` context (no
sample), surfaces missing data and block reasons instead of hiding them.

## Determinism (`utils/autoSignalId.util.ts`)
Opportunity id is stable per `(fixture, type, 5-minute bucket)` so repeated scans
in the same window **upsert** instead of duplicating. Run id is `aer_…`.

## Persistence (Repository Layer)
`IntelligenceRepository` extended: `createAutoEngineRun` / `updateAutoEngineRun` /
`getAutoEngineRun` / `getLatestAutoEngineRun` / `listAutoEngineRuns`,
`upsertAutoOpportunity` / `getAutoOpportunity` / `listAutoOpportunities` /
`listAutoOpportunitiesByFixture`. Firestore collections `autoEngineRuns`,
`autoOpportunities`. Firebase persists; **Prisma mode uses the Noop adapter**
(reads empty, writes accepted without persistence). Writes happen ONLY when
`ENABLE_AUTO_ENGINE_WRITE=true` AND the scan is invoked with `persist` (never on
dry-run).

## Orchestration (`autoEngine.service.ts`)
`runAutoEngineScan({ dryRun?, limit?, persist? })` — skips honestly when
`ENABLE_AUTO_ENGINE=false`; loads live fixtures + latest snapshots + B13 profiles
+ active patterns once, scans each fixture, ranks opportunities, persists only
when write is on. `getAutoEngineOverview()` aggregates counts, top types,
data-quality breakdown, block reasons, latest opportunities and **honest
limitations**. Flag helpers: `isAutoEngineEnabled/WriteEnabled/SchedulerEnabled/
ToAlertsEnabled`.

## Scheduler (`autoEngine/autoEngineScheduler.service.ts`)
`startAutoEngineScheduler()` runs the scan every `AUTO_ENGINE_INTERVAL_MS`
(min 30s) ONLY when `ENABLE_AUTO_ENGINE=true` AND `ENABLE_AUTO_ENGINE_SCHEDULER=true`.
Never in `test`, never throws at startup, skips overlapping ticks. Wired in
`server.ts` next to the other workers/schedulers.

## API (`modules/intelligence/autoEngine.routes.ts`, prefix `/api`)
Read endpoints are open and honest (null/[] with 200, never 500 on absence):
- `GET  /intelligence/auto-engine/status` — overview.
- `POST /intelligence/auto-engine/scan` — **gated by `ENABLE_AUTO_ENGINE` (403 when off)**;
  body `{ dryRun?, limit?, persist? }`; never creates alerts/Telegram.
- `GET  /intelligence/auto-engine/runs` · `/runs/:runId`
- `GET  /intelligence/auto-engine/opportunities` (`?status=&type=&limit=`) · `/opportunities/:id`
- `GET  /intelligence/auto-engine/fixtures/:fixtureId/opportunities`

> No auth layer yet — documented as a future phase. `ENABLE_AUTO_ENGINE_TO_ALERTS`
> exists but is intentionally **NOT** wired to alert creation (deferred to B20/B21).

## Environment flags (`env.ts`, all OFF by default)
| Flag | Default | Effect |
| --- | --- | --- |
| `ENABLE_AUTO_ENGINE` | `false` | Master switch — scans are skipped when off. |
| `ENABLE_AUTO_ENGINE_WRITE` | `false` | Allow persistence of runs/opportunities. |
| `ENABLE_AUTO_ENGINE_SCHEDULER` | `false` | Allow the periodic scan. |
| `ENABLE_AUTO_ENGINE_TO_ALERTS` | `false` | Reserved; NOT wired (B20/B21). |
| `AUTO_ENGINE_INTERVAL_MS` | `60000` | Scheduler interval (min 30s). |
| `AUTO_ENGINE_MAX_FIXTURES_PER_RUN` | `20` | Cap fixtures per scan (≤60). |
| `AUTO_ENGINE_MIN_SAMPLE_QUALITY` | `moderate` | Min sample for learning-dependent strategies. |
| `AUTO_ENGINE_MIN_SCORE` | `55` | Minimum score to be a watch/strong. |
| `AUTO_ENGINE_MAX_OPPS_PER_FIXTURE` | `3` | Cap opportunities per fixture. |

## Scripts
- `scripts/smokeAutoEngine.mjs` — **pure** in-memory smoke (no env/network):
  deterministic ids, scoring honesty, risk-gate blocks (incl. `unknown` ≠ failure),
  confidence-band cap, real-event counting, explainability honesty, Noop safety.
  `node scripts/smokeAutoEngine.mjs` (build first).
- `scripts/runAutoEngineScan.mjs` — manual scan (`--dry-run`, `--limit=N`,
  `--persist`). Read-only unless `--persist` AND `ENABLE_AUTO_ENGINE_WRITE=true`.

## Guarantees
No real alerts · no odds · no auto-bet/stake · no automatic Telegram · no ML ·
no invented data · patterns/confidence/performance counters untouched · earlier
phases (B12–B18) intact · Firebase mode preserved · Prisma fallback preserved
(Noop) · honest empty states · limitations always visible.

## B20 — Cockpit UI consumes this foundation (read-only)

The B20 "Motor Automático" tab in the Command Center consumes these endpoints
read-only via `src/services/autoEngineApi.ts` (403 → honest "disabled" state). It
shows the engine flags, a controlled manual scan, ranked opportunities (including
**blocked** ones, as evidence of conservative intelligence) and an Opportunity
Inspector drawer (Resumo / Evidências / Score Ledger / Riscos-Bloqueios / Contexto
histórico / Aprendizado). It never creates alerts/odds/bets/Telegram, never wires
`ENABLE_AUTO_ENGINE_TO_ALERTS`, and never alters patterns/confidence/counters —
opportunity ≠ alert, score ≠ probability, unknown/missing ≠ failure. See
`docs/AUTO_ENGINE_COCKPIT_UI_FOUNDATION.md` and `docs/AUTO_ENGINE_COCKPIT_UI_AUDIT.md`.

## B21 — Opportunity actions + promotion (read/observational)

B21 adds auditable human interaction on top of this foundation: save / dismiss /
feedback / notes and a radar **promotion proposal** (`buildPromotionPlan`, pure), plus a
read-only fixture-context lookup and server-side opportunity search. New Firestore
collections `autoOpportunityActions`, `autoOpportunityUserStates`,
`autoOpportunityPromotionPlans` (Firebase persists; Prisma → Noop). Observational
learning events use `source=user_feedback` and are NEVER counted as statistical truth.
Still no alert/odds/bet/Telegram, no pattern/score change, and `ENABLE_AUTO_ENGINE_TO_ALERTS`
remains unwired. See `backend/docs/AUTO_OPPORTUNITY_ACTIONS.md` and `docs/AUTO_OPPORTUNITY_ACTIONS_UI.md`.

---

## B22 — Manual Alert Promotion (extension)

The Auto Engine can now hand a **strong**/**watch** opportunity to the manual-alert
promotion workflow (human-confirmed only). See
[`AUTO_OPPORTUNITY_MANUAL_ALERT_PROMOTION.md`](./AUTO_OPPORTUNITY_MANUAL_ALERT_PROMOTION.md)
for the full contract. Highlights:

- New routes on `autoEngine.routes.ts`: `GET …/opportunities/:id/alert-preview`,
  `POST …/opportunities/:id/promote-to-alert` (403 when `ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION=false`,
  400 without explicit confirmation), `GET …/opportunities/:id/promoted-alert`.
- Service `autoOpportunityAlertPromotion.service.ts` + pure utils
  `utils/autoOpportunityAlertPromotion.util.ts` and `utils/autoSignalLabels.util.ts`.
- New flags (all OFF except resolution governance): `ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION`,
  `ENABLE_PROMOTED_ALERT_RESOLUTION=true`, `ENABLE_PROMOTED_ALERT_TELEGRAM`.
- Sentinel patternId `auto_engine_manual`, **no** performance counter, ledger `patternId=null`,
  idempotent link `mpa_${opportunityId}` in `autoPromotedAlertLinks`.
- `ENABLE_AUTO_ENGINE_TO_ALERTS` remains present but is **not** wired to automatic alert creation.

---

## B23 — Promoted Alert Resolution + Opportunity Outcome Loop (extension)

Promoted alerts (B22) now resolve through the existing honest cycle as a separate class. New
flags `ENABLE_PROMOTED_ALERT_RESOLUTION` (default true; off ⇒ stays pending) and
`ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE` (default false; gates resolve-now). New service
`promotedAlertResolution.service.ts` + pure `utils/promotedAlertResolution.util.ts`; integration
inside `modules/command/alertResolution.service.ts` (no behavior change for radar alerts; no
performance counter, no Telegram for promoted alerts). New collections
`autoPromotedAlertOutcomeLinks` and `autoOpportunityOutcomeSummaries`. New query routes:
`opportunities/:id/outcome-summary`, `promoted-alerts/:alertId/outcome-link`, `promoted-alerts`,
and env-gated `promoted-alerts/:alertId/resolve-now`. Smoke: `smokePromotedAlertResolution.mjs`.
See [`PROMOTED_ALERT_RESOLUTION.md`](./PROMOTED_ALERT_RESOLUTION.md).

---

## B24 — Auto Engine Learning & Calibration (extension)

A separate, observational learning layer built from the closed B22/B23 loop (promoted alerts +
outcomes). New module `autoEngine/autoEngineLearning.types.ts` + pure
`utils/autoEngineCalibration.util.ts` + `autoEngineLearningAggregator.service.ts` +
`autoEngineCalibration.service.ts` + `autoEngineLearningScheduler.service.ts` (disabled by
default, wired in `server.ts`). New collections `autoEngineLearningRuns` /
`autoEngineLearningProfiles` (does NOT touch B13 `patternLearningProfiles`). New flags
`ENABLE_AUTO_ENGINE_LEARNING_REBUILD`, `ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER`,
`AUTO_ENGINE_LEARNING_INTERVAL_MS`. Routes under `/api/intelligence/auto-engine/learning/*` and
`/calibration/overview`. Script `runAutoEngineLearningAggregation.mjs`; smoke
`smokeAutoEngineLearning.mjs`. Observational only — never auto-tunes the engine, never rewrites
opportunity scores. See [`AUTO_ENGINE_LEARNING_CALIBRATION.md`](./AUTO_ENGINE_LEARNING_CALIBRATION.md).

---

## B25 — Auto Alert Policy Engine + Shadow Mode (extension)

A controlled-automation policy layer decides whether an opportunity may become a monitored alert.
Shadow-first: default creates nothing. Modules `autoEngine/autoAlertPolicy.types.ts` +
`utils/autoAlertPolicyGuard.util.ts` + `utils/autoAlertPolicyTemplate.util.ts` +
`autoAlertPolicyConfig.service.ts` + `autoAlertPolicyEvaluation.service.ts`. Auto-create reuses the
B22 machinery (sentinel patternId; provenance `source='auto_alert_policy'`) so B23/B24 pick it up.
New collections `autoAlertPolicies` / `autoAlertPolicyEvaluations`. Scanner evaluates strong/watch
opportunities after persistence only when `ENABLE_AUTO_ALERT_POLICY=true` (non-fatal). Flags all
shadow-first (`ENABLE_AUTO_ALERT_POLICY=false`, `ENABLE_AUTO_ALERT_CREATE=false`,
`ENABLE_AUTO_ALERT_TELEGRAM=false`, …). Smoke `smokeAutoAlertPolicy.mjs`. See
[`AUTO_ALERT_POLICY_ENGINE.md`](./AUTO_ALERT_POLICY_ENGINE.md).

---

## B26 — Auth, Admin Guardrails & Security (extension)

Sensitive Auto Engine routes are now permission-guarded: scan (`run:scan` + `ENABLE_AUTO_ENGINE`),
opportunity action/feedback/notes (`opportunity:*`), promotion plan (`promotion:plan`),
promote-to-alert (`promote:alert`), policy config (admin), policy evaluate, learning rebuild
(admin), resolve-now (admin) — each keeping its env gate (checked first) plus rate limiting on
dangerous routes and admin-audit logging. A global `onRequest` hook attaches `request.auth`. Reads
stay open when `ENABLE_AUTH=false`. See [`AUTH_ADMIN_GUARDRAILS.md`](./AUTH_ADMIN_GUARDRAILS.md).
