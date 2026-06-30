# Threshold Study Readiness V3 (B72)

Observe-only readiness assessment with an adjudication gate. Readiness NEVER
changes runtime, policy, threshold, score, or confidence — it is a gate for a
future human study, not a probability or accuracy claim.

## Gates (in order)
1. `not_ready_small_sample` — sample below the minimum (200; hard floor 100).
2. `not_ready_too_many_unknowns` — too many unknown/not-evaluable/pending cases.
3. `not_ready_review_queue_untriaged` — critical/high-value items not triaged.
4. `not_ready_review_queue_unadjudicated` — requires-review items not adjudicated (NEW in V3).
5. `limited_review_possible` — partial readiness; study not started.
6. `ready_for_human_threshold_study` — sample + outcomes sufficient, queue triaged and adjudicated.

## What V3 adds over V2
V2 added the triage gate. V3 adds the adjudication gate: even with enough sample,
the study is not ready until the human review queue has been adjudicated.

## Current state
Sample is still small (`not_ready_small_sample`). No threshold study is performed.

## Safety
`changesRuntime` is always `false`. Readiness is observational only.
