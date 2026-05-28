# Matches Page Temporal Integrity

## Architecture

```
Provider data (ESPN / football-data / API-Football)
  → normalize / project to FDMatch
  → dedupeMatches (preserves best status via getStatusPrecedence)
  → matches[] state
  → classifyMatch(match, now) → MatchClassification
  → buildMatchDisplayModel(match, now) → MatchDisplayModel
  → Renderers (AgendaRow, HighlightCard, CompactRow, Sidebar)
```

## Classification (matchesClassification.ts)

Single source of truth for match status. Returns `MatchClassification` with boolean flags.

### Status categories

| Provider status | Canonical | isUpcoming | isFinished | isLive |
|----------------|-----------|-----------|-----------|--------|
| TIMED/SCHEDULED (future) | scheduled | true | false | false |
| TIMED (0-10min past) | starting_soon | true | false | false |
| TIMED (10-30min past) | stale_scheduled | false | false | false |
| TIMED (30min+ past) | stale_scheduled | false | false | false |
| FT/AET/PEN/FINISHED | finished | false | true | false |
| LIVE/1H/2H/HT | live/halftime | false | false | true |
| POSTPONED/PST | delayed | false | false | false |
| CANCELLED/CANC | cancelled | false | false | false |

### Temporal windows

- `STARTING_SOON_MINUTES = 60` — future kickoff within 60min
- `GRACE_MINUTES = 10` — past kickoff, still acceptable
- `STALE_AFTER_MINUTES = 30` — past kickoff, definitely stale

## Display Model (buildMatchDisplayModel.ts)

Determines what to SHOW in the UI. No component should decide status presentation independently.

### Status keys

| statusKey | primaryLabel | secondaryLabel | Badge |
|-----------|-------------|---------------|-------|
| live | "Ao vivo" / "Intervalo" | null | green |
| finished | "FIM" | null | slate |
| upcoming | "19:00" | null | slate |
| starting_soon | "19:00" | "Em breve" | amber |
| awaiting_kickoff | "Aguardando início" | "19:00" | amber |
| stale_pending | "Aguardando atualização" | "Prev. 19:00" | amber |
| stale_strong | "Status pendente" | "Prev. 19:00" | amber |
| delayed | "Adiado" | null | slate |
| cancelled | "Cancelado" | null | slate |

### Rules

1. `stale_scheduled` NEVER shows kickoff time as primary status
2. `stale_scheduled` NEVER appears in "Próximos" or "Em breve" filters
3. `stale_scheduled` appears in "Todos" with honest badge
4. Only `live` and `finished` have reliable scores
5. Components must NOT call `mapStatus`, `formatMatchTime`, or `classifyMatch` directly for display

## Dedupe (matchesDedup.ts)

Uses `getStatusPrecedence()` to ensure:
- finished (600) > live (500) > delayed (350) > scheduled (300)
- Logos from visual-rich provider are preserved
- Status from most-advanced provider is preserved
- Score from finished/live provider is preserved

## Auto-refresh

When stale/pending matches exist, page auto-refreshes every 45s (while visible).

## How to debug

1. Check `classifyMatch(match, now)` output in console
2. Check `buildMatchDisplayModel(match, now)` output
3. DEV warnings fire if stale_scheduled shows kickoff as primary
4. Look for `[GoalSense][DisplayModel]` warnings in console
