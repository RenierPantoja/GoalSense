# Cross-Provider Identity — Audit (B42)

Before matching anything, map the data we actually have. The rule: never guess an id,
never resolve an ambiguous fixture automatically, name-only is never high confidence.

## Primary provider vs external

- **Primary**: ESPN. The backend persists `Fixture` rows with `provider='espn'` and
  `providerFixtureId` = ESPN event id (fields: homeName, awayName, competition, status,
  startTime, canonicalKey). This is the spine of MatchDayScope and the fabric.
- **External**: API-Football (env-gated, real `today_fixtures` by date in B41),
  football-data.org / SportMonks (skeletons). These identify fixtures/teams/competitions
  by **their own** numeric ids.

## Why ids don't match

ESPN and API-Football are independent datasets with independent id spaces. We store only
ESPN ids. There is no shared key. So any fixture-scoped API-Football call
(fixture_details, lineups, injuries, statistics, H2H, standings) needs an API-Football
id we do not have — hence B41 left those blocked.

## Fields available to resolve identity safely

| Field | ESPN | API-Football today_fixtures | Use |
|---|---|---|---|
| date (day) | startTime | fixture.date | **required** for a strong candidate |
| kickoff time | startTime | fixture.date | small delta = strong |
| home team name | homeName | teams.home.name | high weight (normalized + alias) |
| away team name | awayName | teams.away.name | high weight |
| competition | competition (free text) | league.name + country | medium/high weight |
| country | — (not stored) | league.country | medium weight (when present) |
| season/round | — | league.season/round | medium weight |
| status | status | fixture.status.short | low weight |

## Ambiguous cases

- Two same-day fixtures with similar team names (tournaments, reserve teams).
- Home/away swapped between providers → strong warning, not auto-confirm.
- Kickoff delta > threshold (different day/time) → not high confidence.
- Conflicting competition when `FIXTURE_IDENTITY_REQUIRE_COMPETITION_MATCH=true`.
- Homonym teams without country/competition disambiguation.

## When auto-confirm is allowed

Only when: same date AND home/away compatible AND kickoff delta ≤
`FIXTURE_IDENTITY_MAX_KICKOFF_DELTA_MINUTES` AND confidence ≥
`FIXTURE_IDENTITY_HIGH_CONFIDENCE_THRESHOLD` AND no competing similar candidate AND no
critical competition conflict. Otherwise → `ambiguous` / `candidate`, requiring operator
review. Name similarity alone never reaches high confidence.

## When the operator is required

Any ambiguous match, any home/away swap, any high-delta kickoff, multiple close
candidates, or homonym risk. Confirm/reject are explicit and audited; a rejected mapping
is not auto-reused unless the fingerprint changes.

## Domains unlocked after a CONFIRMED mapping

With an API-Football fixture id (from a confirmed fixture mapping) and documented
endpoints already used in the repo (`/fixtures?id=`, `/fixtures/statistics?fixture=`),
we can unlock `fixture_details` and `post_match_stats` and `confirmed_lineups`
(`/fixtures/lineups?fixture=`, official). `injuries`/`suspensions`/`standings`/`H2H`
additionally need team/league id mappings — kept `not_implemented_with_docs_needed`
(no guessing). Everything else stays manual intake.

## Conclusion

Build a pure, testable matching util (normalize + score + classify), persist confirmed
mappings + aliases, expose a Provider Bridge that only unblocks fetch on a CONFIRMED
mapping, and let the operator resolve ambiguity. No name-only confidence, no guessed
ids.
