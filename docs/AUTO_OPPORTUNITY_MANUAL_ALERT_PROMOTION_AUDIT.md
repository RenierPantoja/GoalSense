# Auto Opportunity → Manual Alert Promotion — Audit (Phase B22)

Read-only audit before building. Locks the real alert-creation + Signal Ledger +
resolution model so manual promotion is safe, auditable, and human-confirmed only.

## How alerts are created today (`modules/command/commandEvaluation.service.ts`)
`repos.alerts.create({ patternId, fixtureId, status:'pending', confidence, signalState,
triggerMinute, triggerScoreHome/Away, evidenceJson, temporalEvidenceJson, duplicateSignature },
userId)` → returns the created alert with `.id` (auto-generated). The Alert has **no
top-level `source` column**; origin lives inside `evidenceJson` (the worker writes
`source: 'backend_worker'`). After creation it (a) increments a performance counter via
`repos.performance.onAlertCreated` (keyed by patternId) and (b) calls the non-blocking
`recordAlertCreated(ctx)` to build the Signal Ledger entry + an `alert_created` learning event.

`firebaseAlert.repository.create` stores `patternId` as-is (any string), `status` default
`pending`, `evidenceJson` default `'[]'`. So a sentinel patternId is accepted.

## Signal Ledger (`memory/signalLedger.service.ts` + `intelligenceMemory.service.ts`)
`buildLedgerEntry(input)` is a PURE constructor → `SignalLedgerEntry` with deterministic
id `led_${alertId}` (when alertId present), `signalStatus:'alerted'`, `radarName`,
`signalType`, `scopeDecision:{reason}`, `matchContext`, `evidence`, `dataAvailability`.
**Alertas 2.0 server search is built entirely from SignalLedger entries** (rows without
`alertId` are skipped). So a promoted alert that writes a ledger entry with an `alertId`
appears automatically in the Alertas list and drawer.

`SignalLedgerEntry` has NO `source`/`provenance` field. Provenance carriers that are
already rendered: `radarName` (row patternName), `scopeDecision.reason` (drawer Resumo
"Escopo: …"), `signalType`, `evidence.scopeReason`. → We surface origin via
`radarName = "Motor Automático — <tipo>"` + a `scopeDecision.reason` marker, and a
client-side badge in `ServerAlertList` (no schema change).

## Resolution (`alertResolution` worker + `recordAlertResolved`)
Resolution estimates outcome from post-trigger snapshots (pattern-agnostic) and writes an
`AlertOutcomeRecord` + transitions the ledger to `resolved`. `unknown`/`expired` are never
counted as failure. Promoted alerts (status `pending`) participate in the normal honest
cycle; `ENABLE_PROMOTED_ALERT_RESOLUTION` is added as a governance flag (the resolver is
NOT modified in this phase — documented).

## Frontend (Alertas 2.0)
`ServerAlertList` is the primary Sinais view when a backend is configured. Rows map
`AlertSearchItem` (patternName, minute, score, confidence, dataQuality, result,
summaryReason, limitations…). Origin badge → derive from `patternName.startsWith('Motor
Automático')`. `AlertSignalDrawer` Resumo already renders `ledger.scopeDecision.reason`.
`backend toSearchItem` hardcodes `source:'ledger'` — we will NOT change the search shape;
the badge is purely client-derived.

## Decisions (safety)
- **No automatic alert.** POST promote requires `ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION=true`
  AND explicit human confirmation (`userConfirmed` + 3 acknowledgements). GET preview is open.
- **Sentinel patternId** `auto_engine_manual` (never a real `pat_…`) → real patterns'
  counters/profiles are NOT polluted. **No `performance.onAlertCreated` call** for promoted
  alerts. The ledger `patternId` is `null` (honest — not from a configured radar).
- **Provenance** is stored in the alert `evidenceJson` (`source:'auto_opportunity_manual'`,
  opportunityId, autoEngineRunId, opportunityType, originalScore/Band, riskGate snapshot,
  promotionNote, promotedAt) and mirrored in `scopeDecision.reason`.
- **Idempotency** via a `ManualPromotedAlertLink` (deterministic `mpa_${opportunityId}`):
  a second promote returns the existing alert with `duplicate:true`.
- **canPromote** only for `strong`/`watch` opportunities with `riskGate.allowed`, data
  quality not poor/unknown, and score ≥ 50. `blocked`/`candidate`/`ignored` → not promotable.
- **No Telegram, no odds, no bet.** `ENABLE_PROMOTED_ALERT_TELEGRAM=false` and not implemented.
- **Ledger failure is non-blocking** (alert still created + linked); documented limitation
  (it would then not appear in Alertas 2.0 until re-derived).

## New persistence
`autoPromotedAlertLinks` (Firestore) + repo methods `createManualPromotedAlertLink`,
`getManualPromotedAlertLink`, `listManualPromotedAlertLinks`. `AutoOpportunityUserState`
gains `promotedAlertId`. New action type `manual_alert_promoted`; new LearningEventType
`auto_opportunity_promoted_to_alert` (source `user_action`).

## Out of scope (deferred)
Automatic Auto → Alerts policy, Telegram for promoted alerts, source-aware resolution
gating, structured patternId taxonomy for auto alerts.
