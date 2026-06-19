# Auto Opportunity Actions + Promotion — Audit (Phase B21)

Read-only audit before implementing. Locks the real B19/B20 contracts and the
pattern-creation flow so actions/feedback/promotion never auto-create anything.

## Backend (real paths — prompt paths differ)
- Routes: `backend/src/modules/intelligence/autoEngine.routes.ts` (NOT `src/routes/`).
- Types: `backend/src/modules/intelligence/autoEngine/autoEngine.types.ts`.
- Service: `…/autoEngine/autoEngine.service.ts` (`runAutoEngineScan`, `getAutoEngineOverview`, flag helpers).
- Scanner/scoring/riskgate/explain: `…/autoEngine/*.service.ts`.
- Repo contract: `backend/src/repositories/contracts.ts` → `IntelligenceRepository` (already has B19 AutoEngine methods).
- Firebase adapter: `backend/src/repositories/firebase/firebaseIntelligence.repository.ts` (collections `autoEngineRuns`, `autoOpportunities`; deterministic ids, merge writes, single-equality query + in-memory sort; helpers `docData`, `byCreatedAtDesc`, `READ_CAP=2000`, `getFirestore`).
- Noop adapter: `backend/src/repositories/noopIntelligence.repository.ts` (reads empty, writes return record, `warnOnce`).
- Env: `backend/src/env.ts` (B19 flags present; all OFF by default).
- Learning event type: `…/contracts/intelligence.types.ts` → `LearningEvent` + `LearningEventType` (NO `source` field yet). B13 aggregation derives rates from outcomes/ledger, NOT from learning-event types, so adding event types + an optional `source` is additive and safe (feedback never becomes a statistical truth).
- `apiResponse.ts`: `ok(data)`, `badRequest(msg, details?)`, `notFound(msg?)`.

### AutoOpportunity shape (consumed by promotion mapping)
`fixtureId, fixtureLabel, leagueName, homeTeam, awayTeam, minute, scoreState{home,away},
opportunityType, status, score, confidenceBand, scoreBreakdown, evidence{liveStatsUsed,
recentOffensiveEvents, passedSignals[], missingData[], dataQuality, provider}, contextFit
{competitionType, importanceLabel, minuteWindow, sampleQuality, source, notes[]}, riskGate,
relatedPatternIds[], dataAvailability, explanation`.

### Fixture lookup
`repos.fixtures.findById(id)` + `repos.liveSnapshots.findLatestByFixture(id)` exist. The
opportunity's `fixtureId` is the **backend** fixture id (canonical), which does NOT match
the frontend `LiveFixture.id` (ESPN numeric). So a new read-only endpoint returns fixture
context; the frontend resolves "open match" best-effort by **team-name match** against the
current live `fixtures` list (honest fallback when unresolved).

## Frontend pattern-creation flow (must reuse, never auto-save)
- `CommandCenterPage.tsx`: `prefilledDraft: Pattern | null` + `setPrefilledDraft`, `setActiveTab`, `setShowBuilder`. The existing Match-Detail prefill effect does exactly `setPrefilledDraft(draft); setActiveTab('patterns'); setShowBuilder(true)` — reuse this for promotion.
- `PatternsView.tsx`: copies `prefilledDraft` → `editingPattern` → `<CustomPatternModal initial=…>`. `handleCustomSave` treats synthetic `id:'draft'` as a NEW pattern (createPatternWT). Closing clears the draft WITHOUT persisting.
- `CustomPatternModal.tsx`: persists ONLY on explicit `savePaused()`/`activate()` (or Cmd/Ctrl+S). Opening with `initial` never writes. `readiness`/capability matrix still gates save/activate.
- `createPatternWT` only runs from an explicit user save. Confirmed: no auto-create path.
- `Pattern` / `PatternCondition` shapes + `TRIGGER_LIBRARY` defaultParams + `radarConditionCapabilities` (supported/partial/unsupported) define which condition types a promotion may suggest. Prefer SUPPORTED types; flag PARTIAL/unsupported.

## Mapping opportunityType → suggested conditions (only real evidence)
- always `is_live`.
- late_goal_pressure → `is_final_phase` + `score_diff_lte{maxDiff}` (+ `shots_on_target_gte` if SOT present).
- first_half_goal_pressure → `minute_between{25,45}` + `score_diff_lte{1}`.
- corners_pressure → `corners_gte{value=totalCorners||7}` (PARTIAL coverage — flagged).
- cards_pressure → `cards_gte{value=totalCards||4}` (PARTIAL — flagged).
- dominant_home_pressure → `home_possession_gte` + `home_shots_on_target_gte`.
- dominant_away_pressure → `away_possession_gte` + `away_shots_on_target_gte`.
- pattern_similarity/comeback/unknown → only eligibility derivable → limitation "evidência insuficiente para gerar radar".

## Hard rules (unchanged)
No alert created, no Telegram, no odds, no bet/stake. Feedback is observational
(`source=user_feedback`) and NEVER auto-tunes the engine or alters a pattern/score.
Promotion is a PROPOSAL — radar is never saved/activated without explicit user action.
`unknown` ≠ `failed`. Opportunity ≠ alert. Firebase persists; Prisma→Noop safe.

## New persistence (Firestore collections)
`autoOpportunityActions` (append-only log), `autoOpportunityUserStates` (deterministic
`aus_${opportunityId}` for fast list badges), `autoOpportunityPromotionPlans` (deterministic
`apl_${opportunityId}`).

## Out of scope (deferred)
Auto → Alerts wiring, route auth (documented), structured league-tier scope.
