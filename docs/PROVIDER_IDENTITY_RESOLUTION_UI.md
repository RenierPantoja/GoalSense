# Provider Identity Resolution — UI (B42)

`ProviderIdentityResolutionPanel.tsx` (inside Backstage, per selected fixture) shows and
resolves the ESPN↔external id blocker.

## Sections

- **Mapping status** — ESPN → api_football status (candidate/auto_confirmed/
  manually_confirmed/ambiguous/rejected), score + band, and the external id once
  confirmed.
- **Candidatos** — each candidate's band+score, secondary label, kickoff delta, swapped
  flag, and warnings. Ambiguity is always shown.
- **Ações (operator+)** — "Resolver identidade" (run), "Confirmar" (requires a visual
  `window.confirm`), "Rejeitar".

## Rules

- Confirm requires explicit confirmation and unlocks fixture-scoped fetch.
- Ambiguous is never hidden and never auto-confirmed.
- The backend never calls an unconfigured provider; the UI shows "sem mapping — rode a
  resolução" otherwise.

## Data source

`src/services/providerIdentityApi.ts` → `/api/match-intelligence/identity/*`
(resolution-runs, resolve/today, resolve/fixtures/:id, candidates, mapping,
mappings/:id/confirm|reject, aliases/teams|competitions). Types in
`providerIdentityTypes.ts`.
