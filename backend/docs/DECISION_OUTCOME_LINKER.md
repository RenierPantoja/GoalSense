# Decision-Outcome Linker (B48 / Bloco 5)

`causal/decisionOutcomeLinker.service.ts`. Builds the strongest HONEST link between a
governance decision, an alert and an outcome — reducing PostMatch V6's "latest decision per
fixture" heuristic.

## Link strength
- `exact` — ONLY when `governance.candidateAlertId === alertId`.
- `strong_contextual` — same fixture+pattern, close in time, single candidate.
- `temporal_contextual` — same fixture+pattern (far apart) or multiple candidates.
- `weak_contextual` — same fixture, no pattern match.
- `unknown` — no fixture/decision link.

`classifyLinkStrength` is PURE. `findBestGovernanceResultForAlert` prefers a by-candidate
match (exact), then same-pattern fixture results, then any fixture result. Multiple close
candidates → `ambiguous=true`.

## Rule
A contextual link is never treated as exact, and a weak/unknown link makes the case
`not_evaluable`/`unknown` in the classifier — the system refuses to infer strong causality
from a weak link.
