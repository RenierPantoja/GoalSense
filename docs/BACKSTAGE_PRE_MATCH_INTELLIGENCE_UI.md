# Backstage — Pre-Match Intelligence UI (B40)

The Backstage tab gains a B40 card: **"Aquisição pré-jogo & janela de escalação"**,
loaded from `package-v2` for the selected fixture.

## Sections

1. **Provider reliability** — which providers are configured (ESPN by default) and which
   critical domains have no provider.
2. **Janela de escalação** — lineup window status, minutes to kickoff, wait / refresh-now
   hints, next recommended check, and honest limitations.
3. **Domain snapshots** — per-domain provider, availability (`available` /
   `provider_not_configured` / `provider_not_supported` / `unavailable`), and freshness
   (`stale` flagged). Empty state when nothing was acquired yet.
4. **Readiness V2** — status (ready / wait / stay_out / provider_limited), readiness
   score, provider coverage %, stay-out reasons.
5. **Precheck V2** — advisory decision (avoid / wait_for_lineup /
   wait_for_injury_suspension_update / wait_for_live_confirmation / monitor /
   alert_candidate / strong_alert / post_match_learning_only), with mode (observe) and
   reasons.

## Actions (admin/operator only)

- **Buscar** → `POST /fixtures/:id/acquisition/run` (runs the planner's due tasks through
  the router, budget-guarded).
- **Escalação** → `POST /fixtures/:id/lineup-window/refresh`.

## Honesty in the UI

- Never shows "sem lesões"/"sem suspensos" when no provider supports it — shows
  `provider_not_configured`/`provider_not_supported`.
- Never shows an empty lineup; lineup before the window is `too_early`/`not_available_yet`.
- Precheck V2 in observe mode is labelled "(observe, off)" and never blocks a real alert.

## Data source

`src/services/matchIntelligenceApi.ts` (B40 methods) →
`/api/match-intelligence/*` (provider-stack, acquisition, lineup-window,
player-importance, readiness-v2, precheck-v2, post-match-explanation-v2, package-v2).
