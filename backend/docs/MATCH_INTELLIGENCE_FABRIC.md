# Match Intelligence Fabric

The fundamental context engine of GoalSense: it organizes, evaluates and explains
pre-match, live and post-match variables for **today's** games to decide when a
pattern should be considered strong, ignored, waited on, or fully avoided.

It is a **structure for honest deep analysis**, not a data fabricator. It never
invents data, never uses odds, never sends Telegram, never auto-bets, never
recommends stake, never promises accuracy. It does not change existing patterns,
runtime score/confidence, counters, or alert results. Auto-create stays OFF. The
Alert Decision Precheck ships in `observe` mode and never blocks a real alert.

## What data actually exists (see MATCH_INTELLIGENCE_FABRIC_AUDIT.md)

The backend ingests **ESPN only**: score, status, minute, team-level stats and timed
events. Pre-match domains (lineups, injuries, suspensions, standings, form, H2H,
referee, venue) are **not collected** and are surfaced honestly as `unavailable` /
`not_collected_yet` / `provider_not_supported`. The richest honest source is the
GoalSense's **own internal memory** (signal ledger, outcomes, learning profiles),
persisted under `PERSISTENCE_PROVIDER=firebase`.

## Modules (`src/modules/footballIntelligence/`)

| File | Role |
|---|---|
| `providerCapability.{types,service}.ts` | What each provider can actually deliver per domain. Odds = `not_used`. |
| `footballIntelligence.types.ts` | Canonical contracts (fixture, competition, importance, team, player, lineup, injury, suspension, form, H2H, stats, tactical, availability, readiness). Every object carries provenance + availability + reliability + limitations + `confidenceOfData` (confidence in DATA, not winning). |
| `matchDayScope.service.ts` | Focus on today's games; prioritization; respects `LOCAL_MAX_LIVE_FIXTURES`. |
| `matchContextEngine.service.ts` | Competition/stage/importance/volatility (heuristic + ESPN). See MATCH_CONTEXT_ENGINE.md. |
| `teamMemoryEngine.service.ts` | The club history GoalSense already saw. See TEAM_MEMORY_ENGINE.md. |
| `headToHeadIntelligence.service.ts` | Direct confrontation from internal memory; no superstition. |
| `squadAvailabilityEngine.service.ts` | Lineup/injury/suspension honesty + temporal readiness. See SQUAD_INJURY_SUSPENSION_LINEUP_ENGINE.md. |
| `tacticalMatchupEngine.service.ts` | Style/tempo/card-risk from live stats (low reliability) or unknown. |
| `fundamentalReadinessEngine.service.ts` | Is there enough base to analyze? ready/wait/insufficient. |
| `matchIntelligencePackage.service.ts` | Consolidates everything + positive/negative/uncertain inputs. Prepares, does not decide. |
| `decisionInputLedger.service.ts` | Structured variables considered (no math weighting this phase). |
| `alertDecisionPrecheck.service.ts` | Advisory entry decision (observe-first). See ALERT_DECISION_PRECHECK.md. |
| `postMatchExplanationEngine.service.ts` | Logical post-match learning, not excuses. See POST_MATCH_EXPLANATION_ENGINE.md. |

## API (`/api/match-intelligence`, env-gated by `ENABLE_MATCH_INTELLIGENCE`)

GET (read-only, open): `provider-capabilities`, `today`,
`fixtures/:id/{package,readiness,context,team-memory,h2h,squad-availability,tactical-matchup,decision-inputs,alert-precheck,post-match-explanation}`.
POST (operator+, respects provider budget): `fixtures/:id/refresh`, `today/refresh`.
All responses carry `limitations`.

## Decision classes

`avoid`, `wait_for_lineup`, `wait_for_live_confirmation`, `monitor`, `alert_candidate`,
`strong_alert`, `post_match_learning_only` — see MATCH_INTELLIGENCE_DECISION_PHILOSOPHY.md.

## Env flags

| flag | default | effect |
|---|---|---|
| `ENABLE_MATCH_INTELLIGENCE` | `true` | enable the fabric API |
| `ENABLE_ALERT_DECISION_PRECHECK` | `false` | enable precheck (still observe by default) |
| `ALERT_DECISION_PRECHECK_MODE` | `observe` | observe = never blocks a real alert |
| `MATCH_INTELLIGENCE_MAX_TODAY_FIXTURES` | `20` | scope ceiling (still bounded by `LOCAL_MAX_LIVE_FIXTURES`) |

## Inviolable rules

Zero mock / invented data / ML fake / odds / Telegram / auto-bet / stake. Absent ≠
zero; unknown injury ≠ no injury; unknown suspension ≠ no suspension; missing lineup ≠
empty lineup; insufficient H2H ≠ tabu; unknown classic ≠ classic; unknown stage ≠
final. `unknown`/`not_evaluable`/`pending` are never failures. B12–B38 preserved;
Firebase + Prisma(Noop) preserved; builds pass.

## Real limitations (today)

- Pre-match richness (lineups/injuries/suspensions/standings/H2H/referee/venue) is not
  collected → pre-match analysis is `provider_limited` by nature.
- Internal memory only persists under Firebase; under Prisma/Noop it reads empty
  (`insufficient_history`, never a negative finding).
- Live tactical reads are LOW-reliability estimates from team-level stats.
- The precheck is advisory only; it is not wired into the alert engine.

## B40 — Multi-provider pre-match acquisition (additive)

The fabric now has a multi-provider acquisition layer (registry + per-domain router +
honest skeleton adapters), a temporal acquisition planner/runner (T-24h … T-15min …
live … post), a persisted pre-match data store, a Lineup Window Engine, a Player
Importance foundation, and V2 versions of readiness, precheck, post-match and the match
package. ESPN remains the only wired source; every other domain reports
`provider_not_configured` until credentials are supplied. Nothing is fabricated. See
`PRE_MATCH_ACQUISITION.md`, `LINEUP_WINDOW_ENGINE.md`, `PLAYER_IMPORTANCE_FOUNDATION.md`,
`ALERT_DECISION_PRECHECK_V2.md`, `POST_MATCH_EXPLANATION_V2.md`.

## B41 — real provider integration + manual intake (additive)

Real (env-gated) API-Football today_fixtures fetch + provider readiness report; an
auditable manual intelligence intake; a provider+manual merge engine with conflict
detection; and Readiness V3 / Precheck V3 / Acquisition Runner V2 consuming both. ESPN
stays the wired live source. Nothing fabricated; observe-first; no score/confidence
changes. See `REAL_PRE_MATCH_PROVIDER_INTEGRATION.md`, `MANUAL_INTELLIGENCE_INTAKE.md`,
`PRE_MATCH_DATA_MERGE.md`, `READINESS_V3.md`, `PRECHECK_V3.md`.

## B44 / Bloco 1 — critical pre-match data acquisition (additive)

Adds a Provider Endpoint Catalog, Domain Unlock Matrix V2, canonical normalizer V2,
critical-domain snapshot store V2, Acquisition Runner V4, Readiness V5, Precheck V5,
Post-Match V3 and Match Intelligence Package V3. Real fetch happens only for documented
endpoints with env + confirmed mappings; everything else is honestly blocked or manual.
See `CRITICAL_PRE_MATCH_DATA_ACQUISITION.md`.

## B45 / Bloco 2 — Historical Memory layer

The fabric now carries a deep historical-memory layer under
`modules/footballIntelligence/memory/`:
- `memorySampleQuality.service.ts` (PURE sample-quality engine — the disciplined heart).
- `teamFundamentalMemory.service.ts`, `matchupFundamentalMemory.service.ts`,
  `contextualPatternMemory.service.ts`, `tabooIntelligence.service.ts`,
  `similarScenarioRetrieval.service.ts`, `historicalMemoryBuildRunner.service.ts`.
- Package **V4** (`matchIntelligencePackageV4.service.ts`) composes V3 + memory.
- Readiness **V6**, Precheck **V6** (observe-first), Post-Match **V4**.
- Routes under `/api/match-intelligence`: `fixtures/:id/memory` (+`/memory/build`),
  `teams/:teamId/fundamental-memory` (+build), `fixtures/:id/matchup-memory`,
  `.../taboos`, `.../similar-scenarios`, `.../pattern-memory`, `memory/build-runs`,
  `memory/today/build`, `memory/status`, `package-v4`, `readiness-v6`, `precheck-v6`,
  `post-match-explanation-v4`.

Memory is advisory: reliability ≠ probability; small samples never conclude; H2H
insufficient is never a tabu; old history is down-weighted; absence is never zero; it
never changes score/confidence/patterns/alerts and the precheck stays observe. See
`HISTORICAL_CLUB_MEMORY.md`, `MATCHUP_FUNDAMENTAL_MEMORY.md`,
`CONTEXTUAL_PATTERN_MEMORY.md`, `TABOO_INTELLIGENCE_ENGINE.md`,
`SIMILAR_SCENARIO_RETRIEVAL.md`, `MEMORY_AWARE_PRECHECK.md`,
`POST_MATCH_MEMORY_ANALYSIS.md`.

## B46 / Bloco 3 — Variable Influence layer

The fabric now carries a variable-influence layer under
`modules/footballIntelligence/influence/`:
- `variableInfluence.types.ts`, `variableTaxonomy.service.ts`, `patternSensitivity.service.ts`,
  `variableExtraction.service.ts`, `variableInfluenceRuleEngine.service.ts`,
  `influenceAggregator.service.ts`, `variableConflictEngine.service.ts`,
  `influenceLedger.service.ts`.
- Package **V5** (`matchIntelligencePackageV5.service.ts`) composes V4 + influence.
- Readiness **V7**, Precheck **V7** (observe), Post-Match **V5**, DecisionInputLedger **V2**.
- Routes under `/api/match-intelligence`: `fixtures/:id/influence` (+build),
  `fixtures/:id/patterns/:patternId/influence` (+build), `package-v5`, `readiness-v7`,
  `precheck-v7`, `post-match-explanation-v5`, `influence/build-runs`.

Influence is advisory: it is NOT a probability; `influenceScore` is internal weight;
absent variables never become negative; weak sample never strong; manual stays manual;
conflicts are explicit; blocking dominates; it never changes score/confidence/patterns/
alerts and the precheck stays observe. See `VARIABLE_INFLUENCE_ENGINE.md`,
`VARIABLE_TAXONOMY.md`, `PATTERN_SENSITIVITY_PROFILES.md`, `INFLUENCE_AGGREGATOR.md`,
`INFLUENCE_AWARE_PRECHECK.md`, `POST_MATCH_INFLUENCE_ANALYSIS.md`.

## B47 / Bloco 4 — Alert Decision Governance layer

The fabric now has a governance layer under `modules/footballIntelligence/governance/`:
- `alertDecisionGovernance.types.ts`, `alertGovernancePolicy.service.ts`,
  `alertDecisionGovernor.service.ts`, `alertGovernanceHold.service.ts`,
  `liveGovernanceReevaluation.service.ts`, `assumptionInvalidation.service.ts`.
- Post-Match **V6** (governance outcome review).
- Shadow wiring (observe-first): command pattern flow, Auto Engine opportunities,
  promoted opportunities.
- Routes under `/api/match-intelligence/governance`: `mode`, `fixtures/:id/governance`
  (+`/evaluate`, `/holds`, `/live-trigger`), `holds/:id/recheck|resolve`, `holds/expire`,
  `results/:id`, `runs`, plus `fixtures/:id/post-match-explanation-v6`.

Governance is advisory: a decision is NOT a probability; observe/shadow never blocks a
real alert; enforce is flag-gated and ultra-conservative; holds expire; live recheck never
sends an alert; conflicts/overrides are audited; it never changes score/confidence/
patterns/alert results. See `ALERT_DECISION_GOVERNANCE.md`, `GOVERNANCE_POLICY.md`,
`GOVERNANCE_HOLDS.md`, `LIVE_GOVERNANCE_REEVALUATION.md`, `ASSUMPTION_INVALIDATION.md`,
`GOVERNANCE_OUTCOME_REVIEW.md`.

## B48 / Bloco 5 — Post-Match Causal Learning layer

The fabric now has a causal-learning layer under `modules/footballIntelligence/causal/`:
- `causalLearning.types.ts`, `decisionOutcomeLinker.service.ts`,
  `causalLearningCaseBuilder.service.ts`, `causalOutcomeClassifier.service.ts`,
  `causalInsightGenerator.service.ts`, `calibrationSuggestion.service.ts`,
  `governanceCalibrationReview.service.ts`, `causalLearningRunner.service.ts`.
- Post-Match **V7** (causal learning output).
- Routes under `/api/match-intelligence/causal`: `cases` (+`/:id`, fixture-scoped),
  `run` (fixture/today/alert/governance-result), `insights`, `calibration/governance|influence|report`,
  `calibration/:id/review|reject|accept-for-future`, `runs`, plus
  `fixtures/:id/post-match-explanation-v7`.

Causal learning is observational: classification is NOT a probability; an error is not
chance without evidence; weak links never become strong causality; suggestions never
auto-apply (accept = future only) and require human review; it never changes score/
confidence/patterns/alert results/enforce. See `POST_MATCH_CAUSAL_LEARNING.md`,
`DECISION_OUTCOME_LINKER.md`, `CAUSAL_OUTCOME_CLASSIFIER.md`, `CAUSAL_INSIGHT_GENERATOR.md`,
`GOVERNANCE_CALIBRATION_LOOP.md`, `VARIABLE_INFLUENCE_CALIBRATION.md`, `CAUSAL_LEARNING_RUNNER.md`.
