# Live-First Evidence Grading — B68

`liveFirstEvidenceGrading.service.ts` grades each signal:
- score_shift/late_goal: strong when scoreboard confirms a change.
- fulltime_resolution/halftime_state: strong (status is factual/authoritative).
- red_card_shift: strong with explicit timeline event, else weak.
- timeline_event_cluster: moderate when timeline present.
- shots_shift: moderate with shots stats, else insufficient.
- possession_shift: weak with possession, else insufficient.
- pressure_shift: moderate if sustained (>=3 snapshots + stats/timeline), weak if 2, else insufficient.
Missing stats become `missingEvidence` (never zero). Stale snapshots drop strength one tier (except factual status). Poor data quality weakens derived signals.
