# Post-Match Memory Analysis — V4 (B45 / Bloco 2)

`buildPostMatchExplanationV4(fixtureId)` (appended to
`postMatchExplanationEngine.service.ts`) extends V1 with memory-aware learning.

## Adds
- `memorySupportedOutcome` — confirmed outcome aligned with a favorable context.
- `memoryContradictedOutcome` — outcome opposed the memory signal.
- `memoryWasMisleading` — a `misleading_risk` context contributed to a miss.
- `sampleWasTooWeak` — both clubs had weak/insufficient memory.
- `tabooWasInvalid` — a usable constraint existed yet the constrained outcome happened.
- `similarScenarioWasUseful` — retrieved scenarios matched the observed outcome.
- `memoryRefinementCandidates` — honest improvement notes.

## Discipline (inherited from V1)
A miss is not called "random" without evidence of an extreme/late event. A miss by
weak/old sample is named as a sample problem, not a pattern failure. `unknown` /
`not_evaluable` / `pending` are never failures. Learning only — never rewrites
score/confidence/counters/alert results.
