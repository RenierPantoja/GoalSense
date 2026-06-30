# Threshold Study Readiness Policy — B70

`evaluateThresholdStudyReadiness(cases)` returns:
- not_ready_small_sample (< 200 cases)
- not_ready_too_many_unknowns (> 40% unknown evidence/alignment)
- not_ready_missing_outcomes (> 60% pending/not_evaluable)
- limited_review_possible (< 50 evaluable)
- ready_for_human_threshold_study

Readiness is observational and NEVER changes runtime, policy, thresholds, or score. It only tells operators where to study more, gated by human review.
