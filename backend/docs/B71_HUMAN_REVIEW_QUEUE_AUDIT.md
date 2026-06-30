# B71 Human Review Queue Audit

## Why the queue grew to 37
The B70 queue included every case matching a review trigger, with no dedup or
triage. Most entries are repetitive single-snapshot pressure, missing-stats, or
pending-outcome cases — low analytic value individually.

## Composition (typical)
- Single-snapshot `pressure_shift` (insufficient / high noise): majority.
- `possession_shift` / `shots_shift` with missing stats: insufficient_data_bucket.
- `partially_aligned` outcomes: pattern_watch.
- pending/not_evaluable outcomes: pending_outcome.
- Genuine critical (contradicted + strong/moderate): few/none currently.

## Triage answers
- Really critical: typically 0–few (critical_review bucket).
- high/medium/low: most are medium/low after triage.
- Repetitive: grouped into duplicate_cluster (same fixture+signalKind+reason).
- Single-snapshot pressure: low_value_noise / pattern_watch.
- Missing stats/timeline: insufficient_data_bucket.
- partially_aligned: pattern_watch.
- Can be grouped: yes (duplicate clusters).
- Monitor-only: low-evidence/low-impact items downgraded.
- Genuine human review: only critical_review + high_value_review + pattern_watch.

## Conclusion
Triage separates the few high-value items from repetitive low-value noise, so the
operator reviews the right items, not 37 raw entries. Observe only.
