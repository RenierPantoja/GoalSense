# Team / Competition Alias Engine (B42)

`identity/teamCompetitionAlias.service.ts` learns provider name equivalences so future
matching improves.

## API

`suggestTeamAlias` / `suggestCompetitionAlias` (low-confidence auto suggestions),
`buildAliasesFromConfirmedMappings`, `confirmTeamAlias` / `confirmCompetitionAlias`
(promote to high + manual), `listTeamAliases` / `listCompetitionAliases`,
`explainAliasUsage`. Persisted in `teamAliases` / `competitionAliases` (Firebase).

## Rules

- A confirmed alias improves future matching; a suggested alias never confirms a fixture
  by itself.
- Manual confirmation is audited (`source: 'manual'`, `confidence: 'high'`).
- Homonym teams are not merged without country/competition disambiguation.
- Because current mappings are fixture-level (no team/competition ids exposed), derived
  aliases are intentionally conservative — nothing is fabricated.
