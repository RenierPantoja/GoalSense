# Manual Intelligence Intake (B41)

Lets the operator enter **real** pre-match data (lineups/injuries/suspensions/context/
referee/venue/stage/notes) obtained from a trusted external source, while providers are
not configured. Manual data is ALWAYS tagged and NEVER pretends to be a provider. It is
not mock — it is operational data the operator vouches for.

## Record — `ManualIntelligenceRecord`

`id` (`mir_…`), `fixtureId`, `teamId`, `side`, `domain` (lineup/injury/suspension/squad/
context/referee/venue/competition_stage/note), `sourceType`
(`manual_operator` | `official_club` | `official_competition` | `journalist_report` |
`broadcast` | `other`), `sourceLabel`, `sourceUrl?`, `reliability`
(high/medium/low/unknown), `enteredBy`, `enteredAt`, `updatedAt`, `expiresAt`,
`payload`, `note`, `limitations`, `audit[]`.

Default reliability by source: official_club/official_competition → high;
journalist_report/broadcast → medium; manual_operator/other → unknown.

## Service + repo

`manualIntelligenceIntake.service.ts`: create/update/delete, list by fixture/team,
`explainManualRecordUsage`. Repo methods `saveManualIntelligenceRecord` /
`get` / `list` / `update` / `deleteManualIntelligenceRecord` (Firebase collection
`manualIntelligenceRecords`; delete is a soft `deleted:true`). Noop-safe.

## API + auth

`GET /fixtures/:id/manual-records` (read), `POST /fixtures/:id/manual-records`
(operator+), `PATCH /manual-records/:id` (operator+), `DELETE /manual-records/:id`
(admin/owner — `dangerous`). Every write records an admin audit.

## Rules

Manual never overwrites a provider — it complements (see `PRE_MATCH_DATA_MERGE.md`).
A payload that simulates a provider is not accepted (sourceType is mandatory). Audit is
mandatory. URL optional. Manual data carries a `manual` badge in the UI.

## B42 note

Manual intake remains the path for domains still blocked after identity resolution
(injuries/suspensions/standings/H2H need team/league id mappings, kept
`not_implemented_with_docs_needed`). Confirmed fixture mappings unlock
`fixture_details`/`post_match_stats`/`confirmed_lineups` from API-Football; everything
else stays manual. See `CROSS_PROVIDER_IDENTITY_RESOLUTION.md`.
