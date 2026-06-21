# Variable Influence Engine (B46 / Bloco 3)

Advisory/shadow layer that evaluates HOW each variable affects the operational strength
of a pattern/opportunity/decision. It explains what supports, what contradicts, what
blocks and what requires waiting — **without** changing score/confidence/patterns/alerts.

## Pipeline
`MatchIntelligencePackage V4` → **extraction** (`variableExtraction.service`) →
**sensitivity** (`patternSensitivity.service`) → **rule engine**
(`variableInfluenceRuleEngine.service`) → **aggregator** (`influenceAggregator.service`)
→ **conflict engine** (`variableConflictEngine.service`) → **ledger/orchestrator**
(`influenceLedger.service`).

## Files (`modules/footballIntelligence/influence/`)
- `variableInfluence.types.ts` — contracts (Direction/Magnitude/Source/Reliability/
  Category, Input, Assessment, PatternVariableSensitivityProfile, InfluenceAggregate,
  VariableConflict, InfluenceLedgerEntry, InfluenceBuildRun).
- `variableTaxonomy.service.ts` — central variable catalogue (PURE).
- `patternSensitivity.service.ts` — pattern family + sensitivity profiles (PURE).
- `variableExtraction.service.ts` — extracts variables from Package V4 (no invention).
- `variableInfluenceRuleEngine.service.ts` — deterministic variable → influence (PURE).
- `influenceAggregator.service.ts` — combines into a net band + internal score (PURE).
- `variableConflictEngine.service.ts` — explicit conflicts (PURE).
- `influenceLedger.service.ts` — compose (read-only) + persist + build runs.

## Inviolable rules
- influence is NOT a probability; `influenceScore` is internal operational weight;
  `confidenceOfAssessment` is confidence in the assessment, not in the match result;
- an absent variable never becomes a negative fact (it becomes a limitation/wait);
- weak sample reduces magnitude; H2H insufficient is never high influence;
- manual stays manual (badge), provider stays provider, conflict is always explicit;
- unknown/not_evaluable are never `failed`; pattern with unknown family → conservative;
- blocking dominates the aggregate; missing critical data → wait/insufficient, not negative.

## Env
`ENABLE_VARIABLE_INFLUENCE_ENGINE=true`, `ENABLE_VARIABLE_INFLUENCE_BUILD=true`,
`VARIABLE_INFLUENCE_MODE=observe`, `VARIABLE_INFLUENCE_MAX_PATTERNS_PER_FIXTURE=20`.

## Persistence
Firebase: `influenceLedgerEntries`, `influenceBuildRuns`. Noop under Prisma (reads empty).

## Surfaced via
Package V5, Readiness V7, Precheck V7 (observe), PostMatch V5, DecisionInputLedger V2,
Backstage `VariableInfluencePanel`. Next block: governance linking decision → alert engine.

## Consumed by Alert Decision Governance (B47)

B47's Alert Decision Governor consumes the InfluenceAggregate (net band, influenceScore,
confidenceOfAssessment, blockers, waits, live-confirmation, conflicts) together with
Readiness V7 and Precheck V7 to decide allow/monitor/wait/block/stay-out — in shadow by
default (never blocks a real alert). influenceScore remains an internal weight, never a
probability. See `ALERT_DECISION_GOVERNANCE.md`.

## Calibration suggested by Causal Learning (B48)

B48 may emit `VariableInfluenceCalibrationSuggestion`s when influence was repeatedly
over/underestimated for a pattern family. These are human-review-only proposals
(`autoApplyAllowed=false`) and DO NOT change the deterministic rule-engine weights at
runtime. See `VARIABLE_INFLUENCE_CALIBRATION.md`.
