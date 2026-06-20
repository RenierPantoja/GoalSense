# Team Memory Engine

`teamMemoryEngine.service.ts` lets GoalSense remember what it already analyzed about a
club. It reads its OWN history — `listAllSignalLedgerEntries` + `listAllAlertOutcomes`
— filtered by team name. It never calls a provider.

## Output — `TeamIntelligenceMemory`

- `sampleSize`, `sampleQuality` (`insufficient` <4, `low` <12, `moderate` <30, `strong`).
- `fixturesAnalyzed`, `patternsTriggered`, `patternsConfirmed`,
  `patternsConfirmedPartial`, `patternsFailed`, `unknownOutcomes`, `notEvaluable`.
- `competitionsAnalyzed`, `commonSuccessReasons`, `commonFailureReasons`,
  `dataQualityHistory`.

## Honesty rules

- Empty memory → `insufficient_history`, never a negative finding.
- Small samples are flagged small and never over-weighted; no tabu/curse without sample
  and context.
- `unknown` / `expired` outcomes count as `unknownOutcomes`, **never** as failures.
- Under Prisma/Noop persistence the ledger reads empty — the engine returns
  `insufficient_history` honestly (memory only persists under Firebase).

## Use

The internal memory is the fabric's primary honest signal. It feeds the decision-input
ledger (positive/negative/neutral by confirmed-vs-failed) and the readiness engine
(`insufficient_history` when both clubs are unseen).
