# Causal Learning UI (B48 / Bloco 5)

Backstage panel for post-match causal learning + a lightweight governance/causal badge in
the alert drawer.

## Files
- `src/features/matchIntelligence/causalLearningTypes.ts` — DTOs + labels.
- `src/services/causalLearningApi.ts` — read-only GETs + operator POST run/review.
- `src/features/command/components/views/backstage/CausalLearningPanel.tsx` — panel
  (wired into `BackstageMatchIntelligencePanel.tsx` after the B47 Governance panel).
- `src/features/command/components/views/alerts/intelligence/AlertGovernanceBadge.tsx` —
  compact, self-contained badge inserted into `AlertSignalDrawer` (Resumo tab).

## Panel sections
- **Rodar análise** (operator): per-fixture causal learning run.
- **Casos analisados**: classification + link strength + outcome + success/failure
  categories; `não avaliável` shown honestly.
- **Por que funcionou/falhou**: insights with evidence + suggested refinement.
- **Sugestões de calibração**: governance + influence, with confidence/evidence count and
  human review actions (revisar / aceitar p/ futuro / rejeitar).

## Honest framing
Causal learning is observational — NOT a probability and NOT a promise. An error is not
chance by default; variance only with evidence; a weak link never becomes strong causality.
Suggestions NEVER auto-apply (accept = mark for future). Nothing changes score/confidence/
patterns/alerts/enforce. Env-gated by `ENABLE_CAUSAL_LEARNING`; POST actions need operator.

## Drawer badge
`AlertGovernanceBadge` shows the governance action (gov: allow/monitor/wait/block), the
mode ("observe · não bloqueia"), `would_block`/`would_wait` in shadow and a causal
classification when a case exists. Read-only; fails silently on env-gate/error — addresses
the B47 follow-up of surfacing governance outside the Backstage.

## Endpoints used
`/api/match-intelligence/causal/cases` (+`/:id`, fixture-scoped), `causal/run` (fixture/
today/alert/governance-result), `causal/insights`, `causal/calibration/governance|influence`,
`causal/calibration/:id/review|reject|accept-for-future`, `causal/runs`,
`fixtures/:id/post-match-explanation-v7`.

## B49 — surfaced in local validation

Causal learning now also runs inside the B49 local validation runner (per finished fixture)
and its evaluable-vs-not_evaluable counts appear in the Local Validation panel's reliability
metrics. Link repair (`decisionOutcomeLinkRepair`) improves evaluability without promoting
weak links to exact. See `docs/LOCAL_VALIDATION_UI.md`.
