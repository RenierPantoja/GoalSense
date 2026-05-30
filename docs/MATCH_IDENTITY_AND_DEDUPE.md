# Match Identity & Deduplication

## Problem

The same real match can appear multiple times in GoalSense because:
- ESPN's `/all/scoreboard` endpoint returns the same match from multiple league feeds
- Different providers use different team names (e.g., "Paris Saint-Germain" vs "PSG")
- Providers may report different statuses/minutes for the same match (one stale, one current)

## Canonical Match Identity

Every fixture is identified by a canonical key:

```
buildCanonicalMatchId(homeName, awayName, date) → "2026-05-30:psg:arsenal"
```

The key uses:
- `normalizeTeamName()` — strips accents, suffixes, and resolves aliases
- Date bucket (first 10 chars of ISO date)

## Team Name Aliases

Key aliases that prevent duplicates:

| Input | Normalized |
|-------|-----------|
| Paris Saint-Germain | psg |
| Paris Saint Germain | psg |
| Paris SG | psg |
| Paris S-G | psg |
| Manchester United FC | manchester united |
| Man United / Man Utd | manchester united |
| FC Internazionale / Inter Milan | inter milan |
| FC Barcelona / Barca | barcelona |

Full alias table in `src/features/providers/teamNameNormalizer.ts`.

## Deduplication Layers

### Layer 1: Intra-Provider (ESPN)

ESPN's `/all/scoreboard` can return the same match from multiple league groupings. `deduplicateIntraProvider()` catches these by canonical ID, keeping the version with the most advanced status/minute.

### Layer 2: Cross-Provider Merge (apiClient.ts)

When merging ESPN + football-data + API-Football:
1. ESPN fixtures added first (best logos)
2. football-data checked against canonical map + `teamsAreSame()` similarity
3. API-Football checked similarly, with score/minute merge if duplicate found

### Layer 3: Final Dedup Pass

After all providers are merged, `finalDeduplicateFixtures()` does a pairwise check using `teamsAreSame()` to catch any remaining duplicates that slipped through canonical ID differences (e.g., timezone edge cases in dates).

### Layer 4: MatchesPage Dedup

`matchesDedup.ts` provides additional dedup for the calendar view with its own alias table and richness scoring.

## Status Precedence

When two fixtures represent the same match, the one with the more advanced status wins:

| Status | Score |
|--------|-------|
| FT / AET / PEN | 100 |
| ET / BT / P | 90 |
| 2H / LIVE | 80 |
| HT | 70 |
| 1H | 60 |
| NS / TBD | 10 |

If status is equal, higher minute wins. If minute is equal, the one with logos wins.

## Stale Live Detection

A fixture is considered stale if:
- Status says "live" but minute hasn't advanced
- Another duplicate has a higher minute
- Kickoff was >120 min ago but still shows early minute

The `pickBestFixture()` function ensures the stale version never wins.

## PSG x Arsenal Case (Root Cause)

ESPN returned the same Champions League final twice from different league feeds within the `/all/scoreboard` endpoint. One had an updated minute (90'), the other was stale (45'). The intra-provider dedup now catches this by canonical ID and picks the version with the higher minute.

## Risks

- Conservative dedup: only merges when team names clearly match (similarity ≥ 0.7)
- Won't merge if both teams have very short/generic names
- Date tolerance is same-day only (no ±1 day fuzzy matching to avoid merging different legs)
- Providers can still delay status updates, but the best available version always wins
