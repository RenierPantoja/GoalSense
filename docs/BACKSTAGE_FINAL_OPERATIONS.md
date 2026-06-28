# Backstage — Final Operations Console (B49 / Bloco 6)

With B49 the Backstage Match Intelligence panel becomes the complete local operational
console for one fixture plus a global validation/health header.

## Layout
- **Global header**: `LocalValidationPanel` (B49) — validation plan, run controls,
  reliability/coverage/cost, go/no-go + backend health.
- **Selected-fixture column** (in order):
  - Critical Domain Acquisition (B44)
  - Historical Memory (B45)
  - Variable Influence (B46)
  - Alert Governance (B47)
  - Causal Learning (B48)
- Provider integration readiness (B41), today's fixtures, the consolidated package, decision
  inputs, and the V2/V3 acquisition/merge panels remain as before.

## Operational flow (a day)
1. Check backend health + go/no-go (global panel).
2. Review today's validation plan (selection + cost + risks); run validation.
3. Per fixture: inspect data → memory → influence → governance → causal.
4. After matches: run causal learning; review calibration suggestions (human review only).
5. Re-check provider coverage to plan data improvements.

## Discipline
The whole console is observe/shadow: it never blocks alerts, never enforces, never sends
Telegram/odds, never applies calibration automatically, and never presents a score/metric as
a probability of winning. Heavy panels remain self-contained and read-only by default; POST
actions require operator. See `docs/LOCAL_VALIDATION_UI.md`, `docs/CAUSAL_LEARNING_UI.md`,
`docs/ALERT_GOVERNANCE_UI.md`, `docs/VARIABLE_INFLUENCE_UI.md`, `docs/HISTORICAL_MEMORY_UI.md`,
`docs/CRITICAL_DOMAIN_ACQUISITION_UI.md`.

## B50 — campaign console

The global header now includes the daily report, campaign tracker and controlled-beta
readiness (B50), turning the Backstage into the console for a multi-day validation campaign:
run the day → generate the daily report → attach to a campaign → repeat 7–14 days → review
controlled-beta readiness. The live-recheck bridge can be enabled (observe, rate-limited) to
re-evaluate governance automatically during live matches without ever alerting/blocking. See
`docs/DAILY_VALIDATION_REPORT_UI.md`, `docs/VALIDATION_CAMPAIGN_UI.md`,
`backend/docs/FIRST_REAL_VALIDATION_DAY_RUNBOOK.md`.
# B59 ESPN Live-First Worker Panel

Backstage includes a local ESPN Live-First worker panel for status, active leases, sessions, orphan recovery, and post-match sweeping. It does not expose odds, stake, Telegram delivery, or enforce controls.
