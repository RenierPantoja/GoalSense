# Governance Quality Feedback (Observe Only) — B68

`liveFirstGovernanceQualityFeedback.service.ts` rates governance decisions:
appropriate / too_aggressive / too_conservative / insufficient_evidence / data_limited / pending_more_sample.
It produces human-review recommendations only. It NEVER changes policy, thresholds, score, or runtime. data_limited reflects ESPN missing pre-match context and is not a failure.
