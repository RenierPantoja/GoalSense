# Critical Domain Acquisition — UI (B44)

`CriticalDomainAcquisitionPanel.tsx` (Backstage, per selected fixture) shows the
critical-domain table and Readiness V5, and lets the operator act domain by domain.

## Shows

- Readiness V5: status, critical-domain coverage %, reliability %, blocked critical
  domains.
- Per domain: lock/unlock icon, provider, status (unlocked / blocked_missing_mapping /
  blocked_ambiguous_mapping / provider not configured / endpoint not documented /
  available_empty_confirmed / stale), missing ids, manual-fallback badge, recommended
  next action.

## Actions (operator+)

- "Rodar aquisição crítica" → `POST /fixtures/:id/acquisition/critical/run`.
- Per-domain refresh (only when `ready_to_fetch`) → `POST /fixtures/:id/domains/:domain/refresh`.

## Rules

Blockers are never hidden. "Sem lesão"/empty is never shown unless the provider
confirmed it. Manual data is badged `manual`, never shown as provider. Bloqueado não é
falha.

## Data source

`src/services/criticalDomainApi.ts` → `/api/match-intelligence/providers/endpoints`,
`/fixtures/:id/domain-unlock-matrix`, `/fixtures/:id/domains/:domain[/refresh]`,
`/fixtures/:id/acquisition/critical/run`, `/fixtures/:id/readiness-v5`,
`/fixtures/:id/precheck-v5`. Types in `criticalDomainTypes.ts`.

## Followed by the Historical Memory panel (B45)

Below the Critical Domain panel, the Backstage selected-fixture column now renders the
`HistoricalMemoryPanel` (B45): team/matchup/contextual-pattern memory, taboo candidates
and similar scenarios, plus a Readiness V6 badge. It is advisory only and shows honest
empty states (`insufficient_history` / `insufficient_data`, never negative findings).
See `docs/HISTORICAL_MEMORY_UI.md`.
