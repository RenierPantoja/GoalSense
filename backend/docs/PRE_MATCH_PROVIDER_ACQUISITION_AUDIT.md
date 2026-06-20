# Pre-Match Provider Acquisition — Audit (B40)

Grounds the multi-provider pre-match acquisition layer in reality before writing any
adapter. Do not implement adapters blindly. The rule from B39 stands: never invent
data; absent ≠ zero; provider-not-supported and unavailable are first-class states.

## What pre-match data exists today (backend)

Almost none. The backend ingests **ESPN live only** (`src/providers/espn.provider.ts`):
score, status, minute, penalties, team-level stats (possession, shots, SOT, corners,
cards, fouls, offsides, saves) and timed events (goal, card, sub, var, offside). Stored
as JSON blobs on `LiveSnapshot`. The B39 fabric reads this + the GoalSense's own
internal memory (signal ledger, outcomes, learning profiles, under Firebase).

## What pre-match data does NOT exist (backend)

probable/confirmed lineups, squads, injuries, suspensions, bookable players, standings/
table, structured recent form, structured H2H, referee, venue, competition stage
(heuristic only from the name), knockout/aggregate context, and per-player impact. B39
surfaces all of these honestly as `unavailable` / `not_collected_yet` /
`provider_not_supported`.

## Providers the code already knows

| Provider | Where | Backend-wired? | Pre-match domains |
|---|---|---|---|
| ESPN | `src/providers/espn.provider.ts` | **yes** (live ingestion) | today fixtures, live score/stats/events. No lineups/injuries/standings. |
| API-Football | repo-root `api/` edge fns (`api-football-*`, `misc?fn=api-football-injuries/topscorers`) | **no** (frontend serverless only) | fixtures, statistics, events, standings, injuries, topscorers, venue, referee — but NOT in the Fastify backend |
| football-data.org | repo-root `api/football-data-*` edge fns | **no** | competitions, matches |
| thesportsdb | `api/misc` (team badge/lookup) | **no** | team metadata only |
| scorebat | `api/scorebat-videos` | **no** | highlight videos |

## Env vars already present

- `API_FOOTBALL_KEY` — declared in `env.ts`, **not used** by backend ingestion.
- `FOOTBALL_DATA_KEY` — declared, **not used** by backend.
- `ESPN_BASE_URL` — used (live).
- No SportMonks env. Edge functions use `API_FOOTBALL_KEYS`/`API_FOOTBALL_BASE_URL`,
  `FOOTBALL_DATA_API_KEY`/`FOOTBALL_DATA_BASE_URL` (process.env on Vercel, not backend).

## Indispensable vs optional domains (for fundamental analysis)

| Domain | Tier | Notes |
|---|---|---|
| today_fixtures | indispensable | ESPN already provides |
| confirmed_lineups | indispensable (near kickoff) | nobody wired in backend |
| injuries / suspensions | indispensable | edge-only (api-football) |
| standings / table_context | high | edge-only |
| team_form | high | derivable from internal memory + standings |
| head_to_head | medium | internal memory only today |
| probable_lineups | medium | api-football pre-match |
| squads | medium | api-football |
| referee / venue | low | edge-only |
| competition_context | medium | heuristic today |
| odds / market | **not_used** | never, by product design |

## Cost / cadence

- Low-cost, today-only: today_fixtures (ESPN, already polled).
- Pre-match, today-only: standings, form, H2H, squads → fetch at most once at T-24h and
  refresh sparingly.
- Time-critical: injuries/suspensions (T-6h refresh), probable/confirmed lineups
  (T-90/T-60/T-15) — only for fixtures selected by MatchDayScope, bounded by
  `LOCAL_MAX_LIVE_FIXTURES` and the provider budget guard.

## Conclusion for B40 design

1. Build the multi-provider **registry + domain router** so acquisition is by
   capability, not by a fixed provider.
2. Ship **honest skeleton adapters** for API-Football / SportMonks / football-data that
   report `provider_not_configured` when env is missing — never call a provider without
   credentials, never fabricate a response, never scrape, never use odds.
3. ESPN remains the only truly wired source (today fixtures + live). Everything else is
   `provider_not_configured` until the operator supplies credentials.
4. Add a temporal **acquisition planner/runner** (T-24h … T-15min … live … post),
   manual-first, scheduler off by default, budget-guarded.
5. Persist `PreMatchDomainSnapshot` + `PreMatchAcquisitionRun` (Firebase; Noop-safe)
   with `fetchedAt`/`freshness`/`availability`/`expiresAt`.
6. A `LineupWindowEngine` manages the critical lineup moment (wait / refresh / impact).
7. Everything feeds the Match Intelligence Package V2 + Readiness V2 + Precheck V2 +
   Post-Match V2. No score/confidence/pattern/counter/result changes. Precheck stays
   observe-first and never blocks a real alert.
