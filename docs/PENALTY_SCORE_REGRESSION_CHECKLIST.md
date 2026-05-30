# Penalty Score Regression Checklist

Run this checklist when modifying any penalty-related code.

## Data Model
- [ ] `penaltyScore` field exists on `LiveFixture` (optional)
- [ ] `penaltyScore` is separate from regular `score`
- [ ] `PenaltyShootoutEvent` type has: sequence, teamSide, outcome, playerName

## Extraction
- [ ] ESPN function extracts `shootoutScore` from competitors
- [ ] Live Radar extracts `penaltyScore` from ESPN summary
- [ ] Live Radar extracts `shootoutEvents` when `isPenaltyShootout`
- [ ] Match Detail extracts penalty data from ESPN summary

## Cache
- [ ] `updatePenaltyScoreCache` never regresses (total must be ≥ existing)
- [ ] `reconcileAllPenaltyScores` called in `getLiveFixtures()`
- [ ] Cache entries expire after 5 minutes
- [ ] `reconcilePenaltyScores` picks highest total

## Event-Derived Score
- [ ] `buildPenaltyScoreFromEvents` only counts `outcome === 'scored'`
- [ ] `missed` does NOT increment
- [ ] `saved` does NOT increment
- [ ] `post` does NOT increment
- [ ] `unknown` does NOT increment
- [ ] Events without `teamSide` are skipped
- [ ] Only used when `isPenaltyShootout(fixture)` is true

## Separation from Regular Score
- [ ] Shootout goals do NOT alter `fixture.score`
- [ ] Regular penalty (during game) does NOT enter `penaltyScore`
- [ ] `penalty_scored` during game alters regular score only
- [ ] `Global Goal Event Fast Sync` ignores shootout events for regular score

## UI
- [ ] Match Detail header shows penaltyScore when available
- [ ] Match Detail shows "Cobrança de pênaltis" badge during P
- [ ] PenaltyShootoutPanel renders during P/PEN
- [ ] Pressure graph shows microcopy "Pressão encerrada após prorrogação"
- [ ] Live Radar hero shows "Pênaltis" + penaltyScore
- [ ] Live Radar rows show "Pên." badge

## Command Center
- [ ] Gate 8 blocks all patterns during status P
- [ ] Auto-discovery blocks during status P
- [ ] Resolution engine uses `effectiveGoalsSince = 0` during P/PEN
- [ ] Shootout goals do NOT confirm offensive patterns

## Non-Regression
- [ ] penaltyScore 3-2 never goes back to 2-2
- [ ] Status P never regresses to ET without provider correction
- [ ] Status PEN preserves final penaltyScore
- [ ] Empty payload does NOT erase penaltyScore
- [ ] `pickBestFixture` preserves penaltyScore during merge

## Provider Fallbacks
- [ ] Status P without penaltyScore: shows "Cobrança de pênaltis" (honest)
- [ ] Status P without events: shows "Placar das cobranças indisponível"
- [ ] Status PEN without penaltyScore: shows "Encerrado (Pên.)" only
