# First Local Validation Campaign — Operational Audit (B50)

State of the project after B49, mapping what runs locally before the first real campaign.

## Ready to run locally (no external provider)
- ESPN live monitor (env-gated worker), pattern/resolution workers.
- Match Intelligence Package V1–V5, Readiness V1–V7, Precheck V1–V7 (on-demand).
- Historical memory (B45), variable influence (B46), governance (B47, observe), causal (B48).
- Local long-run validation (B49) + B50 daily report / campaign / controlled-beta readiness.

## Requires Firebase (`PERSISTENCE_PROVIDER=firebase`)
- Persistence of ledger/outcomes/memory/governance/causal/validation/daily-reports/campaigns.
- Under Prisma/Noop everything reads empty → reports say `insufficient_data` (honest).

## Requires `API_FOOTBALL_KEY` (+ `ENABLE_PROVIDER_API_FOOTBALL` + mappings)
- Real critical pre-match domains (standings, injuries) and the domain-unlock matrix.
- Without it: pre-match analysis is provider-limited; ESPN live + manual intake still work.

## Works without external provider
- Live monitoring (ESPN), internal memory, influence, governance shadow, causal learning on
  internal outcomes, the whole validation/reporting layer.

## Limited without provider
- Lineup/injury/suspension/standings coverage; causal cases that need provider data.

## Flags that MUST stay OFF
- `ENABLE_ALERT_GOVERNANCE_ENFORCE` (no enforce), `TELEGRAM_ENABLED`, `ODDS_ENABLED`,
  all schedulers (`*_SCHEDULER`).

## Flags safe to turn ON
- `ENABLE_LOCAL_LONG_RUN_VALIDATION`, `ENABLE_ALERT_DECISION_GOVERNANCE` (observe),
  `ENABLE_CAUSAL_LEARNING`, `ENABLE_PRE_MATCH_ACQUISITION` (manual), and — only to test live
  recheck — `ENABLE_LOCAL_LIVE_RECHECK_BRIDGE=true` (observe, rate-limited).

## Operator checklist before day one
Confirm Firebase creds; decide on provider; run all smokes; open Backstage; run the day's
validation plan; review selection; (optional) provider/identity mapping; run critical-domain
acquisition / manual intake; build memory/influence; evaluate governance (observe); watch holds.

## Backstage data to observe
Backend health + go/no-go; validation plan (selection + cost + risks); reliability metrics;
provider/domain coverage; daily report; controlled-beta readiness.

## Metrics that determine progress vs block
Progress: pipeline runs without fatal failure, growing fixturesWithData and causalEvaluable,
shrinking provider-limited. Block toward beta: no provider, no Firebase, `< 7` daily reports,
enforce ON without validation — all keep readiness at `internal_alpha`/`not_ready`/`blocked`.

## Conclusion
Everything needed for a controlled local campaign exists. The work now is operational:
configure provider+mappings, run 7–14 real days, generate daily reports, group them into a
campaign, and review controlled-beta readiness — never promising accuracy.
