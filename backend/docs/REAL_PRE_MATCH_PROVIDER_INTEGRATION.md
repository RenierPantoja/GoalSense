# Real Pre-Match Provider Integration (B41)

Turns the B40 architecture into real, usable acquisition where possible, and an
auditable manual intake everywhere else. Never guesses an endpoint, never calls a
provider without env, never fabricates.

## Provider readiness

`providerIntegrationReadiness.service.ts` + `GET /providers/readiness` explains, per
provider: `configured`, `enabled`, `hasApiKey`, `hasBaseUrl`, `adapterStatus`
(`real` | `skeleton` | `not_configured` | `disabled` | `unsupported`),
`implementedDomains`, `missingDomains`, `blockedDomains`, `missingEnvVars`, `nextSteps`,
`safetyWarnings`. No secrets exposed (presence booleans only).

## What is REAL now

- **ESPN** (`espnFootballProvider.adapter.ts`): today_fixtures + live + post from
  already-ingested data. Explicit `provider_not_supported` for injuries/lineups/
  standings/H2H/referee/venue/squad.
- **API-Football** (`apiFootballProvider.adapter.ts`): real, env-gated. Performs ONE
  safe, documented, ID-free call — today fixtures by date (`/fixtures?date=`). All
  fixture-scoped domains return `unavailable` with the explicit **ID-mapping** blocker
  (our fixtures are ESPN-sourced; no API-Football fixture/team id). We do not guess a
  name+date resolution.

## What stays skeleton / blocked

- football-data.org and SportMonks remain honest skeletons (no critical-domain value /
  no env+code).
- API-Football fixture-scoped data is blocked on the ESPN→API-Football id mapping.

## Env

| flag | default |
|---|---|
| `API_FOOTBALL_KEY` / `ENABLE_PROVIDER_API_FOOTBALL` | empty / false |
| `API_FOOTBALL_BASE_URL` | `https://v3.football.api-sports.io` |
| `FOOTBALL_DATA_KEY` / `ENABLE_PROVIDER_FOOTBALL_DATA` | empty / false |
| `FOOTBALL_DATA_BASE_URL` | `https://api.football-data.org/v4` |
| `SPORTMONKS_API_KEY` / `ENABLE_PROVIDER_SPORTMONKS` | unset / false |
| `PROVIDER_FETCH_TIMEOUT_MS` | `8000` |

## Honesty rules

Provider without env is never called. Endpoint never guessed. Provider error never
becomes an empty list. Confirmed empty → `available_empty_confirmed`. Missing field →
`unavailable`/`partial`. No odds, no token logging, no giant raw payloads persisted.

## Real limitation

The richest pre-match domains require either an ESPN→provider id mapping (not built, to
avoid wrong-match data) or operator **manual intake** (see `MANUAL_INTELLIGENCE_INTAKE.md`).

## B42 — id mapping resolved (Provider Bridge)

The B41 ID-mapping blocker is addressed by the Cross-Provider Identity Resolution engine
+ Provider Bridge. With a CONFIRMED ESPN→API-Football fixture mapping, the adapter
unlocks documented per-fixture calls — `fixture_details` (`/fixtures?id=`),
`post_match_stats` (`/fixtures/statistics?fixture=`) and `confirmed_lineups`
(`/fixtures/lineups?fixture=`). injuries/suspensions/standings/H2H stay
`not_implemented_with_docs_needed` (need team/league id mappings; no guessing). See
`CROSS_PROVIDER_IDENTITY_RESOLUTION.md` + `PROVIDER_BRIDGE.md`.

## B43 — standings + injuries unlocked via entity mappings

With CONFIRMED league+season and team mappings, the API-Football adapter now performs
documented `standings` (`/standings?league=&season=`) and `injuries`
(`/injuries?team=&season=`) calls. suspensions/H2H/squads/team_form stay
`not_implemented_with_docs_needed` (no documented endpoint in the project) → manual
intake. See `TEAM_COMPETITION_IDENTITY_MAPPING.md`, `DOMAIN_UNLOCK_STATUS.md`.
