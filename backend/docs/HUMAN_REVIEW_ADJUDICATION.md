# Human Review Adjudication (B72)

Conservative adjudication of the human review queue. Observe only — adjudication
NEVER changes policy, threshold, score, confidence, or runtime. It only organizes
the queue (marks items reviewed) and records an auditable decision.

## Decisions
- `needs_more_samples` — default for pattern_watch without strong evidence; defer
  until more windows accumulate.
- `insufficient_evidence` — missing critical context / evidence insufficient to judge.
- `duplicate_of_existing_pattern` — real repetition (duplicate cluster).
- `confirmed_noise` — ONLY when clearly noise (high noise + noisy grade + contradicted).
- `confirmed_useful_signal` — ONLY when strong evidence AND outcome aligned.

## Conservative posture (small sample)
While the sample is small, the system defaults to `needs_more_samples` or
`insufficient_evidence`. `confirmed_useful_signal` and `confirmed_noise` require
strong, unambiguous evidence. This prevents premature conclusions.

## Reviewer private notes
`reviewerNotesPrivate` is stored locally only and is NEVER published. The public
summary exposes only an assertion flag (`reviewerNotesWithheld: true`) plus
aggregate decision counts.

## Effect on runtime
None. Adjudication marks queue status (`reviewed` / `needs_more_data`) so the
operator can work the queue. `runtimeImpact` is always `none`.

## CLI
- `node scripts/listHumanReviewItems.mjs --requires-review` — list items (no notes).
- `node scripts/adjudicateHumanReviewQueue.mjs` — apply conservative adjudication.
- `node scripts/adjudicateHumanReviewItem.mjs --item <id> --decision <d> [--note "..."]` — single item.
- `node scripts/getHumanReviewAdjudicationSummary.mjs` — latest summary + readiness V3.
