# Live-First Signal Reliability Baseline — B70

`liveFirstSignalReliabilityBaseline.service.ts` builds an OBSERVATIONAL, NON-probabilistic baseline:
sample size by signalKind, evidence/grade/alignment/noise distributions, and ratios (notEvaluable, insufficientData, staleSnapshot, missingStats, missingTimeline, humanReview).

It is NOT accuracy, NOT a prediction, NOT a probability, NOT a bet signal. Missing data is reported as ratios, never treated as zero outcome. Minimum sample for threshold study = 200.
