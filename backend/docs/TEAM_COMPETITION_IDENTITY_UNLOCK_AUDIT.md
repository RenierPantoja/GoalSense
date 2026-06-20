# Team / Competition Identity Unlock — Audit (B43)

Extends B42 fixture identity to teams/competitions/seasons so domains needing
teamId/leagueId/season can be unlocked. Rule unchanged: never guess ids, never confirm
an entity by name alone, ambiguous needs the operator.

## Entities that need mapping

- ESPN team → API-Football team id (squads, injuries, suspensions, H2H, team_form).
- ESPN competition → API-Football league id (standings, competition_context).
- season (per competition) → API-Football league season (standings, injuries).

## What can be DERIVED from confirmed fixture mappings (B42)

The API-Football `today_fixtures` response (`/fixtures?date=`, already wired) includes,
per fixture: `teams.home.id`, `teams.away.id`, `league.id`, `league.season`,
`league.country`. So for each CONFIRMED ESPN↔API fixture mapping we can read the matched
API fixture (by id, from the same-day list) and pair:
- ESPN homeName → API home team id; ESPN awayName → API away team id (only when the
  mapping is NOT swapped);
- ESPN competition → API league id + season + country.

Accumulating across multiple confirmed fixtures gives evidence: same ESPN team → same
API id in ≥ N fixtures ⇒ may auto-confirm; same ESPN team → different API ids ⇒
ambiguous. This is **evidence-derived**, never name-only.

## What requires manual confirmation

- Any entity with a single confirmed fixture (below the min-fixtures threshold) →
  `candidate` (operator confirms).
- Any conflicting derivation (multiple API ids) → `ambiguous` (operator resolves).
- Competition with conflicting country/season.

## Domains unlocked by which mapping

| Domain | Needs | API-Football endpoint (in repo?) |
|---|---|---|
| confirmed_lineups / fixture_details / post_match_stats | fixture mapping (B42) | yes (`/fixtures*`) |
| standings / competition_context | league mapping + season | yes (`/standings?league=&season=`) |
| injuries | team mapping (+ season) | yes (`/injuries?team=&season=`) |
| suspensions | team mapping (+ season) | **not documented** in repo → blocked |
| head_to_head | two team mappings | **not documented** in repo → blocked |
| squads | team mapping | **not documented** in repo → blocked |
| team_form | team mapping or fixture history | **not documented** → blocked |

So B43 can really unlock **standings** (league+season) and **injuries** (team+season)
when mappings exist. suspensions/H2H/squads/team_form stay
`not_implemented_with_docs_needed` (no guessing) and fall back to manual intake.

## Homonym risk & false positives

Same team name in different countries/divisions; reserve/youth teams. Mitigation:
derivation pairs only via CONFIRMED, non-swapped fixture mappings (real co-occurrence),
requires ≥ N fixtures for auto-confirm, and flags any divergence as `ambiguous`.

## Conclusion

Derive team/league/season mappings from confirmed fixture mappings (evidence), persist
them, expose Provider Bridge V2 (`getDomainUnlockStatus`), and only unlock standings +
injuries (documented endpoints) when mappings are confirmed. Everything else stays
honestly blocked or manual.
