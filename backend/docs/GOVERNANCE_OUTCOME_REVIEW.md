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
