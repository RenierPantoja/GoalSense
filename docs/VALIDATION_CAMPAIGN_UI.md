# Validation Campaign UI (B50)

## Files
- `src/features/matchIntelligence/validationCampaignTypes.ts` + `controlledBetaReadinessTypes.ts` — DTOs.
- `src/services/localValidationApi.ts` — campaign + controlled-beta methods.
- `ValidationCampaignPanel.tsx` — create / list / close campaigns; shows aggregate metrics
  and the running recommendation.
- `ControlledBetaReadinessCard.tsx` — conservative readiness status + blockers + next actions.
- Both rendered in the Backstage global header (after the Local Validation panel).

## What they show
- Campaign: days progress (actual/target), fixtures analyzed / with data, causal evaluable vs
  not_evaluable, final recommendation (never a guarantee).
- Controlled-beta: status (not_ready / internal_alpha / controlled_beta_possible / blocked),
  hard/soft blockers, provider/validation/operational/security requirements, next actions.

## Honest framing
A campaign summary and readiness status are technical, NOT commercial guarantees and NOT
promises of accuracy. `controlled_beta_possible` requires provider + Firebase + accumulated
real validation. Env-gated; create/close require operator.
