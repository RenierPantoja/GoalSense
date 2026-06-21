# First Real Validation Day — Runbook (B50)

Step-by-step for an operator to run one real day without reading the code.

## Before the matches
1. Confirm Firebase: `PERSISTENCE_PROVIDER=firebase` + valid credentials (service account
   file is gitignored — keep it local).
2. Confirm provider: if you have an API-Football key, set `API_FOOTBALL_KEY` and
   `ENABLE_PROVIDER_API_FOOTBALL=true`; otherwise leave OFF (ESPN + manual still work).
3. Confirm `ENABLE_ALERT_GOVERNANCE_ENFORCE=false`, `TELEGRAM_ENABLED=false`, `ODDS_ENABLED=false`.
4. Run smokes: `npm run build` then the smoke suite (see package.json `smoke:*`).
5. Open Backstage → "Validação local & saúde do backend".
6. Click "Plano" → review selected vs skipped fixtures, estimated cost, risks.
7. (If provider on) run identity mapping; confirm mappings only when unambiguous.
8. Run critical-domain acquisition; add manual intake where a domain is missing.
9. Build memory and influence (per fixture panels).
10. Evaluate governance in observe; create/watch holds.

## During the matches
- Watch live snapshots; observe governance decisions; re-check holds when triggers fire.
- (Optional) enable `ENABLE_LOCAL_LIVE_RECHECK_BRIDGE=true` for automatic, rate-limited,
  observe-only governance re-evaluation — it never sends or blocks an alert.
- Do NOT enable enforce; do NOT send Telegram.

## After the matches
1. Let outcomes resolve (resolution worker / manual).
2. Run causal learning (per fixture / today).
3. Run local validation metrics (the run auto-collects on completion).
4. Generate the daily report ("Gerar hoje" in the Daily Report panel).
5. Review insights and calibration suggestions — DO NOT apply automatically.
6. Attach the daily report to the active campaign.
7. Record limitations honestly (provider gaps, not_evaluable cases).

## Repeat
Run this for 7–14 real days, accumulate daily reports in a campaign, then review the
controlled-beta readiness card. A metric is not a promise; readiness is technical only.
