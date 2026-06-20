# Critical Pre-Match Domain — Reality Map (B44 / Bloco 1)

Domain-by-domain reality before wiring acquisition. Rule unchanged: never guess an
endpoint, never call a provider without env, never turn absence into zero, candidate/
ambiguous mappings never unlock a critical fetch.

## Legend

- **endpoint documented** = used by the repo (`api/*` edge fns) or the existing backend
  adapter — safe to implement.
- **needs**: which ids must be resolved (via confirmed mappings) before a real call.

| Domain | Provider | Endpoint documented? | Needs | Status now |
|---|---|---|---|---|
| today_fixtures | ESPN, API-Football | yes (`/fixtures?date=`) | date | **implemented** |
| fixture_details | API-Football | yes (`/fixtures?id=`) | fixture mapping | **implemented** (B42) |
| post_match_stats | API-Football | yes (`/fixtures/statistics?fixture=`) | fixture mapping | **implemented** (B42) |
| confirmed_lineups | API-Football | yes (`/fixtures/lineups?fixture=`, official) | fixture mapping | **implemented** (B42) |
| standings | API-Football | yes (`/standings?league=&season=`) | league + season mapping | **implemented** (B43) |
| injuries | API-Football | yes (`/injuries?team=&season=`) | home+away team mapping | **implemented** (B43) |
| live_score / live_events / live_stats | ESPN | yes | — | **implemented** (live) |
| suspensions | API-Football | **no docs in repo** | team mapping | `not_implemented_with_docs_needed` |
| head_to_head | API-Football | **no docs in repo** | two team mappings | `not_implemented_with_docs_needed` |
| squads | API-Football | **no docs in repo** | team mapping | `not_implemented_with_docs_needed` |
| team_form | API-Football | **no docs in repo** | team mapping/history | `not_implemented_with_docs_needed` |
| probable_lineups | API-Football | **no docs in repo** | fixture mapping | `not_implemented_with_docs_needed` |
| competition_context | heuristic | — (name) | — | heuristic only |
| cards | ESPN (live) | partial | — | live stats only |
| player_stats | — | **no** | — | not collected (manual) |
| venue / referee | ESPN payload (if present) | partial | — | best-effort partial |

## Per-domain answers

- **Which provider can cover?** ESPN (live) + API-Football (pre-match, env-gated). No odds.
- **Which endpoint is documented?** Only the 6 marked implemented + ESPN live. Others
  are NOT documented in the project → `not_implemented_with_docs_needed` (no guessing).
- **Which ids?** fixture-scoped → confirmed fixture mapping; standings → league+season;
  injuries → both team mappings. (B42/B43 Provider Bridge resolves only CONFIRMED.)
- **Blocked by env?** Everything API-Football is blocked without `API_FOOTBALL_KEY` +
  `ENABLE_PROVIDER_API_FOOTBALL`.
- **Manual fillable?** lineups/injuries/suspensions/squads/context/venue/referee via the
  B41 manual intake (tagged manual, never provider).
- **Misinterpretation risk?** Treating provider error/empty as "no injuries/empty
  table". Mitigation: `available_empty_confirmed` only when the provider explicitly
  returns an empty list; otherwise `unavailable`/`partial`.

## What B44 unlocks now

Formalizes the above into a **Provider Endpoint Catalog** (single source of truth for
safe-to-call), a **Domain Unlock Matrix V2** (catalog + mappings + resolved/missing
ids + next action), an **Acquisition Runner V4** that orchestrates only `ready_to_fetch`
domains (never calls when blocked), and Readiness V5 / Precheck V5 / PostMatch V3 that
consume the matrix. No new provider endpoints are invented; the 6 documented ones become
catalog-governed.
