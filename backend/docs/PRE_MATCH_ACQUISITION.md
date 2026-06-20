# Pre-Match Acquisition (B40)

A multi-provider, temporally-intelligent layer that fetches and consolidates real
pre-match data for **today's** games — by capability, not by a fixed provider. It never
invents data, never uses odds, never calls a provider without credentials.

## Registry + router

- `providers/providerRegistry.service.ts` — registers adapters and their real
  capabilities. ESPN is wired; API-Football / SportMonks / football-data / manual are
  honest skeletons that are only `configured` when their env is set (and never called
  otherwise). `getBestProviderForDomain`, `buildProviderStackReport`, etc.
- `providers/footballDataProviderRouter.service.ts` — routes per domain with fallback,
  consults the provider budget guard for keyed providers, and returns honest states:
  `provider_not_supported` (nobody covers it), `provider_not_configured` (covered but no
  env), `budget_blocked`, `unavailable`, `available`/`partial`.

## Adapters (`providers/adapters/`)

| Adapter | Status |
|---|---|
| `espnFootballProvider` | real — today_fixtures / live / post from already-ingested data |
| `apiFootballProvider` | honest skeleton (needs `API_FOOTBALL_KEY` + `ENABLE_PROVIDER_API_FOOTBALL`) |
| `sportmonksProvider` | honest skeleton (needs `SPORTMONKS_API_KEY` + `ENABLE_PROVIDER_SPORTMONKS`) |
| `footballDataOrgProvider` | honest skeleton (needs `FOOTBALL_DATA_KEY` + `ENABLE_PROVIDER_FOOTBALL_DATA`) |
| `manualLocalProvider` | operator-entered snapshots only (provider="manual"); never mock |

Skeletons declare *potential* capabilities but, until fetch is implemented and
credentials provided, return `provider_not_configured` (no env) or `unavailable`
(configured, not implemented). No fabrication.

## Planner + runner

- `preMatchAcquisitionPlanner.service.ts` — for each selected today fixture, builds
  tasks across windows **T-24h / T-6h / T-90min / T-60min / T-15min / live / post**.
  Lineup domains before their window are `not_available_yet`; unsupported domains are
  not retried forever. Only MatchDayScope fixtures, bounded by `LOCAL_MAX_LIVE_FIXTURES`.
- `preMatchAcquisitionRunner.service.ts` — executes tasks through the router, persists
  snapshots + a run. Manual-first; scheduler off by default; non-fatal; budget-guarded.
  Functions: `runAcquisitionForToday`, `runAcquisitionForFixture`, `runAcquisitionTask`,
  `refreshLineupWindow`, `refreshCriticalPreMatchData`, `buildAcquisitionReport`.
- `preMatchAcquisition.scheduler.ts` — optional unref interval, requires
  `ENABLE_PRE_MATCH_ACQUISITION` + `ENABLE_PRE_MATCH_ACQUISITION_SCHEDULER` +
  `PRE_MATCH_ACQUISITION_MODE=scheduled`.

## Store

`preMatchDataStore.service.ts` + repo methods persist `PreMatchDomainSnapshot`
(collection `preMatchDomainSnapshots`) and `PreMatchAcquisitionRun`
(`preMatchAcquisitionRuns`). Each snapshot carries `fetchedAt`/`freshness`/
`availability`/`expiresAt`; stale snapshots are still readable but flagged. Noop-safe
(under Prisma nothing persists; reads return null/[]).

## Env flags

| flag | default |
|---|---|
| `ENABLE_PRE_MATCH_ACQUISITION` | `false` |
| `ENABLE_PRE_MATCH_ACQUISITION_SCHEDULER` | `false` |
| `PRE_MATCH_ACQUISITION_MODE` | `manual` |
| `PRE_MATCH_ACQUISITION_INTERVAL_MS` | `900000` |
| `PRE_MATCH_SNAPSHOT_TTL_HOURS` | `12` |
| `ENABLE_PROVIDER_API_FOOTBALL` / `ENABLE_PROVIDER_SPORTMONKS` / `ENABLE_PROVIDER_FOOTBALL_DATA` / `ENABLE_PROVIDER_MANUAL_LOCAL` | `false` |
| `SPORTMONKS_API_KEY` | unset |

## Honesty rules

Absent ≠ zero. Injury/suspension unsupported is never "no injury/suspension". Lineup
before its window is `not_available_yet`, not a failure. Provider without env is never
called. No odds, no Telegram, no auto-bet, no stake. Score/confidence/patterns/counters/
results unchanged.

## Real limitations

Only ESPN is truly wired (today fixtures + live). All pre-match domains
(lineups/injuries/suspensions/standings/H2H) report `provider_not_configured` until an
operator supplies credentials and the corresponding fetch integration is implemented.

## B41 — real integration + manual intake + merge

A real API-Football `today_fixtures` fetch (env-gated, ID-free), a provider readiness
report (`/providers/readiness`), an auditable **manual intelligence intake** for the
domains blocked by id-mapping, and a **merge engine** (provider + manual with conflict
detection) now feed Acquisition Runner V2 (`runAcquisitionForFixtureV2`/`…TodayV2` +
`buildAcquisitionReportV2`: fetchedFromProvider / filledByManual / stillMissing /
providerNotConfigured / providerNotSupported / conflicts / manualRequiredDomains). See
`REAL_PRE_MATCH_PROVIDER_INTEGRATION.md`, `MANUAL_INTELLIGENCE_INTAKE.md`,
`PRE_MATCH_DATA_MERGE.md`.

## B42 — bridge-aware acquisition

Acquisition Report V2 now reports `providerMappingStatus`, `providerMappingConfidence`,
`blockedByMissingMapping`, `blockedByAmbiguousMapping` and a `suggestedAction`
(`run_identity_resolution` | `confirm_mapping` | `use_manual_intake` |
`configure_provider`). The router consults the Provider Bridge before any external
per-fixture fetch and returns `blocked_missing_provider_mapping` /
`blocked_ambiguous_provider_mapping` when there is no confirmed mapping. See
`PROVIDER_BRIDGE.md`.

## B43 — Acquisition V3 (identity-driven)

`buildAcquisitionReportV3` + `runAcquisitionForFixtureV3`/`…TodayV3` add per-domain
unlock diagnostics (unlocked / missing mapping / ambiguous / provider not configured /
endpoint not implemented) so the operator knows whether the blocker is identity,
provider, or endpoint. See `PRE_MATCH_ACQUISITION_V3.md` + `DOMAIN_UNLOCK_STATUS.md`.
