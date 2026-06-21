# Post-Match Causal Learning — Flow Map (B48 / Bloco 5)

Audit of every link that lets the GoalSense learn from a decision's outcome BEFORE
building causal learning. Rule: never infer strong causality from a weak link; an error
is not "chance" without evidence; suggestions never auto-apply.

## Where the pieces live

| Piece | Source |
|---|---|
| Alerts created | `commandEvaluation.service` (`pat_…`), `autoOpportunityAlertPromotion` (sentinel) |
| Outcomes | `intelligence.AlertOutcomeRecord` (`getAlertOutcomeByAlertId`, `listAllAlertOutcomes`) |
| Governance decisions | B47 `alertDecisionGovernanceResults` (by fixture/pattern/candidate) |
| Holds | B47 `alertGovernanceHolds` |
| Live re-evaluations | B47 `alertGovernanceRuns` |
| Assumption invalidations | B47 `assumptionInvalidations` |
| Influence | B46 `influenceLedgerEntries` + `composeInfluence` |
| Critical pre-match data | B44 `preMatchDomainSnapshots` |
| Historical memory | B45 team/matchup/pattern-context profiles |
| Package V5 / PostMatch V6 | B46/B47 services |
| Signal ledger | B12 `signalLedger` (alertId ↔ fixture/pattern) |

## Linking a decision to an outcome
- **Exact** only when ids match: a governance result's `candidateAlertId === alertId`, and
  the outcome's `alertId === alertId`.
- **Strong contextual**: same fixture+pattern, governance generated shortly before the
  alert/outcome.
- **Temporal/weak contextual**: same fixture, no pattern match or far apart in time.
- **Unknown / not_evaluable**: no usable link, or outcome `pending`/`unknown`.

## Strong vs heuristic links
- Strong: command alerts that carry `candidateAlertId` in the governance result (B47 wiring
  passes the created alert id), matched to that alert's outcome.
- Heuristic: promoted/auto opportunities and any decision created before the alert id
  existed (fire-and-forget shadow). These get `temporal_contextual`/`weak_contextual`.

## Not-evaluable cases
- Outcome `pending`/`unknown`/`expired`; no governance result; Noop persistence (empty
  reads). These are surfaced honestly, never as `failed`.

## False-causality risks
- Treating a weak link as proof a decision caused the outcome.
- Calling a miss "variance" without an extreme-event (red card / late goal / shock) record.
- Blaming the pattern when a critical domain was missing (provider limitation) or when a
  sample was weak (overweighted memory/influence).
- Treating `confirmed_partial`/`unknown`/`not_evaluable` as failure.

## Refinements that can be suggested WITHOUT touching runtime
- Governance policy: tighten/loosen a gate (suggestion only, requiresHumanReview).
- Variable influence: a variable was over/underestimated for a pattern family.
- Memory: weak sample overweighted.
- Data acquisition: a missing critical domain repeatedly hurt; suggest manual intake.
- Live recheck: alert too early; live confirmation was needed.

## Conclusion
Build a Decision-Outcome Linker (with honest link strength), a Case Builder, a conservative
Classifier, an Insight Generator and a Calibration Suggestion engine + human review — all
observational, non-fatal, persisted to Firebase, with `autoApplicable=false` everywhere and
nothing mutating score/confidence/patterns/alert results/enforce.
