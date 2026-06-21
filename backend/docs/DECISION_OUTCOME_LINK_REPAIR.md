# Decision-Outcome Link Repair (B49 / Bloco 6)

`validation/decisionOutcomeLinkRepair.service.ts`. Improves causal evaluability WITHOUT
lying — addresses part of the B48 "exact link depends on candidateAlertId" limitation.

## Rules
- NEVER promotes a weak/temporal link to `exact` — `exact` requires real matching ids (the
  linker enforces this).
- May upgrade `temporal_contextual` → `strong_contextual` ONLY when same fixture + same
  pattern + compatible time window + no competing candidate.
- Ambiguous stays ambiguous; unresolved (no vinculable governance result) is reported.

## API
`repairLinksForFixture(fixtureId)`, `repairLinksForToday()`, `explainUnresolvedLinks`.
Returns examined / exactConfirmed / upgraded / unresolved / ambiguous + the persisted links.
A contextual link is never treated as proof of causality.
