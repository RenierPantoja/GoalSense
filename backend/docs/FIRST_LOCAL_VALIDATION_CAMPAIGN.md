# First Local Validation Campaign (B50)

The B50 milestone prepares the GoalSense backend to run real matches for 7–14 days and
measure reliability, coverage and cost before any internal-constant use or controlled beta.

## What B50 adds (no new architecture — operation + reporting)
- `.env.local.validation.example` — safe env template (no secrets).
- First-day runbook (`FIRST_REAL_VALIDATION_DAY_RUNBOOK.md`).
- Daily Validation Report (service + API + UI).
- Validation Campaign tracker (service + API + UI).
- Controlled-Beta Readiness (service + API + UI), conservative.
- Live Recheck Bridge wired into the live monitor (OFF by default, observe, rate-limited).
- Smokes: `smokeLiveRecheckBridgeWiring`, `smokeFirstLocalValidationCampaign`.

## Discipline
Observe/shadow only; enforce OFF; no Telegram/odds/auto-bet/stake; a metric is not a promise
of accuracy; go/no-go and beta readiness are technical, not commercial guarantees;
unknown/not_evaluable and provider limitations are always separated from real failure.

## Operational loop
day runbook → daily report → attach to campaign → repeat 7–14 days → controlled-beta
readiness review → resolve blockers (provider, mappings, Firebase, accumulated validation)
before considering any beta. See `DAILY_VALIDATION_REPORT.md`, `VALIDATION_CAMPAIGN_TRACKER.md`,
`CONTROLLED_BETA_READINESS.md`, `LIVE_RECHECK_BRIDGE_WIRING.md`.
