# Governance Outcome Review — Post-Match V6 (B47 / Bloco 4)

`buildPostMatchExplanationV6(fixtureId)` (appended to `postMatchExplanationEngine.service.ts`)
reviews the pre-alert governance decision against the actual outcome. Observational; never
declares a miss "random" without analysis; never changes alert results.

## Adds
- `governanceActionBeforeAlert`, `wouldHaveBlocked`, `wouldHaveWaited`, `wouldHaveAllowed`.
- `actualAlertCreated`, `overrideUsed` (alert created despite a block/wait decision).
- `governanceWasAligned` — block/wait→failed or allow→confirmed.
- `governanceWasTooStrict` — block/wait but the outcome confirmed (overconservative).
- `governanceWasTooLoose` — allow but the outcome failed.
- `ignoredHold` / `ignoredBlocker` — wait/block was ignored and the alert failed.
- `alertTooEarly`, `shouldHaveWaitedGovernance`, `shouldHaveStayedOutGovernance`.
- `governanceRefinementCandidates` — honest notes:
  `ignored_blocker`, `ignored_wait_reason`, `possible_overconservative_policy`.

This feeds the causal post-match learning of Bloco 5; nothing here mutates score/
confidence/counters/alert results.

## Superseded by causal Post-Match V7 (B48)

PostMatch V6's "latest decision per fixture" heuristic is improved by B48's Decision-Outcome
Linker (explicit link strength: exact → unknown). PostMatch V7 carries the full causal case
(classification, success/failure categories, insights and calibration suggestions). V6
remains available; V7 is the richer causal view. See `POST_MATCH_CAUSAL_LEARNING.md`.
