# Pre-Match Data Merge (B41)

`preMatchDataMerge.service.ts` consolidates provider snapshots + manual records per
domain WITHOUT lying.

## Precedence

1. usable provider (available / available_empty_confirmed / partial)
2. high-reliability official manual (official_club / official_competition)
3. partial provider
4. medium manual (journalist_report / broadcast)
5. low/unknown manual → caution/note only
6. unknown/unavailable

## Conflicts

A **usable provider + a high-reliability manual** asserting the same domain is a
conflict → it is NOT resolved silently. The domain is marked `conflict` +
`requiresOperatorReview`, surfaced in `conflicts[]` and `requiresReview`, and shown in
the Backstage. Manual data keeps its own source tag in `sourceBreakdown` (trusted vs
weak sources).

## Output — `PreMatchMergeResult`

`domains[]` (each: `chosenSource` provider/manual/none, `chosenReliability`,
`providerAvailability`, `manualCount`, `conflict`, `requiresOperatorReview`,
`trustedSources`, `weakSources`, `limitations`), `conflicts[]`, `trustedSources`,
`weakSources`, `requiresReview`, `limitations`.

Merged domains: confirmed/probable lineups, injuries, suspensions, squads, standings,
H2H, competition_context.

## Honesty rules

No silent choice on conflict. A domain with no provider and no manual is `none` with a
"sem dado" limitation — never "no injuries"/"no suspensions". `mergeDomain` is a pure
function covered by `smokeRealPreMatchProviderIntegration.mjs`.
