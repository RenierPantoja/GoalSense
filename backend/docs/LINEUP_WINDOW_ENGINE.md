# Lineup Window Engine (B40)

`lineupWindowEngine.service.ts` manages the critical moment when lineups drop. It is
honest: lineup absent before its window is not a failure; absent after the window with
no provider is `provider_not_supported`/`stale`.

## Status — `LineupWindowStatus`

`too_early` | `probable_expected` | `confirmed_expected_soon` | `confirmed_available` |
`confirmed_unavailable` | `provider_not_supported` | `stale` | `unknown`.

Derived from minutes-to-kickoff (probable window ~6h, confirmed window ~90min), whether
a confirmed-lineup snapshot exists and is fresh, and whether any provider supports
lineups. Emits `shouldWait`, `shouldRefreshNow`, `nextRecommendedCheckAt`.

## Functions

`getLineupWindowStatus`, `shouldWaitForLineup`, `shouldRefreshLineupNow`,
`detectLineupChangeImpact(previous, current)`, `buildLineupImpactReport`,
`recomputeReadinessAfterLineup`.

## Impact — `LineupImpact`

`keyPlayerMissing`, `keyPlayerReturned`, `tacticalShapeChanged`, `goalkeeperChanged`,
`defenseWeakened`, `attackWeakened`, `rotationDetected` — all `unknown` today (no
structured lineup payload in the backend). `analysisImpact` + `shouldReevaluatePrecheck`
+ `shouldWait`. A lineup change recommends re-evaluating the precheck.

## Honesty rules

A missing lineup before the window is `too_early`/`probable_expected` with `shouldWait`,
never a failure. Without a configured lineup provider the status is
`provider_not_supported` (a limitation, not a fault). Player importance is `unknown`
without evidence — we never invent which player matters.

## B41 — lineup real data flow (provider + manual)

`getLineupWindowStatusV2(fixtureId)` adds manual + conflict awareness. New statuses:
`waiting_for_provider`, `waiting_for_manual_confirmation`, `probable_available`,
`confirmed_available`, `conflict_requires_review`, `provider_not_configured`. A manual
confirmed lineup is used as `manual_operator` (never as provider); a provider × manual
divergence is a `conflict_requires_review`. See `READINESS_V3.md` / `PRECHECK_V3.md`.
