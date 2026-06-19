# Auto Opportunity Actions + Promotion — Backend (Phase B21)

Human interaction with auto opportunities: save / dismiss / feedback / notes, plus
a radar **promotion proposal**. Auditable and observational. **Never** creates an
alert, sends Telegram, uses odds, places a bet, alters a pattern, or changes a score.
Feedback is `source=user_feedback` and is **never** counted as statistical truth.

## Contracts (`autoEngine/autoEngine.types.ts`)
- `AutoOpportunityAction` (append-only log) — `actionType`, optional `feedbackType`,
  `note`, `reason`, `metadata`, `createdAt`.
- `AutoOpportunityActionType`: saved · unsaved · dismissed · restored · marked_useful ·
  marked_not_useful · feedback_recorded · note_added · note_removed ·
  radar_proposal_created · opened_in_backtest · opened_related_alerts · opened_fixture ·
  ignored_for_now.
- `AutoOpportunityFeedbackType`: useful · not_useful · too_early · too_late · data_poor ·
  context_wrong · already_seen · interesting_but_weak · strong_signal · irrelevant · unknown.
- `AutoOpportunityUserState` (deterministic `aus_${oppId}`) — fast list badges.
- `AutoOpportunityActionSummary` — derived from the log (`summarizeActions`, PURE).
- `AutoOpportunityPromotionPlan` (deterministic `apl_${oppId}`) — suggested name /
  description / scope / eligibility + signal conditions / action / confidence /
  sourceEvidence / limitations / `sufficient`.
- `AutoOpportunityFixtureContext` — read-only fixture lookup result.

## Services
- `autoOpportunityActions.service.ts` — `createOpportunityAction`, `recordFeedback`,
  `addNote`, `getActionSummary`, `listActions`, `searchAutoOpportunities`, `getFixtureContext`.
  Each mutation appends an action, recomputes the user-state, and (for save/dismiss/
  useful/not_useful/radar_proposal_created) writes an observational `LearningEvent`
  with `source=user_feedback`. Errors are honest (404 when the opportunity is missing).
- `utils/autoOpportunityActions.util.ts` — PURE `summarizeActions` (last-write-wins for
  toggles), `userStateFromSummary`, `FEEDBACK_TO_ACTION`. Env-free (smoke-tested).
- `autoOpportunityPromotion.service.ts` + `utils/autoOpportunityPromotion.util.ts` —
  PURE `buildPromotionPlan(opp)` maps REAL evidence → editable radar conditions, never
  invents a condition. `sufficient:false` (+ "evidência insuficiente" limitation) when
  nothing beyond `is_live` is derivable. Heuristic context / insufficient sample are flagged.

### Promotion mapping (only supported/partial condition types)
late_goal_pressure → is_final_phase + score_diff_lte (+ shots_on_target_gte if SOT) ·
first_half_goal_pressure → minute_between{25,45} + score_diff_lte · corners_pressure →
corners_gte (PARTIAL) · cards_pressure → cards_gte (PARTIAL) · dominant_home/away →
home/away_possession_gte + home/away_shots_on_target_gte · others → eligibility only
(insufficient).

## Repository (Firebase + Noop)
`IntelligenceRepository` extended: `createAutoOpportunityAction`,
`listAutoOpportunityActions`, `listAutoOpportunityActionsByOpportunity`,
`upsertAutoOpportunityUserState`, `getAutoOpportunityUserState`,
`listAutoOpportunityUserStates`, `createAutoOpportunityPromotionPlan`,
`getAutoOpportunityPromotionPlan`, `listAutoOpportunityPromotionPlans`. Firestore
collections `autoOpportunityActions`, `autoOpportunityUserStates`,
`autoOpportunityPromotionPlans`. Firebase persists; **Prisma → Noop** (reads empty,
writes accepted without persistence). No `DATABASE_URL` needed in Firebase mode.

## API (`autoEngine.routes.ts`, prefix `/api/intelligence/auto-engine`)
- `POST /opportunities/:id/actions` (`{ actionType, feedbackType?, note?, reason?, metadata? }`) — validates actionType/feedbackType; 404 when the opportunity is missing.
- `GET  /opportunities/:id/actions` · `GET /opportunities/:id/action-summary`
- `POST /opportunities/:id/feedback` (`{ feedbackType, note? }`)
- `POST /opportunities/:id/notes` (`{ note }`)
- `POST /opportunities/:id/promotion-plan` → `AutoOpportunityPromotionPlan` · `GET …/promotion-plan`
- `GET  /opportunities/search` → `{ items, total, appliedFilters, unsupportedFilters, userStates }`
  (server-side: status, type, league, team, minScore, confidenceBand, dataQuality,
  blockReason, q, saved, dismissed, feedbackType; `cursor` reported as unsupported —
  offset-cap only at current volume). The original `GET /opportunities` is kept for
  back-compat (returns the array).
- `GET  /fixtures/:fixtureId/context` → `AutoOpportunityFixtureContext` (resolves the
  B20 "open match" limitation; honest empty when not found).

> No auth layer yet — documented as a future phase. Action routes are not gated by
> `ENABLE_AUTO_ENGINE` (they operate on already-recorded opportunities); persistence
> still depends on Firebase mode.

## Learning (observational only)
New `LearningEventType`s: `auto_opportunity_saved`, `auto_opportunity_dismissed`,
`auto_opportunity_marked_useful`, `auto_opportunity_marked_not_useful`,
`auto_opportunity_radar_proposal_created`, plus an optional `source` field on
`LearningEvent`. The B13 aggregator derives rates from outcomes/ledger — NOT from these
event types — so feedback never auto-tunes anything and is never a statistical truth.

## Why no alert
This phase deliberately stops short of `ENABLE_AUTO_ENGINE_TO_ALERTS`. A promotion is a
PROPOSAL; the radar is only created when the user explicitly saves/activates it in the
editor. Auto → Alerts (with human confirmation) is the next phase.

## Smoke (`scripts/smokeAutoEngine.mjs`, pure)
Adds B21 assertions: deterministic promotion id, evidence-only conditions,
`sufficient=false` + honest limitation when thin, heuristic/insufficient flags, the
`summarizeActions` reducer (last-write-wins, notes/feedback folding), and Noop safety.
