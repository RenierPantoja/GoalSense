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
