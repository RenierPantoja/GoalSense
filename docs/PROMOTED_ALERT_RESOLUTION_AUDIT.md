# Promoted Alert Resolution + Auto Opportunity Outcome Loop — Audit (Phase B23)

Read-only audit before touching the resolver. Locks the real resolution lifecycle so
manually-promoted alerts (B22) can be resolved honestly, fed back to their opportunity,
and shown in Alertas 2.0 — without polluting real pattern performance, without Telegram,
without odds, without auto-alerts.

## How alerts resolve today
`workers/alertResolution.worker.ts` (gated by `RESOLUTION_WORKER_ENABLED`) calls
`resolvePendingAlerts(max)` in `modules/command/alertResolution.service.ts` on an interval.

`resolvePendingAlerts`:
1. `repos.alerts.listPending('default', max)` → pending alerts.
2. For each: guard via `repos.alertResolutions.findByAlertId` (skip if already resolved).
3. `resolveSingleAlert(alert)`:
   - `inferResolutionType` from `evidenceJson.patternName` keywords (gol/escanteio/cartão/…)
     → `goal_pressure | corner_pressure | card_heat | …`; `getResolutionWindow` (8–15 min).
   - `repos.liveSnapshots.findAfter(fixtureId, createdAt, 50)` → post-trigger snapshots.
   - `analyzeSnapshotsInWindow` counts goals/corners/cards from the **latest** snapshot's
     events (avoids double counting), `hasTimedEvents`, `hasStats`, `matchFinished`,
     `inShootout`, `scoreDelta`. Returns `null` when too early + no data (→ skip).
   - Type-specific resolver returns `{ outcome, resolutionType, reason, windowMinutes, evidence }`.
     `outcome ∈ confirmed | confirmed_partial | failed | unknown | expired`.
     **Honest rules already present**: shootout ≠ goal; no events + no stats ⇒ `unknown`
     (never `failed`); score delta with no timed events ⇒ `confirmed_partial`.
4. `repos.alertResolutions.resolveAlert(alertId, outcome, {...})` — atomic status + resolution.
5. `repos.performance.applyResolutionToCounters({ alertId, patternId, … })` — increments the
   **pattern counter** (idempotent, non-blocking).
6. `recordAlertResolved(ctx)` (intelligence memory): writes `AlertOutcomeRecord` (`out_${alertId}`),
   patches ledger `led_${alertId}` → `signalStatus:'resolved'`, failure analysis if `failed`,
   and a `LearningEvent` (`learningTypeForResult`).

## What a promoted alert (B22) looks like
`repos.alerts.create({ patternId:'auto_engine_manual', status:'pending', signalState:'ready_to_alert',
evidenceJson, duplicateSignature:'auto_opportunity_<oppId>' }, 'default')`. The
`evidenceJson` carries `{ source:'auto_opportunity_manual', patternName:'Motor Automático — <tipo>',
provenance:{ opportunityId, autoEngineRunId, opportunityType, originalScore, originalConfidenceBand,
riskGateSnapshot, … }, telegramEligible:false, oddsEligible:false }`. A ledger entry
`led_${alertId}` exists (`patternId:null`, `radarName:'Motor Automático — <tipo>'`). A
`ManualPromotedAlertLink` (`mpa_${opportunityId}`) links opportunity↔alert.

## Problem (today, if the resolver ran on promoted alerts)
- `inferResolutionType('Motor Automático — Pressão de escanteios')` matches "escanteio" →
  `corner_pressure` (good), but "Jogo quente — cartões" does **not** match `cartão` → falls to
  `custom_unknown` (goal-like fallback). Type inference is not opportunity-type aware.
- `applyResolutionToCounters` would create a counter keyed by the sentinel `auto_engine_manual`
  → **pollutes** a (fake) pattern counter. Must be skipped for promoted alerts.
- Outcome would be a generic `alert_*` learning event; no opportunity feedback loop, no
  outcome link, no opportunity outcome summary, no auto-engine surfacing.

## B23 decision (minimal, safe, reversible)
- **Detect** a promoted alert by `patternId === 'auto_engine_manual'` OR
  `evidenceJson.source === 'auto_opportunity_manual'`.
- In `resolvePendingAlerts`, branch BEFORE the generic persistence:
  - If promoted **and** `ENABLE_PROMOTED_ALERT_RESOLUTION !== 'true'` → **skip** (stays
    `pending` — honest). Counted as skipped.
  - Else run `resolveSingleAlert` for the snapshot **evidence only**, then delegate to
    `promotedAlertResolution.service.recordPromotedAlertResolved(alert, resolution.evidence, window)`.
    This **re-maps** the outcome conservatively by `opportunityType` (from provenance),
    persists via `resolveAlert`, updates the ledger with B23 outcome fields, creates a
    `PromotedAlertOutcomeLink`, upserts an `AutoOpportunityOutcomeSummary`, records a
    `promoted_alert_resolved` opportunity action (updates user-state), and emits an
    observational `LearningEvent` (`source:'promoted_alert_resolution'`).
  - **No `applyResolutionToCounters`** for promoted alerts. **No Telegram.** **No odds.**
- Generic alerts keep the exact existing path (no behavior change).

## Conservative outcome mapping by opportunity type (pure util)
Uses only the real snapshot analysis (`goalsInWindow`, `cornersInWindow`, `cardsInWindow`,
`hasTimedEvents`, `hasStats`, `snapshotsAnalyzed`). Never invents events; missing data ⇒ `unknown`.
- **goal-like** (`late_goal_pressure`, `first_half_goal_pressure`, `comeback_pressure`,
  `dominant_home_pressure`, `dominant_away_pressure`): goal+events ⇒ `confirmed`; goal by score
  delta only ⇒ `confirmed_partial`; no data ⇒ `unknown` (limited); data + no goal ⇒ `failed`.
- **corners_pressure**: corner+events ⇒ `confirmed`; no corner data (no timed events) ⇒
  `unknown` (limited, never `failed`); events present but 0 corners ⇒ `unknown` (can't assume
  provider tracks corners) — conservative, never `failed`.
- **cards_pressure**: same shape as corners (cards+events ⇒ `confirmed`; otherwise `unknown`).
- **pattern_similarity** / **unknown**: goal by events/score ⇒ `confirmed_partial`; else `unknown`.
- Any type with `snapshotsAnalyzed === 0` ⇒ `unknown` (limited). `expired` is preserved as
  `unknown` for promoted alerts (we never force `failed` from expiry without data).

## New persistence
- `PromotedAlertOutcomeLink` (`autoPromotedAlertOutcomeLinks`, id `pol_${alertId}`):
  opportunityId, promotedAlertId, ledgerId, outcomeId, result, resolutionType, outcomeReason,
  dataQualityAtResolution, resolvedAt, source `promoted_alert_resolution`.
- `AutoOpportunityOutcomeSummary` (`autoOpportunityOutcomeSummaries`, id `oos_${opportunityId}`):
  opportunityId, promotedAlertId, result, resultLabel, outcomeReason, confirmedAt, failedAt,
  unknownReason, timeToResolutionMinutes, learningEventIds, updatedAt.
- Repo methods (Firebase real, Noop empty/no-throw): create/get-by-alert/get-by-opportunity/
  update outcome link; upsert/get/list opportunity outcome summary.

## Type/labels additions
- `LearningEventType` += `auto_opportunity_promoted_alert_{confirmed|partial|failed|unknown|resolution_limited}`.
- `LearningEvent.source` += `'promoted_alert_resolution'`.
- `SignalLedgerEntry` += optional `outcomeResult`, `outcomeReason`, `resolutionSource`, `resolvedAt`,
  `dataQualityAtResolution`, `missingDataAtResolution` (optional → existing code unaffected).
- `AutoOpportunityActionType` += `promoted_alert_resolved`. `AutoOpportunityUserState` /
  `AutoOpportunityActionSummary` += `promotedAlertOutcome`, `promotedAlertResolvedAt` (folded from
  the `promoted_alert_resolved` action metadata in the existing pure reducer).

## Routes (query)
- `GET /api/intelligence/auto-engine/opportunities/:id/outcome-summary`
- `GET /api/intelligence/auto-engine/promoted-alerts/:alertId/outcome-link`
- `GET /api/intelligence/auto-engine/promoted-alerts` (list links + outcomes)
- `POST /api/intelligence/auto-engine/promoted-alerts/:alertId/resolve-now` — env-gated by
  `ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE=true` (403 when off). Reuses the same safe service path.

## Invariants preserved (verified against the code above)
No Telegram (resolver never calls Telegram). No odds (none in the path). No auto-alert (this
phase only resolves alerts the user already created). `unknown`/`expired` never coerced to
`failed`. Real pattern counters untouched (we skip `applyResolutionToCounters`). Opportunity
`score`/`confidenceBand` never recomputed — outcome is a **separate layer**. B12–B22 paths
unchanged for non-promoted alerts. Firebase persists; Noop (Prisma fallback) accepts writes /
returns empty without throwing.

## Out of scope (deferred)
Source-aware aggregation into learning profiles; Telegram for promoted alerts; automatic
Auto→Alerts policy; exact resolution-minute tracking; multi-user.
