# Player Importance Foundation (B40)

`playerImportance.service.ts` begins to evaluate the impact of a player's absence/return
— honestly. The backend has no squad/minutes/goals data, so without evidence
`importanceLevel = unknown`. We never call a player "key" without evidence.

## Output — `PlayerImportanceProfile`

`playerId`, `playerName`, `teamId`, `position`,
`importanceLevel` (`key` | `regular_starter` | `rotation` | `bench` | `unknown`),
`evidence[]`, `dataQuality`, `limitations[]`.

## Sources (when available)

Recurring lineups, minutes played, goals/assists, cards/suspensions, position, prior
presence, and the GoalSense's internal memory. Today only operator/provider-entered
confirmed-lineup snapshots can populate names — and even then importance stays `unknown`
until metrics exist.

## Honesty rules

No data → `unknown`. No invented statistics. Goalkeeper/defender/attacker may carry
different impact, but that differentiation requires real data we do not yet collect.
This foundation is the integration point for future squad/minutes data.
