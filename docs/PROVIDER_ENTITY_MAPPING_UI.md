# Provider Entity Mapping — UI (B43)

`ProviderEntityMappingPanel.tsx` (Backstage, below the fixture identity panel) shows and
resolves team/competition mappings + per-fixture domain unlock.

## Sections

- **Domínios (desbloqueio)** — per critical domain (fixture_details, lineups,
  post_match_stats, standings, injuries, suspensions, H2H, squads): unlocked / missing
  mapping / ambiguous / provider not configured / endpoint not implemented.
- **Times mapeados** — ESPN team → API id, status (auto/manual/ambiguous/candidate),
  matched-fixture count; operator confirm/reject.
- **Competições mapeadas** — ESPN competition → API league id + season; confirm/reject.
- **Derivar mappings** (operator) — runs derivation from confirmed fixture mappings.

## Rules

- Mappings come from confirmed fixtures (evidence), never name-only.
- Ambiguous is shown and never auto-confirmed.
- Confirm unlocks standings/injuries per fixture (documented endpoints); other domains
  show "endpoint não implementado" and route to manual intake.

## Data source

`src/services/providerEntityMappingApi.ts` →
`/api/match-intelligence/identity/entity-mappings/*` +
`/fixtures/:id/domain-unlock-status`. Types in `providerEntityMappingTypes.ts`.
