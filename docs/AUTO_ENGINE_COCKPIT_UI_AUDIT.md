# Auto Engine Cockpit UI — Audit (Phase B20)

Read-only audit before building any UI. Goal: lock the **real** B19 contracts and
the Command Center patterns to mirror. No mock, no invented field.

## Backend contracts (real — verified in source)

> Note: the prompt's audit paths differ from the repo. Real locations:
> routes are at `backend/src/modules/intelligence/autoEngine.routes.ts` (not
> `src/routes/`); env is `backend/src/env.ts` (not `src/config/env.ts`).

### Endpoints (`modules/intelligence/autoEngine.routes.ts`, prefix `/api`)
All under `/api/intelligence/auto-engine`. Envelope is `{ success, data }`.
- `GET  /status` → `AutoEngineOverview` (honest `null` on failure, 200).
- `POST /scan` → **gated by `ENABLE_AUTO_ENGINE`**; returns **403** `{ success:false, error:{ message } }` when off; body `{ dryRun?, limit?, persist? }`; returns `AutoEngineRun` (with `.opportunities` stashed on the object).
- `GET  /runs?limit=` → `AutoEngineRun[]`.
- `GET  /runs/:runId` → `AutoEngineRun | null`.
- `GET  /opportunities?status=&type=&limit=` → `AutoOpportunity[]`.
- `GET  /opportunities/:id` → `AutoOpportunity | null`.
- `GET  /fixtures/:fixtureId/opportunities?limit=` → `AutoOpportunity[]`.

Read endpoints never 500 on absence — they return `null`/`[]` with 200.

### `AutoEngineOverview`
`enabled, writeEnabled, schedulerEnabled, toAlertsEnabled, lastRun (AutoEngineRun|null),
opportunitiesTotal, strong, watch, candidate, blocked, topOpportunityTypes [{type,count}],
dataQualityBreakdown (Record<string,number>), blockReasons (Record<string,number>),
limitations (string[]), latestOpportunities (AutoOpportunity[]), generatedAt`.
Config values (`minScore`, `minSampleQuality`, `maxFixtures`, `maxOppsPerFixture`)
are surfaced via `lastRun.config` when a run exists.

### `AutoEngineRun`
`id, startedAt, finishedAt|null, status ('running'|'completed'|'failed'|'skipped'),
enabled, write, config { maxFixtures, minSampleQuality, minScore, maxOppsPerFixture,
write, dryRun }, fixturesScanned, opportunitiesFound, strong, watch, candidate, blocked,
blockReasons (Record<string,number>), notes (string[])`. Scan responses additionally
carry `opportunities?: AutoOpportunity[]` (ranked, not persisted unless write).

### `AutoOpportunity`
`id, runId, fixtureId, fixtureLabel, leagueName, homeTeam, awayTeam, minute|null,
scoreState {home,away}, opportunityType, status ('candidate'|'watch'|'strong'|'blocked'|'ignored'),
score (0..100), confidenceBand ('low'|'medium'|'high'|'insufficient_data'),
scoreBreakdown (AutoSignalScore), evidence (AutoSignalEvidence), contextFit (AutoSignalContextFit),
riskGate (AutoSignalRiskGateResult), relatedPatternIds[], learningProfileRefs[],
dataAvailability (Record<string,boolean>), explanation (AutoSignalExplanation), createdAt, updatedAt`.

- `AutoSignalScore`: baseScore, liveContextScore, patternLearningScore, competitionScore, teamContextScore, minuteWindowScore, dataQualityScore, riskPenalty, finalScore, scoringNotes[].
- `AutoSignalEvidence`: liveStatsUsed (Record<string,number>|null), minute, scoreState, recentOffensiveEvents, passedSignals[], missingData[], dataQuality, provider.
- `AutoSignalContextFit`: competitionType|null, importanceLabel|null, minuteWindow, matchedLearningContexts[], sampleQuality, source ('observed'|'heuristic'|'limited'), notes[].
- `AutoSignalRiskGateResult`: allowed, blockReasons[], penalties[{reason,amount}], warnings[], finalDecision ('allow'|'reduce'|'block').
- `AutoSignalExplanation`: headline, whyNow[], evidenceUsed[], historicalContext[], risks[], relatedPatternNote|null.

`OpportunityType`: late_goal_pressure | first_half_goal_pressure | corners_pressure |
cards_pressure | comeback_pressure | dominant_home_pressure | dominant_away_pressure |
pattern_similarity | unknown.

### Flags (`env.ts`, all OFF by default)
`ENABLE_AUTO_ENGINE`, `ENABLE_AUTO_ENGINE_WRITE`, `ENABLE_AUTO_ENGINE_SCHEDULER`,
`ENABLE_AUTO_ENGINE_TO_ALERTS` (reserved, NOT wired), `AUTO_ENGINE_INTERVAL_MS`,
`AUTO_ENGINE_MAX_FIXTURES_PER_RUN`, `AUTO_ENGINE_MIN_SAMPLE_QUALITY`,
`AUTO_ENGINE_MIN_SCORE`, `AUTO_ENGINE_MAX_OPPS_PER_FIXTURE`.

## Frontend patterns to mirror
- **Tabs:** `CommandCenterPage.tsx` — `type Tab` union (line 49) + `useState<Tab>` +
  NAV `{id,label,icon,badge}[]` map + per-tab `&&` render. Add `'autoengine'`, an
  icon from lucide (`Cpu`), and an `AutoEngineCockpit` view. Props available:
  `patterns`, `backendSync.online`, `isAdvanced`, `setActiveTab` (for cross-links).
- **API client:** `src/services/commandBackendClient.ts` (`getBackendUrl()`), and
  `backtestApi.ts`'s `ApiResult<T>` + `request<T>` pattern with **403 → disabled**.
  New file `src/services/autoEngineApi.ts` mirrors it (scan is a write/gated call).
- **Types:** `src/features/command/intelligence/autoEngineTypes.ts` (mirror comment +
  string-union types + interfaces + label/tone maps), alongside `alertIntelligenceTypes.ts`.
- **View skeleton:** mirror `BacktestLab.tsx` (Shell + gradient header + honest-state
  guards + panels) and `AlertsIntelligencePanel.tsx` (segmented control + drawer state).
- **Drawer:** mirror `alerts/intelligence/AlertSignalDrawer.tsx` (right-side
  `max-w-[680px]` panel, tab strip, Escape-to-close, `Section`/`Chips`/`KV` helpers).
- **Cells:** `components/views/shared/CounterCell.tsx`, `SidebarRow.tsx`.
- **Tokens:** panels `bg-white/[0.012]`, borders `border-white/[0.07]`, accent
  `#13B8A6`/`#2DD4BF`/`#5EEAD4`, `rounded-2xl/xl/lg`, section titles
  `text-[10px] uppercase tracking-[0.14em] text-white/45`, `tabular-nums`.

## Safe positioning (copy rules)
Never "apostas automáticas", never "sinais garantidos", no profit language, no odds,
no bet CTA, no Telegram button, no "create alert" button. Opportunity ≠ alert. Score
is signal-quality, not a probability. Blocked opportunities are shown as evidence of
conservative intelligence, never as errors. `unknown`/missing data ≠ failure.

## Out of scope (deferred)
Auto → Alerts wiring (`ENABLE_AUTO_ENGINE_TO_ALERTS`, B20/B21), route auth,
structured league-tier context. No new backend endpoints needed — all UI needs are met.
