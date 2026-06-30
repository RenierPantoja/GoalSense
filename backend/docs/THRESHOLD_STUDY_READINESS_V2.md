# Threshold Study Readiness V2 — B71

`evaluateThresholdStudyReadinessV2({ cases, untriagedCriticalOrHighValue })`:
- not_ready_small_sample: sample < 200 (and < 100).
- not_ready_too_many_unknowns: >40% unknown or >60% pending/not_evaluable.
- not_ready_review_queue_untriaged: critical/high-value items not yet triaged.
- limited_review_possible: sample >= 100 with some outcomes (threshold NOT applied).
- ready_for_human_threshold_study: sample >= 200, >= 50 evaluable, human review complete.

Readiness NEVER changes runtime, policy, thresholds, or score; it only tells
operators why the campaign is not yet ready and is gated by human review.
