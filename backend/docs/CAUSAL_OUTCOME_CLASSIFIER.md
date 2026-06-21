# Causal Outcome Classifier (B48 / Bloco 5)

`causal/causalOutcomeClassifier.service.ts` — PURE. Deterministically classifies whether a
decision was good/bad and why, conservatively.

## Order of reasoning
1. Outcome not confirmed/failed (pending/unknown/expired) → `not_evaluable`.
2. Weak/unknown link → `unknown` (no strong causality).
3. Failed:
   - alert created against a would-block → `should_have_stayed_out` + `ignored_blocker`.
   - alert created against a would-wait → `should_have_waited` + `ignored_wait_reason`.
   - missing critical domain → `provider_limited` / `data_insufficient` + `missing_critical_domain`.
   - stale data → `data_insufficient` + `stale_data`.
   - red card / substitution / injury WITH evidence → `variance_or_shock`.
   - else: `bad_decision_bad_outcome` with the specific categories (weak sample / memory
     misleading / influence overestimated / conflict) or `unknown` (investigate — never auto-chance).
4. Confirmed:
   - would-block (shadow) but good → `overconservative` (+ `governance_too_strict`).
   - would-wait but good → `right_to_wait`.
   - else → `good_decision_good_outcome` with aligned success categories.

`classifyGovernanceQuality` returns aligned / too_strict / too_loose / not_evaluable.
Nothing here is a probability; an error is never "chance" without evidence.
