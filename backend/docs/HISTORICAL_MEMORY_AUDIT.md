# Historical Memory — Reality Map (B45 / Bloco 2)

Audit of the internal memory sources before building fundamental club/matchup/context
memory. Rule: small samples never become strong conclusions; old/different-context
history is down-weighted; absence is never a negative datum.

## Internal memory the GoalSense already has (under Firebase)

| Source | Repo reads | Aggregatable by |
|---|---|---|
| Signal Ledger | `listAllSignalLedgerEntries`, by pattern/fixture | team, competition, pattern, context |
| Alert Outcomes | `listAllAlertOutcomes`, by pattern | team, pattern, result |
| Auto Opportunities | `listAutoOpportunities`, by fixture | team, competition, type |
| Auto Alert Policy Evaluations | `listAutoAlertPolicyEvaluations` | pattern, decision |
| Learning profiles (B13) | team/competition/pattern profiles | team, competition, pattern |
| Backtest/Replay (B14/B35/B36) | runs + signal results | pattern, fixture |
| Live Validation Sessions (B37) | sessions/events/reports | session/fixture |
| Evidence Lineage (B33) | references by fixture/alert/opportunity | fixture |
| Pre-Match Domain Snapshots (B40–B44) | by fixture/domain | fixture (provider/manual) |
| Manual Intelligence (B41) | by fixture/team | fixture (manual) |
| Post-Match Explanation (B39/B44) | derived | fixture |

The B39 `teamMemoryEngine.buildTeamMemory(teamName)` already aggregates ledger+outcomes
per team (confirmed/partial/failed/unknown + reasons), and
`headToHeadIntelligence.buildHeadToHead` reads internal H2H. B45 builds on these.

## What can be aggregated

- **By team**: signal ledger + outcomes filtered by home/away name; manual + provider
  snapshots per fixture.
- **By matchup**: ledger entries where both teams appear (internal H2H).
- **By competition**: ledger `leagueName`; learning competition profiles.
- **By context**: minute window, competition type, importance, data quality (ledger
  `matchContext` + learning context stats).

## Provider vs internal

- **internalMemory**: what the GoalSense itself observed (ledger/outcomes/opportunities/
  sessions). Always available under Firebase; honest and owned.
- **providerMemory**: external pre-match snapshots (standings/injuries/etc.) — only when
  provider configured + mappings confirmed (B44). Kept SEPARATE from internal memory.

## Low-sample / overfitting risks

- Most teams will have tiny internal samples early → must return `insufficient_history`,
  never a tendency.
- H2H from internal ledger is usually 0–2 matches → `insufficient_data`, never a tabu.
- Old entries (> recency window) down-weighted; different competition/home-away
  down-weighted.
- No ML; deterministic aggregation only; reliability is data-confidence, not a win
  probability.

## Persistence caveat

Under Prisma/Noop the intelligence repo is Noop → all memory reads return empty →
`insufficient_history` (honest, not negative). Memory persists only under
`PERSISTENCE_PROVIDER=firebase`.

## Conclusion

Build a pure **Sample Quality Engine** first (strong/usable/weak/insufficient/
misleading_risk), then team/matchup/competition/context/taboo/similar-scenario profiles
that reuse the internal sources, each carrying sample + reliability + limitations. Memory
is advisory; it never changes score/confidence/patterns and the precheck stays observe.
