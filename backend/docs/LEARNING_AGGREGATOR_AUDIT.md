# Learning Aggregator — Audit (Phase B13)

Read-only audit of the B12 memory before building the aggregator. No invented
data; everything below reflects what the B12 records actually contain.

## 1. B12 flow recap

- **Ledger entry** (`signalLedger/led_${alertId}`) is written at alert creation
  by `recordAlertCreated()` (`intelligenceMemory.service.ts`). It carries the
  full signal context: `patternId`, `radarName`, `leagueName` (= competition),
  `homeTeam`, `awayTeam`, `minute`, `scoreState`, `signalType`,
  `confidenceAtSignal`, `severity`, `evidence` (with `providerQuality`,
  `missingData`, passed/failed conditions), `scopeDecision`, `matchContext`
  (`competitionType`/`stage`/`isKnockout`/`importance`/`importanceLabel`) and a
  `dataAvailability` map. `signalStatus` starts `alerted`.
- **Outcome** (`alertOutcomes/out_${alertId}`) is written at resolution by
  `recordAlertResolved()`: `result` (`confirmed | confirmed_partial | failed |
  unknown | expired | pending`), `resolutionType`, `timeToResolutionMinutes`,
  `dataQualityAtResolution`, `whatConfirmed/whatFailed/missingForConfirmation`.
  The ledger entry is also transitioned to `signalStatus: resolved`.
- **Failure analysis** (`signalFailures/fail_${alertId}`) is written only when
  `result === 'failed'`, with a deterministic `failureReason`.
- **Learning events** (`learningEvents/{id}`) are appended (observations only).

## 2. Data available for aggregation (today)

| Dimension | Source field | Notes |
|-----------|--------------|-------|
| pattern | `ledger.patternId` / `radarName` | reliable |
| competition | `ledger.leagueName` | free-text; normalize tolerantly |
| teams (home/away) | `ledger.homeTeam` / `awayTeam` | reliable; side is known |
| minute window | `ledger.minute` | null → `unknown` bucket |
| score state | `ledger.scoreState` | reliable |
| competition type/stage/importance | `ledger.matchContext.*` | heuristic (source = heuristic) |
| data quality | `ledger.evidence.providerQuality` + `outcome.dataQualityAtResolution` | partial coverage |
| provider | `ledger.dataAvailability.liveScore.source` | usually `espn` |
| outcome | `outcome.result` (join by `alertId`) | confirmed/partial/failed/unknown/expired/pending |
| time to confirmation | `outcome.timeToResolutionMinutes` | wall-clock minutes |
| failure reason | `failure.failureReason` (failed only) | deterministic |

The join key is **`alertId`** (ledger ↔ outcome ↔ failure).

## 3. Still unavailable (record as unknown / do not infer)

- Pre-match form, H2H, standings, lineups, injuries, xG, odds — all marked
  `unavailable` in the B12 `dataAvailability` map; **not** aggregated.
- Exact resolution minute (`outcome.resolutionMinute` is `null`).
- Resolution-time momentum (recorded as `null`).

## 4. Repository queries: have vs need

**Have:** `getSignalLedgerEntryByAlertId`, `listSignalLedgerEntries({patternId|fixtureId})`,
`getAlertOutcomeByAlertId`, `listAlertOutcomesByPattern`, `listLearningEventsByPattern`,
`createLearningEvent`, `getOverview`.

**Need (added in B13):**
- `listAllSignalLedgerEntries(limit)`, `listAllAlertOutcomes(limit)`,
  `listAllFailureAnalyses(limit)` — to aggregate across the whole dataset.
- Profile persistence: `upsert*/get*/list*` for Pattern / Competition / Team
  profiles, `upsert/listSignalContextStats`, `create/listLearningRecommendation`,
  `create/updateLearningAggregationRun`.

## 5. Risks of false learning & mitigations

| Risk | Mitigation |
|------|------------|
| Concluding from tiny samples | `sampleQuality` gate (`insufficient/low/moderate/strong`); recommendations downgraded to "indício inicial" below thresholds. |
| Counting `unknown` as failure | `failedRate` numerator = failed only; `unknownRate` explicit; `expired` grouped with unknown (no-data). |
| Hiding partial usefulness | `usefulRate` = confirmed + confirmed_partial; `confirmed_partial` kept separate in the distribution. |
| Penalizing patterns for provider gaps | high `unknownRate` emits a `data_quality_warning`/`high_unknown_rate`, not a pattern failure. |
| Pending alerts skewing rates | rates computed over `resolved` only; `pending` tracked separately. |
| Ranking on heuristic competition | profiles tag `source: heuristic` for competition context. |

## 6. Safe aggregation plan

1. Load all ledger entries + outcomes (+ failures) with caps.
2. Build `outcomeByAlertId` and join each ledger entry to its outcome (or `pending`).
3. Fold each joined record into context buckets via deterministic context keys.
4. Compute `OutcomeDistribution` + rates + `sampleQuality` per bucket.
5. Materialize Pattern / Competition / Team / context-stats profiles; upsert.
6. Generate conservative recommendations + dedup learning events.
7. Write a `LearningAggregationRun` summary. Everything deterministic, no ML.
