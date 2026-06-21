# Controlled-Beta Readiness (B50)

`validation/controlledBetaReadiness.service.ts`. Honest, conservative gate toward a
controlled beta. Technical only — NOT a sales guarantee, never a promise of accuracy.

## Status (`classifyControlledBeta`, PURE)
- `blocked` — enforce ON with `< 7` daily reports.
- `not_ready` — no Firebase/provider and no daily reports.
- `internal_alpha` — missing provider OR Firebase, or `< 7` daily reports.
- `controlled_beta_possible` — provider configured + Firebase configured + `>= 7` daily reports.

## Hard gates
- Without a real provider configured → at most `internal_alpha`.
- Without accumulated real validation (`>= 7` daily reports) → cannot be possible.
- Without persistent Firebase → cannot be possible.
- Enforce ON without validation → `blocked`.
- Telegram ON → soft blocker / security requirement.

## Output
reasons, hardBlockers, softBlockers, providerRequirements, validationRequirements,
operationalRequirements, securityRequirements, nextActions, limitations.

## API
`GET /api/match-intelligence/local-validation/controlled-beta-readiness`.

`controlled_beta_possible` means "technically eligible to consider a controlled beta", not a
guarantee of results.
