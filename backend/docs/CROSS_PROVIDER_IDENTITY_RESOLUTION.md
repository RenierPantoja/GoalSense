# Cross-Provider Fixture Identity Resolution (B42)

Safely maps ESPN fixtures to an external provider's fixtures (API-Football) so
fixture-scoped data can be unlocked — without guessing ids, without name-only
confidence, without auto-confirming ambiguity.

## Why ids don't match

ESPN and API-Football are independent id spaces; we store only ESPN ids. See
`CROSS_PROVIDER_IDENTITY_AUDIT.md`.

## Pure matching (`identity/providerIdentity.util.ts`)

`normalizeTeamName` / `normalizeCompetitionName` / `normalizeCountryName` (strip accents
+ noise, keep identity), `compareTeamNames` / `compareCompetitionNames` (Dice over
tokens), `calculateKickoffDelta`, `detectSwappedHomeAway`, `scoreFixtureCandidate`
(weighted: teams 50%, same date 20%, kickoff proximity, competition, country),
`classifyCandidateScore` (caps: name-only never high; swapped/high-delta/competition
conflict downgrade high→medium), `buildFixtureIdentityFingerprint`. Fully unit-tested by
`smokeCrossProviderIdentityResolution.mjs`.

## Resolution (`identity/fixtureIdentityResolution.service.ts`)

`buildCandidatesForToday` / `buildCandidatesForFixture` / `resolveFixtureIdentity`
compare ESPN same-day fixtures vs API-Football `today_fixtures` (only if configured).
Auto-confirm ONLY when: high band + `FIXTURE_IDENTITY_AUTO_CONFIRM` + same date +
not swapped + kickoff delta ≤ max + no competing close candidate. Multiple close /
swapped / medium → `ambiguous`. A previously `rejected` fingerprint is not re-confirmed.
`confirmMapping` / `rejectMapping` are explicit + audited.

## Persistence

`providerEntityMappings`, `teamAliases`, `competitionAliases`,
`fixtureIdentityResolutionRuns` (Firebase). Noop-safe.

## Env

| flag | default |
|---|---|
| `ENABLE_FIXTURE_IDENTITY_RESOLUTION` | `true` |
| `FIXTURE_IDENTITY_AUTO_CONFIRM` | `true` |
| `FIXTURE_IDENTITY_HIGH_CONFIDENCE_THRESHOLD` | `0.88` |
| `FIXTURE_IDENTITY_MEDIUM_CONFIDENCE_THRESHOLD` | `0.70` |
| `FIXTURE_IDENTITY_MAX_KICKOFF_DELTA_MINUTES` | `120` |
| `FIXTURE_IDENTITY_REQUIRE_COMPETITION_MATCH` | `false` |

## Honesty rules

No guessed ids. Name-only never high. Ambiguous never auto-confirms. Rejected not
reused unless the fingerprint changes. `inferred` never pretends to be confirmed. No
odds; provider without env is never called.

## B43 — entity identity (teams/competitions/seasons)

Confirmed fixture mappings now feed an entity derivation engine that maps ESPN teams →
API-Football team ids and ESPN competitions → API league ids/seasons (evidence from
fixture co-occurrence, never name-only). See `TEAM_COMPETITION_IDENTITY_MAPPING.md`,
`DOMAIN_UNLOCK_STATUS.md`.
