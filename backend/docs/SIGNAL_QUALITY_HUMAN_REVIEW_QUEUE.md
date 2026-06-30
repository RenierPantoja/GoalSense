# Signal Quality Human Review Queue — B70

`liveFirstHumanReviewQueue.service.ts` surfaces cases needing human judgement:
misleading_candidate (critical), contradicted+strong/moderate (high), noiseRisk=high (medium), useful_but_limited+missing context (medium), partially_aligned (low).

Each `HumanReviewItem` has a suggested review question and evidence summary. Human review NEVER auto-changes policy/thresholds. Reviewer notes are NOT published publicly without sanitization (public preview excludes reviewerNotes).
