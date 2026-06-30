# Human Review Triage — B71

`liveFirstHumanReviewTriage.service.ts` buckets the human review queue:
critical_review, high_value_review, pattern_watch, insufficient_data_bucket,
duplicate_cluster, low_value_noise, pending_outcome, monitor_only.

Decisions: keep_for_review, downgrade_to_monitor_only, group_as_duplicate,
wait_for_more_data, dismiss_low_value, escalate_high_priority.

Rules: never deletes data; never changes policy/threshold/score/classification;
critical cases never disappear (only bucket/priority organized); reviewer notes
never published. Duplicate clustering keys on fixture+signalKind+reason.

CLI: triageHumanReviewQueue.mjs / getHumanReviewQueueSummary.mjs / exportHumanReviewBatch.mjs.
