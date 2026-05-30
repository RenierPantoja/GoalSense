# Match Detail UX Guide

## Visual Hierarchy

```
┌─────────────────────────────────────────┐
│  HEADER: Teams + Score + Status         │  ← Protagonist
│  [Home Logo] [Score] [Away Logo]        │
│  [Status/Minute] [PenaltyScore?]        │
│  [ScoreDebugBadge - advanced only]      │
├─────────────────────────────────────────┤
│  PENALTY PANEL (if P/PEN)               │  ← Only during shootout
├─────────────────────────────────────────┤
│  EXECUTIVE READ: Strategic summary      │  ← Quick understanding
│  Title + Summary + Bullets              │
├─────────────────────────────────────────┤
│  DIAGNOSTIC PANEL: Stats insights       │  ← Who's dominating
├─────────────────────────────────────────┤
│  PRESSURE GRAPH: Visual timeline        │  ← Match flow
├─────────────────────────────────────────┤
│  STATS: Circular comparison             │  ← Detailed metrics
├─────────────────────────────────────────┤
│  EVENTS/TIMELINE: Key moments           │  ← What happened
├─────────────────────────────────────────┤
│  COMMENTARY: Play-by-play               │  ← Detailed narration
├─────────────────────────────────────────┤
│  LINEUPS: Team sheets                   │  ← Squad info
└─────────────────────────────────────────┘
```

## Data Coverage States

### Full Coverage (Brasileirão, Champions, Premier League)
- Stats: possession, shots, on target, corners, cards
- Events: goals, cards, subs, shots, corners with minutes
- Commentary: play-by-play narration
- Pressure graph: rich with multiple event types

### Partial Coverage (Liga menor, amistoso)
- Stats: may have only possession or shots
- Events: may have only goals
- Commentary: may be empty
- Pressure graph: limited events, shows fallback

### Minimal Coverage (Liga muito pequena)
- Stats: empty
- Events: empty
- Commentary: empty
- Pressure graph: shows "Eventos não disponíveis"
- Only score/status/minute from scoreboard

## Fallback Messages

| Situation | Message |
|-----------|---------|
| No events for pressure graph | "Eventos minutados não disponíveis pelo provider." |
| No commentary | "Narração não fornecida pelo provider para esta partida." |
| No stats | Stats section hidden (no empty cards) |
| Penalty shootout | "Pressão encerrada após a prorrogação." |
| Provider limited | "Cobertura limitada para esta competição." |
| Penalty score unavailable | "Placar das cobranças indisponível pelo provider." |

## Principles

1. **Score is protagonist** — largest element, always visible
2. **Status is immediate** — user knows match state in <1 second
3. **Strategic read is honest** — only uses real data, never invents
4. **Fallbacks are elegant** — missing data looks intentional, not broken
5. **Advanced mode is separate** — technical info never pollutes normal UX
6. **Mobile-first** — everything works at 390px

## What NOT to Change (Core Stability)

- `mergeMatchData` logic
- `buildCanonicalLiveScore` logic
- `liveScoreCache` / `penaltyScoreCache`
- Polling intervals
- Provider parsing
- Command Center Precision Engine
- Global Goal Event Fast Sync
- Score non-regression rules
