# Signal Quality Window Comparison (B72)

Compares the most recent campaign windows so trends are visible across windows.
Observe only — all deltas and notes are observational, NOT probability or accuracy,
and never drive automated decisions.

## Contents
- Per-window entries (chronological): cases created, missing-stats ratio,
  pending-outcome ratio, observational data-quality score.
- Latest-minus-previous deltas: data-quality score, pending-outcome ratio,
  missing-stats ratio.
- Recurring useful / noisy signal kinds across windows.
- Cumulative case count.
- A `trendNote` describing the observational direction (higher / lower / stable).

## Source
Built from persisted per-window reports (`signalQualityWindowReports`). Saved to
`signalQualityWindowComparisons` and surfaced (sanitized) in the public summary as
`latestSignalQualityWindowComparison`.

## Safety
Window comparison never changes runtime, policy, threshold, score, or confidence.
Deltas are observational, not a probability or accuracy claim.
