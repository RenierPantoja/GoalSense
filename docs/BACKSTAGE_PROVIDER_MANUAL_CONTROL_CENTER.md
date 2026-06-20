# Backstage — Provider + Manual Control Center (B41)

The Backstage tab becomes a local control center for real provider integration + manual
intake.

## Sections

1. **Prontidão dos providers (global)** — each provider's `adapterStatus`
   (real/skeleton/not_configured/disabled), implemented domain count, and missing env
   vars. Says exactly why a domain is or isn't arriving.
2. **Provider + Manual + Conflitos (per fixture)**:
   - Readiness V3: status (ready_with_provider/manual_data, wait, stay_out,
     provider_limited), provider/manual coverage %, manual-review flag.
   - Merge conflicts: provider × manual divergences flagged for operator review.
   - Manual intelligence list — each record carries a `manual` badge + domain + source +
     reliability; admin can delete.
   - Add manual record (operator+): domain + sourceType + source label + optional player
     + note. Tagged manual, audited.

## Auth

Reads open; manual create/update operator+; manual delete admin/owner; acquisition runs
operator+.

## Honesty in the UI

- Never shows "sem lesões"/"sem suspensos" when unavailable — shows the honest state.
- Manual data always badged `manual`; never shown as provider.
- Conflicts are shown, never auto-resolved.
- Precheck stays observe; never blocks a real alert.

## Data source

`src/services/matchIntelligenceApi.ts` (B41 methods) → `/api/match-intelligence/*`
(providers/readiness, manual-records CRUD, merge-report, readiness-v3, precheck-v3,
acquisition/run-v2). Types in `manualIntelligenceTypes.ts` + `providerReadinessTypes.ts`.

## B42 — identity resolution panel

Backstage now embeds `ProviderIdentityResolutionPanel` per fixture: ESPN↔external mapping
status, candidates (with ambiguity/warnings), and operator confirm/reject + "Resolver
identidade". Confirmed mappings unlock fixture-scoped provider fetch. See
`PROVIDER_IDENTITY_RESOLUTION_UI.md`.
