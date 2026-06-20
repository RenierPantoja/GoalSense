# Taboo Intelligence Engine (B45 / Bloco 2)

Detects historical CONSTRAINT candidates ("club X never does Y in context Z") WITHOUT
superstition. Governance is strict and PURE-backed, so the vast majority of candidates
are explicitly NOT usable.

## Files
- `memory/tabooIntelligence.service.ts` — `detectTabooCandidates(teamId)`,
  `detectTabooCandidatesForFixture(fixtureId)`, `evaluateTabooCandidate`,
  `explainTabooCandidate`, `rejectWeakTaboos`, `listSupportedHistoricalConstraints`.
- Governance core: `classifyTabooFromSample` in `memorySampleQuality.service.ts`.

## Statuses (`TabooStatus`)
- `candidate` — detected, not yet sufficient.
- `supported` — strong + recent + net-positive → **the only usable constraint**.
- `weak_sample` — too few cases to assert.
- `outdated` — evidence dominated by old cases.
- `contradicted` — later evidence breaks it.
- `superstition_risk` — a "100% so far" finding on a tiny sample (the overfitting trap).
- `not_enough_data` — effectively no evidence.

Only `status === 'supported' && isUsableConstraint === true` is treated as a usable
historical constraint. `rejectWeakTaboos` drops weak / insufficient / superstition.

## Inviolable rules
Small samples never become a tabu; insufficient H2H is never a tabu; old findings are
`outdated`; a usable constraint is advisory only and **never blocks a real alert**.
