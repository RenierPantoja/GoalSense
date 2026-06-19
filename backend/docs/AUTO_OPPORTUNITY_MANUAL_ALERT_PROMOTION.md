# Auto Opportunity → Manual Alert Promotion (Phase B22)

Transforms a **strong** or **watch** automatic opportunity into a **monitored alert**
by **explicit human confirmation only**. No automatic alert, no Telegram, no odds, no bet.
The promoted alert flows through the existing Signal Ledger / Alertas 2.0 cycle so it can
be tracked and (optionally) resolved like any other signal — but it never pollutes real
pattern counters or learning profiles.

## Inviolable principles (re-stated for this phase)
- **No automatic alert.** An alert is created only after the user clicks and acknowledges.
- **No Telegram, no odds, no bet/stake.** `ENABLE_PROMOTED_ALERT_TELEGRAM=false` and not implemented.
- **Score is signal-quality, not probability.** Surfaced verbatim in the UI and acks.
- **`unknown`/`not_evaluable` is never `failed`.** Promoted alerts use the honest resolution cycle.
- **Real patterns are never touched.** Sentinel patternId, no performance counter, ledger `patternId = null`.

## Environment flags (`backend/src/env.ts`)
| Flag | Default | Effect |
|------|---------|--------|
| `ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION` | `false` | Gates the **POST** promote endpoint. When off → `403`. Preview (GET) stays open. |
| `ENABLE_PROMOTED_ALERT_RESOLUTION` | `true` | Governance flag: promoted alerts may be resolved by the normal honest cycle. (Resolver not modified this phase.) |
| `ENABLE_PROMOTED_ALERT_TELEGRAM` | `false` | Reserved; not implemented. Promoted alerts never send Telegram. |
| `ENABLE_AUTO_ENGINE_TO_ALERTS` | `false` | Pre-existing; **not** wired to automatic alert creation. |

## Flow
1. **Preview** — `GET /api/intelligence/auto-engine/opportunities/:id/alert-preview`
   Returns `ManualAlertPromotionPreview`: proposed alert title/reason/severity/confidence,
   evidence, risks, limitations, `canPromote`, `blockedReasons`, and a `duplicateCheck`
   (`alreadyPromoted` + existing `alertId`). Open regardless of the promotion flag.
2. **Promote** — `POST /api/intelligence/auto-engine/opportunities/:id/promote-to-alert`
   - `403` if `ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION` is off.
   - `400` if the body lacks `userConfirmed:true` + all three acknowledgements.
   - Idempotent: a second call returns the existing alert with `duplicate:true`.
3. **Lookup** — `GET /api/intelligence/auto-engine/opportunities/:id/promoted-alert`
   Returns the `ManualPromotedAlertLink` if one exists, else `null` (200).

## Promotion guard (`utils/autoOpportunityAlertPromotion.util.ts`, pure)
`evaluatePromotionGuard(opp)` allows promotion only when **all** hold:
- status is `strong` or `watch` (else `status_not_promotable`);
- `riskGate.allowed === true` (else `risk_gate_blocked`);
- data quality is not `poor`/`unknown` (else `data_quality_insufficient`);
- `score >= 50` (else `score_too_low`);
- not already promoted (else `already_promoted`).

`buildPromotionPreview(opp, link)` is also pure (env-free) so the smoke test can assert it.
`REQUIRED_ACKS` documents the three mandatory acknowledgements.

## What gets written (service `autoOpportunityAlertPromotion.service.ts`)
On a confirmed promotion:
1. **Alert** via `repos.alerts.create({...}, 'default')` with sentinel `patternId = 'auto_engine_manual'`,
   `status:'pending'`, `signalState:'ready_to_alert'`, trigger snapshot from the opportunity,
   and provenance embedded in `evidenceJson` (`source:'auto_opportunity_manual'`, `opportunityId`,
   `autoEngineRunId`, `opportunityType`, `originalScore/Band`, `riskGateSnapshot`, `promotionNote`,
   `promotedAt`, `telegramEligible:false`, `oddsEligible:false`).
   **No `performance.onAlertCreated` call** — counters stay clean.
2. **Signal Ledger entry** via `buildLedgerEntry({ alertId, patternId:null, radarName:'Motor Automático — <tipo>', scopeReason, … })`.
   This is what makes the alert appear in **Alertas 2.0** (server search is built from ledger rows
   that have an `alertId`). Non-blocking: if it fails the alert still stands (documented limitation).
3. **`ManualPromotedAlertLink`** (`mpa_${opportunityId}`) in the `autoPromotedAlertLinks` collection
   — idempotency + frontend "promovida" badge.
4. **Auditable action** `manual_alert_promoted` (carries `alertId`/`ledgerId` in metadata) →
   the action reducer sets `promotedAlertId` on the opportunity's `AutoOpportunityUserState`.
5. **Observational learning event** `auto_opportunity_promoted_to_alert` (`source:'user_action'`,
   `confidence:'low'`, `patternId:null`). A decision record — never statistical truth, never auto-tuning.

## Persistence
- New Firestore collection `autoPromotedAlertLinks` (Firebase repo) + Noop equivalents.
- Repo methods: `createManualPromotedAlertLink`, `getManualPromotedAlertLink`, `listManualPromotedAlertLinks`.
- `AutoOpportunityUserState` gains `promotedAlertId`.

## Provenance & Alertas 2.0 surfacing (no schema change)
The alert/ledger have **no top-level `source` column**. Origin is carried by:
- `radarName = "Motor Automático — <tipo>"` → rendered as the row `patternName` (client badge derives from this prefix);
- `scopeDecision.reason` → rendered in the `AlertSignalDrawer` Resumo ("Escopo: …");
- `evidenceJson.provenance` → full structured record for audit.

## Limitations (honest)
- All gated; nothing promotes without `ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION=true` **and** human confirmation.
- Promoted alerts use a sentinel patternId and `patternId:null` ledger — intentionally **not** part of any radar's profile.
- If the ledger write fails, the alert exists but won't appear in Alertas 2.0 until re-derived.
- No Telegram, no odds, no automatic resolution gating by source (deferred).
- No auth layer on routes (future phase, consistent with B19–B21).

## Verification
- `cd backend; npm run typecheck; npm run build` ✓
- `node scripts/smokeAutoEngine.mjs` — B22 assertions (guard allow/block, preview shape,
  ack requirement, idempotency contract) pass; exit 0.

---

## B23 — the promoted alert now resolves (extension)

The B22 limitation ("`ENABLE_PROMOTED_ALERT_RESOLUTION` exists as governance but the resolver
is not modified") is closed in B23. A promoted alert is detected by the sentinel patternId /
evidence source and resolved through the existing honest cycle by a dedicated path that:
skips real pattern counters, conservatively maps the outcome by opportunity type, updates the
Signal Ledger + a `PromotedAlertOutcomeLink`, feeds an `AutoOpportunityOutcomeSummary` back to
the opportunity (as a separate layer — never the score), and emits an observational
`source:'promoted_alert_resolution'` learning event. Still no Telegram, no odds, no auto-alert.
Full detail: [`PROMOTED_ALERT_RESOLUTION.md`](./PROMOTED_ALERT_RESOLUTION.md).
