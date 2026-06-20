# Post-Match Influence Analysis — V5 (B46 / Bloco 3)

`buildPostMatchExplanationV5(fixtureId)` (appended to `postMatchExplanationEngine.service.ts`)
extends V1 with influence-outcome analysis to start calibrating weights.

## Adds
- `netInfluenceBand` (pre-match aggregate band).
- `influenceAssessmentWasAligned` — supportive→confirmed or contradictory→failed.
- `misleadingInfluences` — looked positive but the outcome failed.
- `underestimatedInfluences` — negative signals that turned out right on a confirmation.
- `overestimatedInfluences` — high/critical magnitude that did not hold.
- `ignoredBlockers` / `ignoredWaitReasons` — blockers/waits present before a failed outcome.
- `influenceRefinementCandidates` — honest tuning notes (reduce weight of low-reliability
  variables, require live confirmation when sample was weak, reinforce blocking/wait gates,
  do not alert strong when confidence was low).

## Discipline
A miss is not "random" without evidence (inherited from V1). Weak/old samples are named as
sample problems, not pattern failures. `unknown` / `not_evaluable` / `pending` are never
failures. Learning only — never rewrites score/confidence/counters/alert results.
