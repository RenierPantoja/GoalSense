# Post-Match Explanation Engine

`postMatchExplanationEngine.service.ts` explains, after the match, why a pattern worked
or not — as logical learning, never an excuse. It reads the match package (post-match),
the alert outcome (if any) and the event stream.

## Output — `PostMatchExplanation`

- `outcome`: confirmed | confirmed_partial | failed | unknown | expired | not_evaluable
  | pending | no_alert.
- `keyReasonsItWorked`, `keyReasonsItFailed`, `invalidatedAssumptions`,
  `unexpectedEvents`, `dataQualityIssues`, `refinementCandidates`, `learningNotes`.
- Cause flags: `wasMostlyRandom`, `wasAnalysisWeak`, `wasProviderLimited`.
- Hindsight flags: `shouldHaveStayedOut`, `shouldHaveWaited`,
  `shouldHaveAlertedEarlier/Later`.

## Honesty rules (no lazy "bad luck")

- A miss is **not** called `wasMostlyRandom` unless there is evidence of an extreme/
  unpredictable event (red card, own goal, penalty, disallowed goal, VAR) or a very late
  goal (>= 80'). Variance requires evidence.
- A miss tied to missing/poor data → `wasProviderLimited` (a data limitation, not a
  pattern fault).
- A miss where fundamentals contradicted the alert → `wasAnalysisWeak` +
  `shouldHaveStayedOut` (a decision flaw, named honestly).
- A miss with no extreme event and no data gap → "investigate, do not assume chance".
- `unknown`/`expired`/`pending` are never failures — explicitly noted.

## Limitations

Built from team-level ESPN events/snapshots + internal memory. It cannot attribute
causes to player-level facts (lineups/injuries are not collected); those remain
`unknown` and are not blamed.
