# Alert Decision Flow — Reality Map (B47 / Bloco 4)

Audit of every place an alert is born BEFORE wiring governance. Rule: shadow/observe by
default, never break an existing alert, never block in observe.

## Where an alert is born today

| Flow | File | Creates | Source class |
|---|---|---|---|
| Command pattern worker | `modules/command/commandEvaluation.service.ts` (`repos.alerts.create` + `recordAlertCreated`) | real alert (`pat_…`) | `command_pattern` |
| Manual alert API | `modules/alerts/alerts.service.ts` (`createAlert`) | real alert | `command_pattern` |
| Auto opportunity → manual alert | `autoEngine/autoOpportunityAlertPromotion.service.ts` (`promoteOpportunityToManualAlert`) | monitored alert (sentinel `auto_engine_manual`) | `promoted_opportunity` |
| Auto Alert Policy auto-create | `autoEngine/autoOpportunityAlertPromotion.service.ts` (auto path) + `autoAlertPolicy` | monitored alert (gated, shadow by default) | `auto_engine_opportunity` |
| Auto Engine opportunities | `autoEngine/autoEngine.service.ts` (`upsertAutoOpportunity`) | opportunity (NOT alert) | `auto_engine_opportunity` |

## Where Precheck V7 is called today
- Only on-demand via `/api/match-intelligence/fixtures/:id/precheck-v7` (read-only). It is
  NOT consulted by any alert-creation flow yet → that is exactly the gap B47 closes in shadow.

## Where governance enters (shadow)
- After command alert create (`.then(createdAlert => …)`) — non-fatal shadow record.
- Inside `promoteOpportunityToManualAlert` — evaluate before create, record override if the
  human insists against a wait/block/stay_out decision.
- After Auto Engine opportunity upsert — advisory only.

## Where enforce could enter in the future
- Same three points, gated by `ENABLE_ALERT_GOVERNANCE_ENFORCE=true` + `ALERT_GOVERNANCE_MODE=enforce`,
  and only for critical, unambiguous blockers. OFF by default in this block.

## Alerts that must NOT break
- All existing real pattern alerts (command worker) and their counters/ledger/outcomes.
- Manual promotions (human responsibility preserved).
- Auto Alert Policy shadow-mode behavior (already shadow).

## Decisions that must be audited
- Every governance evaluation (shadow or enforce), every hold create/resolve/expire, every
  live re-evaluation, every assumption invalidation, every human override of a wait/block.

## Live events that require re-evaluation
- lineup_confirmed / lineup_changed, red_card, goal, substitution, injury_event, half_time,
  minute thresholds (60/70/80), match_status_changed, domain_refreshed, manual_record_created,
  mapping_confirmed, post_match_completed.

## New data that can change a decision
- Confirmed lineup (vs probable), unlocked critical domain, fresh manual record, confirmed
  mapping, live shock (red card / late goal / key sub).

## Risks
- **Blocking a valid alert**: mitigated by observe default + ultra-conservative enforce +
  non-fatal calls (failure → old flow).
- **Alerting without base**: mitigated by shadow recording `wouldHaveBlocked`/`wouldHaveWaited`
  so the operator sees the judgement even when nothing is enforced.

## Conclusion
Build a single Alert Decision Governor (consuming Package V5 / Readiness V7 / Precheck V7 /
InfluenceAggregate / DecisionInputLedger), a Governance Policy, Holds/Watchlist, Live
Re-evaluation and Assumption Invalidation, all observe-first, auditable, non-fatal, with
holds that expire and live rechecks that never send a real alert.
