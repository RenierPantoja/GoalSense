# Automatic Engine Foundation — Audit (Phase B19)

Read-only audit before building the Auto Engine. No behaviour changed here.

## Data sources available today
- **Live fixtures**: `repos.fixtures.listLive(['1H','2H','HT','ET','BT'], limit)`.
- **Latest snapshot per fixture**: `repos.liveSnapshots.findLatestByFixture(id)` →
  `minute, scoreHome/Away, status, statsJson, eventsJson, dataQuality, provider, capturedAt`.
- **Evaluation input**: `buildPatternInput(fixture, snapshot)` (snapshotToPatternInput)
  → `homeName, awayName, competition, status, minute, score, stats (LiveMatchStats),
  events (BackendTimedEvent[]), dataQuality, provider`.
- **Live stats** (ESPN): possession, shots, shotsOnTarget, corners, yellow/red cards,
  fouls, offsides, saves (home/away). Partial coverage; many fixtures `partial`/`poor`.
- **Match context**: `deriveMatchContext(competition)` (heuristic competition type/stage/importance).
- **Active patterns**: `repos.patterns.listActive('default')`.
- **Learning profiles (B13)**: `listPatternLearningProfiles`, `getPatternLearningProfile`,
  `listCompetitionLearningProfiles`, `listTeamLearningProfiles` — carry usefulRate/
  failedRate/unknownRate, sampleQuality, best/worst contexts, top failure reasons.
- **Recent alerts** (dedup): `repos.alerts.findByFixtureIds(fixtureId)`.
- **Stat utils**: `sampleQualityOf` (learningStats), `minuteWindowOf` (minuteWindow),
  `contextKey` — reused for deterministic scoring/keys.

## Still unavailable (must be `unavailable` / blocked, never invented)
- xG, dangerous attacks, pre-match form, H2H, standings, lineups, injuries, **odds**.
- Exact per-event side attribution beyond what ESPN events provide.
- Learning profiles only exist after B13 aggregation ran (may be empty).

## Safe strategy
1. Evaluate condition-like signals **without** creating alerts (pure reads + pure scoring).
2. Each strategy uses ONLY data that exists; if a required stat is missing →
   `risk gate` blocks with `missing_required_data` (not a failure).
3. Score blends live evidence + learning context, penalizing poor data / low sample /
   high unknown. `confidenceBand` capped when sampleQuality is insufficient.
4. Everything is explainable + auditable; persistence only when `ENABLE_AUTO_ENGINE_WRITE=true`.

## Risks of false signal & mitigations
| Risk | Mitigation |
|------|-----------|
| Signalling on poor/stale data | risk gate blocks poor/unknown + stale snapshot. |
| Treating missing data as failure | missing → `unknown`/block reason, never failed. |
| Over-confidence on tiny samples | `confidenceBand` capped by `sampleQuality`; low-sample → at most `watch`. |
| Duplicating manual alerts | risk gate blocks when a recent manual alert exists for the fixture/type. |
| Flooding | `AUTO_ENGINE_MAX_FIXTURES_PER_RUN` + max opportunities per fixture. |

## Why this phase creates NO automatic alerts
The Auto Engine only produces **opportunities** (candidate/watch/strong/blocked),
persisted in its own collections. `ENABLE_AUTO_ENGINE_TO_ALERTS` exists but is
`false` and **not** wired to alert creation — that is deliberately deferred to a
later phase (B20/B21) with a configurable gate. No Telegram, no odds, no auto-bet.

## Gate decisions (env)
- `ENABLE_AUTO_ENGINE=false` — the scan does nothing unless explicitly enabled.
- `ENABLE_AUTO_ENGINE_WRITE=false` — dry-run by default (computes, persists nothing).
- `ENABLE_AUTO_ENGINE_SCHEDULER=false` — no periodic run by default.
- `ENABLE_AUTO_ENGINE_TO_ALERTS=false` — never creates alerts this phase.
- `AUTO_ENGINE_MAX_FIXTURES_PER_RUN=20`, `AUTO_ENGINE_MIN_SAMPLE_QUALITY=moderate`,
  `AUTO_ENGINE_MIN_SCORE=55` (conservative).
