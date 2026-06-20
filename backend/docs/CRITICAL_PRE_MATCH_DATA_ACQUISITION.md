# Critical Pre-Match Data Acquisition (B44 / Bloco 1)

Turns the B40–B43 identity/bridge/runner infrastructure into orchestrated, real
critical-domain acquisition for today's games — domain by domain, governed by a single
endpoint catalog, never guessing endpoints or ids.

## Pieces

- **Provider Endpoint Catalog** (`providers/providerEndpointCatalog.*`) — single source
  of truth for which endpoints are documented/implemented/safe. See
  `PROVIDER_ENDPOINT_CATALOG.md`.
- **Domain Unlock Matrix V2** (`providerBridge.getDomainUnlockStatusV2` /
  `getAllDomainUnlockStatuses`) — catalog + mappings + resolved/missing ids + manual
  fallback + recommended next action. See `DOMAIN_UNLOCK_MATRIX_V2.md`.
- **Canonical Normalizer V2** (`canonicalNormalizer.service.ts`) — uniform envelope;
  empty only as `available_empty_confirmed`; absent ≠ zero.
- **Critical Domain Snapshot Store V2** — `PreMatchDomainSnapshot` extended with
  endpoint key, unlock status, resolved/missing ids, source breakdown, confirmedEmpty,
  reliability, refreshReason.
- **Acquisition Runner V4** (`runCriticalDomainAcquisitionForFixture/Today`,
  `runDomainAcquisition`, `buildCriticalDomainAcquisitionReport`). See
  `ACQUISITION_RUNNER_V4.md`.
- **Readiness V5 / Precheck V5 / Post-Match V3** — consume the matrix. See those docs.
- **Match Intelligence Package V3** (`matchIntelligencePackageV3.service.ts`) —
  consolidated read-only view (matrix + readinessV5 + precheckV5 + endpoint catalog +
  nextBestDataAction).

## Domains really fetchable now (env + confirmed mappings)

fixture_details, post_match_stats, confirmed_lineups (fixture mapping); standings
(league+season mapping); injuries (team mappings). Everything else stays
`not_implemented_with_docs_needed`/`blocked_*` → manual intake.

## Honesty rules

Provider without env is never called; undocumented endpoints are never guessed;
candidate/ambiguous mappings never unlock a critical fetch; empty only when the provider
confirms it; injuries/suspensions/lineups absent never become "none"/empty; manual data
stays manual; blocked is never a failure. No score/confidence/pattern changes; precheck
stays observe.
