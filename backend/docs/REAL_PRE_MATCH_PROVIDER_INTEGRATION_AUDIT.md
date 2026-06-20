# Real Pre-Match Provider Integration — Audit (B41)

Reality check before wiring any real fetch. The rule holds: never guess an endpoint,
never call a provider without env, never fabricate. Where real integration is blocked,
keep the honest skeleton and explain the blocker; provide a manual intake path instead.

## Providers in code + env

| Provider | Backend env | Base URL | Real fetch feasible now? |
|---|---|---|---|
| ESPN | `ESPN_BASE_URL` (set) | public, no key | **yes** (already wired: today fixtures + live) |
| API-Football | `API_FOOTBALL_KEY` (declared, empty) | `v3.football.api-sports.io` (used by repo edge fns) | **partially** — see blocker below |
| football-data.org | `FOOTBALL_DATA_KEY` (declared, empty) | `api.football-data.org/v4` (repo edge fns) | partially (no injuries/lineups) |
| SportMonks | none | none | no (no env, no code) |
| manual local | n/a | n/a | **yes** (operator intake) |

## The critical blocker: ID mapping

The backend persists fixtures **sourced from ESPN** (`Fixture.provider='espn'`,
`providerFixtureId` = ESPN event id). API-Football / football-data identify fixtures and
teams by **their own** ids. There is no stored mapping from an ESPN fixture to an
API-Football fixture/team id. Therefore **fixture-scoped** API-Football calls
(injuries, lineups, statistics, standings, H2H) cannot be safely wired to our fixtures
without a fragile name+date resolution step — which would risk wrong-match data. We do
not guess that.

What IS safe to fetch with only a key (no ID mapping):
- API-Football `today_fixtures` by date (`/fixtures?date=YYYY-MM-DD`) — its own ids,
  informational. This is the one real call we wire (documented, used in repo edge fns).

## Domains: critical vs feasible now

| Domain | Critical | Real now | Path |
|---|---|---|---|
| today_fixtures | yes | ESPN (wired) + API-Football (date, if key) | provider |
| confirmed/probable lineups | yes | blocked (ID mapping) | **manual intake** |
| injuries / suspensions | yes | blocked (ID mapping) | **manual intake** |
| standings / team_form | high | blocked (ID mapping) | manual context note |
| head_to_head | medium | internal memory (B39) | provider skeleton |
| referee / venue / competition_stage | low/medium | blocked | **manual intake** |
| live score/stats/events | yes | ESPN (wired) | provider |

## What B41 implements (honest, safe)

1. `providerIntegrationReadiness.service.ts` + `GET /providers/readiness` — says exactly
   why each domain is/ isn't arriving (adapterStatus real/skeleton/not_configured,
   missing env, ID-mapping blocker, next steps).
2. Real API-Football adapter: `today_fixtures` by date when `API_FOOTBALL_KEY` +
   `ENABLE_PROVIDER_API_FOOTBALL`; all fixture-scoped domains return `unavailable` with
   the explicit ID-mapping limitation (NOT a blanket skeleton, NOT guessed).
3. ESPN adapter hardened: explicit `provider_not_supported` for the domains it never
   covers.
4. **Manual Intelligence Intake** — the real usable path now: operator-entered lineups/
   injuries/suspensions/context with `sourceType` + `reliability` + audit, never
   masquerading as a provider.
5. Merge engine (provider + manual) with conflict detection + `requires_operator_review`.
6. Readiness V3 + Precheck V3 + Acquisition Runner V2 that consume provider + manual +
   conflicts. Observe-first; nothing blocks a real alert; no score/confidence changes.

## What stays blocked (real limitations)

- API-Football fixture-scoped real data (injuries/lineups/standings/H2H) until an
  ESPN→API-Football id mapping exists. Use manual intake meanwhile.
- football-data.org and SportMonks remain honest skeletons (football-data lacks the
  critical domains; SportMonks has no env/code).
- No odds, ever.
