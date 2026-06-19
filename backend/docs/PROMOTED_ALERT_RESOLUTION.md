# Promoted Alert Resolution + Auto Opportunity Outcome Loop (Phase B23)

Closes the loop opened in B22: a manually-promoted alert is now resolved through the
**existing honest resolution cycle**, its outcome is written to the Signal Ledger and a
dedicated outcome link, fed back to the originating opportunity as a **separate layer**,
and recorded as an observational learning event. No Telegram, no odds, no auto-alert, and
**no pollution of real pattern performance counters**.

## Lifecycle
```
AutoOpportunity ──(B22 human promote)──▶ monitored alert (pending)
        ▲                                          │
        │                                  resolution worker (B8/B23)
        │                                          │
   outcome summary  ◀── opportunity action ◀── promotedAlertResolution.service
        │                                          │
        └────────── Auto Engine cockpit       Signal Ledger + outcome link + learning event
                                                   │
                                            Alertas 2.0 shows result
```

## Environment flags (`backend/src/env.ts`)
| Flag | Default | Effect |
|------|---------|--------|
| `ENABLE_PROMOTED_ALERT_RESOLUTION` | `true` | When off, promoted alerts stay `pending` (honest) — the resolver skips them. |
| `ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE` | `false` | Gates `POST …/promoted-alerts/:alertId/resolve-now` (403 when off). |
| `ENABLE_PROMOTED_ALERT_TELEGRAM` | `false` | Reserved; never implemented. Promoted alerts never send Telegram. |

## Detection
A promoted alert is detected by `patternId === 'auto_engine_manual'` OR
`evidenceJson.source === 'auto_opportunity_manual'` (`isPromotedAlert`). Its provenance
(`opportunityId`, `opportunityType`) is read from `evidenceJson.provenance` (`readProvenance`).

## Integration (`modules/command/alertResolution.service.ts`)
`resolvePendingAlerts` branches **before** the generic persistence:
- promoted + resolution disabled → `skipped` (stays pending).
- otherwise → `resolveSingleAlert` is reused **only for the snapshot analysis** (goals /
  corners / cards / events / stats / score-delta), then
  `promotedAlertResolution.service.recordPromotedAlertResolved(...)` takes over.
- **`performance.applyResolutionToCounters` is NOT called** for promoted alerts.
- Generic (radar) alerts keep the exact pre-B23 path.

`resolveSinglePromotedAlertNow(alertId)` powers the env-gated resolve-now route.

## Conservative outcome mapping (`utils/promotedAlertResolution.util.ts`, pure)
`mapPromotedOutcome` trusts only the real snapshot analysis; never invents events.
- No post-promotion data (`snapshotsAnalyzed === 0` or no events/stats) ⇒ `unknown` (limited).
- goal-like types: goal+events ⇒ `confirmed`; goal by score delta ⇒ `confirmed_partial`;
  data + no goal ⇒ `failed`.
- `corners_pressure` / `cards_pressure`: event-confirmed ⇒ `confirmed`; otherwise `unknown`
  (we never assume the provider tracks corners/cards) — **never `failed`**.
- `pattern_similarity` / `unknown`: goal ⇒ `confirmed_partial`; else `unknown`.
`unknown`/`expired` are never coerced to `failed`. `confirmed_partial` is partial-useful.

## What gets written (`promotedAlertResolution.service.ts`)
1. **Alert status + resolution** via `repos.alertResolutions.resolveAlert` (status mirrors result).
2. **`AlertOutcomeRecord`** (`out_${alertId}`) with `patternId: null` (so Alertas 2.0 shows the
   result without touching any real pattern's outcome list).
3. **Signal Ledger** patch on `led_${alertId}`: `signalStatus:'resolved'` + optional B23 fields
   (`outcomeResult`, `outcomeReason`, `resolutionSource:'promoted_alert_resolution'`, `resolvedAt`,
   `dataQualityAtResolution`, `missingDataAtResolution`). If the ledger is missing it is
   reconstituted minimally from the opportunity; if neither exists, a `resolution_limited`
   learning event records the limitation.
4. **`PromotedAlertOutcomeLink`** (`pol_${alertId}`, `autoPromotedAlertOutcomeLinks`).
5. **Observational `LearningEvent`** (`source:'promoted_alert_resolution'`, `patternId:null`,
   type by outcome). Never auto-tunes; not counted as statistical truth.
6. **`AutoOpportunityOutcomeSummary`** (`oos_${opportunityId}`) + a `promoted_alert_resolved`
   opportunity action whose metadata folds into the user-state (`promotedAlertOutcome`,
   `promotedAlertResolvedAt`) via the existing pure reducer.

## Persistence (Firebase real, Noop empty/no-throw)
- `autoPromotedAlertOutcomeLinks` + `autoOpportunityOutcomeSummaries`.
- Repo: `createPromotedAlertOutcomeLink`, `getPromotedAlertOutcomeLinkByAlertId`,
  `getPromotedAlertOutcomeLinkByOpportunityId`, `updatePromotedAlertOutcomeLink`,
  `upsertAutoOpportunityOutcomeSummary`, `getAutoOpportunityOutcomeSummary`,
  `listAutoOpportunityOutcomeSummaries`.

## Routes
- `GET …/opportunities/:id/outcome-summary`
- `GET …/promoted-alerts/:alertId/outcome-link`
- `GET …/promoted-alerts` (links joined with outcome; `pending` until resolved)
- `POST …/promoted-alerts/:alertId/resolve-now` — gated by `ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE`
  (403 off; 404 alert not found; 400 with `reason` when not resolvable yet).

## Opportunity score vs promoted-alert outcome
The opportunity `score`/`confidenceBand` is **never** recomputed. The outcome is a strictly
posterior layer: it tells you what happened to the alert you chose to monitor, not whether the
original signal-quality score was "right". Score is signal-quality, not probability.

## `unknown` / missing data handling
Missing post-promotion data ⇒ `unknown` (flagged `limited`), surfaced with the missing fields.
Corners/cards without event data ⇒ `unknown`, never `failed`. `unknown` is never a failure and
never feeds a failure analysis.

## Why no Telegram / odds / auto-alert
This phase only resolves alerts the user already created by hand (B22). It adds no notification
path, no market data, and creates no new alerts. `ENABLE_PROMOTED_ALERT_TELEGRAM` stays off and
is not implemented.

## Limitations (honest, remaining)
- Promoted-alert outcomes are **not** aggregated into learning profiles yet (separate `source`
  reserved for a future aggregator).
- Resolution-minute is not tracked exactly (honest `null`), mirroring the generic resolver.
- `resolve-now` is single-alert and env-gated; the normal cycle is the resolution worker.
- No auth layer on routes (future phase, consistent with B19–B22). Single-user (`default`).

## Verification
- `npm run typecheck` ✓ · `npm run build` ✓
- `node scripts/smokeAutoEngine.mjs` ✓ (B19–B22 intact)
- `node scripts/smokePromotedAlertResolution.mjs` ✓ (B23 mapping, reducer, Noop safety)

---

## B24 — outcomes now feed a separate calibration layer (extension)

The B23 limitation ("promoted-alert outcomes are not aggregated into learning profiles yet") is
addressed in B24. The `AutoOpportunityOutcomeSummary` + `ManualPromotedAlertLink` records produced
here are aggregated into a SEPARATE Auto Engine learning/calibration profile (never blended into
B13 manual-pattern profiles, never fed back into runtime scoring). See
[`AUTO_ENGINE_LEARNING_CALIBRATION.md`](./AUTO_ENGINE_LEARNING_CALIBRATION.md).
