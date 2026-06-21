# Causal Insight Generator (B48 / Bloco 5)

`causal/causalInsightGenerator.service.ts` — PURE. Turns a classified case into
human-readable insights. Every insight needs evidence; without it, a limitation is added.
No bet/odds/stake language. All insights are advisory: `autoApplicable=false`,
`requiresHumanReview=true`.

## Insight types
governance_policy, variable_influence, memory, data_acquisition, live_recheck,
alert_timing, provider_quality, manual_review.

## Examples produced
- "Bloqueador ignorado" (ignored_blocker → governança falhou).
- "Espera ignorada" (ignored_wait_reason).
- "Possível conservadorismo excessivo" (overconservative).
- "Influência superestimada/subestimada".
- "Memória enganou / amostra fraca supervalorizada".
- "Domínio crítico ausente prejudicou" / "Limitação de provider".
- "Confirmação ao vivo necessária" (red-card shock / too early).

A not_evaluable case yields no insights. `generateInsightsForCase` aggregates all generators.
