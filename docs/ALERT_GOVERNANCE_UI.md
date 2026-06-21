# Alert Governance UI (B47 / Bloco 4)

Backstage panel surfacing the decision brain per fixture.

## Files
- `src/features/matchIntelligence/alertGovernanceTypes.ts` — DTOs + labels.
- `src/services/alertGovernanceApi.ts` — read-only GETs + operator POST actions.
- `src/features/command/components/views/backstage/AlertGovernancePanel.tsx` — panel.
- Wired into `BackstageMatchIntelligencePanel.tsx` (after the B46 Variable Influence panel).

## What it shows
- **Modo de governança**: observe / shadow / shadow_block / enforce, clearly labeled
  "advisory — não bloqueia alerta real" outside enforce.
- **Decisão atual**: allow / monitor / wait / block / stay-out / no_decision, with allow/
  wait/block/stay-out reasons, conflicts and `would_block (não bloqueou)` badge in shadow.
- **Holds ativos**: reason + próxima reavaliação; operator can resolve.
- **Reavaliar ao vivo**: operator buttons (lineup_confirmed, red_card, goal, substitution,
  half_time, minute_threshold) that run a live re-evaluation (records only).
- **Histórico recente**: last decisions with action/source/time.

## Permissions
GET endpoints env-gated (`ENABLE_MATCH_INTELLIGENCE` + `ENABLE_ALERT_DECISION_GOVERNANCE`).
POST evaluate / live-trigger / hold resolve/recheck require operator (`run:scan`).

## Honest framing
A governance decision is observational — never a probability and never betting language.
In observe/shadow it never blocks a real alert; holds wait and re-evaluate; conflicts are
explicit; human overrides are audited. The panel never changes score/confidence/patterns/
alert results.

## Endpoints used
`/api/match-intelligence/governance/mode`, `fixtures/:id/governance` (+`/evaluate`,
`/holds`, `/live-trigger`), `governance/holds/:id/recheck|resolve`,
`governance/results/:id`, `governance/runs`, `fixtures/:id/post-match-explanation-v6`.

## Next step (Bloco 5)
Causal post-match learning will consume Governance Outcome Review (V6) to calibrate the
policy. Drawer badges (allowed / monitor_only / would_wait / would_block / overridden) on
`AlertSignalDrawer` / `ServerAlertList` remain a follow-up.

## Followed by the Causal Learning panel + drawer badge (B48)

Below the Alert Governance panel, the Backstage now renders the `CausalLearningPanel` (B48).
The B47 follow-up (governance visible outside the Backstage) is addressed by
`AlertGovernanceBadge`, a compact read-only badge in the alert drawer showing the governance
action, "observe · não bloqueia", would_block/would_wait and a causal classification when a
case exists. See `docs/CAUSAL_LEARNING_UI.md`.
