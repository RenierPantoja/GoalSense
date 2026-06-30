# Signal Quality Window Report — B71

`signalQualityWindowReport.service.ts` builds a per-window report:
duration, fixtures, snapshots, casesCreated, casesByGrade, humanReviewItemsCreated,
useful/noisy signals, missingStatsRatio, missingTimelineRatio, pendingOutcomeRatio,
dataQualityScoreObservational.

`dataQualityScoreObservational` is OBSERVATIONAL only (rewards evidence, penalizes
noise/missing) — NOT a probability, NOT accuracy, NOT for automated decisions. It
only compares windows.
