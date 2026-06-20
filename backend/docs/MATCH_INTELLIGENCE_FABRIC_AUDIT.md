# Match Intelligence Fabric — Initial Audit

Honest map of what the GoalSense **backend** (Fastify, local) actually collects today,
before building any fundamental analysis. The rule: do not implement deep analysis on
data that does not exist. Where a domain is absent, the fabric must say so
(`unavailable` / `not_collected_yet` / `provider_not_supported`), never invent it.

## TL;DR

The backend ingests **ESPN only**, in real time, via `src/providers/espn.provider.ts`:
- score, status, minute, penalties (scoreboard `all/scoreboard`);
- when summary enrichment is on and within budget: team‑level stats (possession,
  shots, shots on target, corners, yellow/red cards, fouls, offsides, saves) and
  timed events (goal, own_goal, penalty_scored/missed, yellow/red card, substitution,
  offside, goal_disallowed, var) plus penalty shootout sequences.

Everything is stored as JSON blobs (`statsJson`, `eventsJson`) on `LiveSnapshot`.
There are **no** structured columns for lineups, squads, injuries, suspensions,
standings, form, head‑to‑head, referee, or venue. Those domains are **not collected**
by the backend. Some (injuries, standings, topscorers, venue, referee) exist only as
repo‑root `api/` edge functions consumed by the frontend — a completely separate path
from the Fastify ingestion pipeline.

## Data domains — what exists vs. what is absent

| Domain | Backend status | Where (if any) | Notes |
|---|---|---|---|
| fixtures | **available** | espn.provider `fetchEspnLiveFixtures` | live + recently finished, "all" feed |
| live_score | **available** | espn scoreboard | score/minute/status |
| live_events | **available** (live only) | espn summary `extractEspnTimedEvents` | goals, cards, subs, var, offside |
| live_stats | **partial** | espn summary `extractEspnStats` | team‑level only, enrichment‑gated/budgeted |
| cards (yellow/red) | **partial** | stats + events | team totals + card events |
| substitutions | **partial** | event type only | no player in/out modeling |
| player_stats | **minimal** | event `playerName` only | no per‑player structures |
| lineups (probable/confirmed) | **absent** | — | `not_collected_yet` |
| squads | **absent** | — | — |
| injuries | **absent in backend** | edge `api/misc?fn=api-football-injuries` | provider‑gated edge only |
| suspensions | **absent** | — | — |
| standings / table_context | **absent in backend** | edge `api/api-football-standings` | — |
| team_form / recent_form | **absent** | — | derivable from internal memory only |
| head_to_head | **absent** | — | derivable from internal history only |
| referee | **absent in backend** | edge `api/api-football-fixture` | — |
| venue | **absent in backend** | edge `api/api-football-fixture` | — |
| competition_stage / importance | **heuristic only** | `CanonicalCompetitionContext` (name string) | not provider data |
| knockout_context / aggregate | **absent** | — | — |
| post_match_stats | **partial** | final snapshot stats/events | team‑level |
| weather / travel / rest_days | **absent** | — | — |
| market / odds | **not_used** (by design) | odds module OFF | never used this phase |

The honest seam already exists at
`src/modules/intelligence/utils/dataAvailability.util.ts` →
`buildLiveAvailabilityMap`, which marks preMatch, headToHead, standings, lineups,
injuries, odds as `not_collected_yet` and dangerousAttacks as
`provider_not_supported`. The fabric extends this discipline.

## Internal memory the fabric CAN read (real, persisted under Firebase)

`IntelligenceRepository` (see `src/repositories/contracts.ts`) exposes the GoalSense's
own history — this is the fabric's richest honest source:
- Signal Ledger: `listAllSignalLedgerEntries`, `listSignalLedgerEntries`, by alert id.
- Alert Outcomes: `listAllAlertOutcomes`, `listAlertOutcomesByPattern`, by alert id.
- Failure Analyses: `listAllFailureAnalyses`, by pattern/alert.
- Auto Opportunities: `listAutoOpportunities`, `listAutoOpportunitiesByFixture`, outcome summaries.
- Learning profiles: pattern/competition/**team** learning profiles, signal context stats.
- Evidence lineage: references by fixture/snapshot/alert/opportunity.
- Live validation sessions + record index (B37–B39).
- Fixtures + live snapshots: `listLive`, `findLatestByFixture`, `findAfter`, `listRecent`.

**Persistence caveat:** under the default `prisma` provider, `intelligence` is the
`NoopIntelligenceRepository` (returns empty / echoes input). Historical memory is only
persisted under `PERSISTENCE_PROVIDER=firebase`. The fabric must therefore treat empty
memory as `insufficient_history`, never as a negative finding.

## Guards / budgets the fabric must respect

- `LOCAL_MAX_LIVE_FIXTURES` (10) caps the working set.
- `providerUsageGuard` / `livePipelineGuard` (`guardProviderCall`) — any provider call
  the fabric makes must go through the budget guard; blocked = limitation, not failure.
- `LOCAL_OPS_GUARD_MODE` observe by default.

## Auth / routes

Routes register under `/api` in `server.ts`; `requirePermission({ permission })` gates
mutating endpoints (operator+ via `run:scan`). `req.auth.user.role` drives access.

## Conclusion for the fabric design

1. The fabric is a **structure for honest deep analysis**, not a data fabricator.
2. Real signal today: ESPN live state + team stats/events + the GoalSense's own
   historical memory (under Firebase).
3. Pre‑match richness (lineups, injuries, suspensions, standings, H2H, referee) is
   **absent** and must be surfaced as such — which is itself a first‑class decision
   input (e.g. "lineup unavailable 2h before → wait_for_lineup").
4. No odds, no Telegram, no auto‑bet, no stake. Auto‑create stays OFF. Precheck ships
   in **observe** mode and never blocks a real alert.
