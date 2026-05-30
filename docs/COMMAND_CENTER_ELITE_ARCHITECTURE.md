# Command Center Elite Intelligence Architecture

## Mission

The Command Center is a **decision support tool based on evidence**, not a bet generator. It monitors live matches, applies user-configured patterns, validates signals with real data, and measures real performance. It reduces false positives, explains every signal, and never promises guaranteed outcomes.

## Current State (Frontend-Only)

### What Already Works

| Module | Status | Description |
|--------|--------|-------------|
| Pattern Evaluator | ✅ Complete | Evaluates conditions against live fixtures |
| Precision Engine | ✅ Complete | Hard gates, data quality caps, momentum validation |
| Momentum Window | ✅ Complete | Timed events, stats proxy, recency confidence |
| Resolution Engine | ✅ Complete | Type-based resolution, unknown ≠ failed |
| Performance Analytics | ✅ Complete | Reliability labels, rates, recommendations |
| Dry-Run | ✅ Complete | Read-only testing against live fixtures |
| Auto-Discovery | ✅ Complete | Precision-gated, rigor levels |
| Duplicate Guard | ✅ Complete | Content-aware, context-based |
| Pattern Studio | ✅ Complete | Custom + template patterns, wizard |
| Scanner | ✅ Complete | Signal states, data quality, momentum |
| Alerts | ✅ Complete | Temporal evidence, resolution tracking |
| Penalty Gates | ✅ Complete | Blocks patterns during shootout |

### Current Limitations (Frontend-Only)

- No background monitoring (requires browser open)
- No Telegram delivery
- No odds integration
- No pre-match historical data
- No server-side persistence
- No multi-user support
- History is localStorage only
- Performance depends on browser session

## Elite Architecture (Target)

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Current)                         │
│  Live Radar │ Match Detail │ Command Center │ Matches Page   │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket/SSE (future)
┌──────────────────────────▼──────────────────────────────────┐
│                    BACKEND (Future)                           │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Live Monitor │  │ Pattern Jobs │  │ Alert Delivery    │  │
│  │ (Workers)    │  │ (Scheduler)  │  │ (Telegram/Push)   │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                │                    │              │
│  ┌──────▼────────────────▼────────────────────▼──────────┐  │
│  │              Core Intelligence Engine                  │  │
│  │  Evaluator │ Precision │ Resolution │ Calibration     │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                                │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │              Data Layer                                │  │
│  │  PostgreSQL │ Redis │ Provider APIs │ Odds APIs        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Layers

### A. Live Data Layer (Current ✅)
- Score, minute, status from ESPN/API-Football/football-data
- Events from ESPN summary (keyEvents, plays)
- Stats from ESPN boxscore
- Penalty score from shootoutScore
- Data quality assessment

### B. Pre-Match Intelligence Layer (Future — Requires API)
- Last 5 matches per team
- Head-to-head record
- Home/away strength
- Competition phase
- Table position
- Motivation context

### C. Context Layer (Partial — Requires Backend)
- Match importance (✅ exists via `matchImportance`)
- Table situation (requires API)
- Aggregate advantage (requires API)
- Rivalry detection (partial)

### D. Pattern Engine (Current ✅)
- User-configured patterns
- Templates
- Scope/exclusions
- Confidence thresholds
- Rigor modes

### E. Precision Engine (Current ✅)
- Data quality caps
- Momentum validation
- Timed events
- Strict mode
- Blockers
- Duplicate guard
- Stale data protection

### F. Calibration Layer (Partial)
- Reliability labels (✅)
- Hit rate with minimum sample (✅)
- Unknown ≠ failed (✅)
- Brier score (future)
- Per-league performance (future)
- Per-market performance (future)

### G. Odds Layer (Future — Requires Provider)
- Available odds per market
- Best bookmaker
- Value detection
- Line movement
- Responsible gambling warnings

### H. Alert Delivery Layer (Partial)
- In-app alerts (✅)
- Telegram manual (future)
- Telegram semi-auto (future)
- Telegram auto (future — requires backend)

## Gap Analysis

### Current Strengths
1. Precision Engine is production-ready and battle-tested
2. Pattern evaluation uses real data only
3. Resolution engine is type-aware and honest
4. Performance analytics has minimum sample rules
5. Dry-run is completely read-only
6. Duplicate guard prevents spam
7. Auto-discovery has precision gate
8. Penalty shootout is fully handled
9. Score sync is global and non-regressive
10. Documentation is comprehensive

### Missing for Elite
1. **Backend** — no background monitoring, no persistence beyond localStorage
2. **Pre-match data** — no historical stats API integrated
3. **Odds** — no odds provider connected
4. **Telegram** — no bot, no delivery system
5. **Calibration** — no Brier score, no per-league breakdown
6. **Multi-user** — no auth, no plans, no monetization
7. **Backtest** — only local history, no server-side replay
8. **Advanced patterns** — catalog exists but some require pre-match data

### Backend Required For
- Background live monitoring (even when browser closed)
- Telegram bot delivery
- Odds API integration
- Historical data persistence
- Multi-user support
- Server-side backtest
- Production monitoring/alerting
- Rate limit management across users

### Provider Required For
- Pre-match stats (API-Football historical, Sportmonks, etc.)
- Odds (Betfair, Pinnacle, OddsAPI, etc.)
- Advanced events (Opta, StatsBomb — expensive)

## Recommended Roadmap

| Phase | Focus | Requires |
|-------|-------|----------|
| A | Runtime QA + stability lock | Frontend only ✅ |
| B | Backend architecture (Node + PostgreSQL + Redis) | Server |
| C | Pre-match context engine | Historical API |
| D | Advanced pattern definitions | Backend + pre-match |
| E | Signal evidence UI improvements | Frontend |
| F | Odds integration | Odds provider API |
| G | Telegram integration | Backend + Bot API |
| H | Calibration + backtest | Backend + historical data |
| I | User plans + monetization | Auth + payments |
| J | Production monitoring | Infra + observability |

## Metrics (When Sufficient Sample Exists)

| Metric | Minimum Sample | Description |
|--------|---------------|-------------|
| Hit Rate | 5 resolutions | confirmed / (confirmed + failed) |
| Useful Rate | 5 resolutions | (confirmed + partial) / resolved |
| Failed Rate | 5 resolutions | failed / resolved |
| Unknown Rate | 5 total | unknown / total |
| Brier Score | 30+ signals | Calibration quality |
| Expected Value | Odds required | (prob × odds) - 1 |
| ROI | User stakes | Net profit / total staked |

**Rules:**
- Sample < 5: "Insufficient"
- Sample < 30: "Preliminary"
- Sample ≥ 100: "Reliable"
- Unknown ≠ failed
- Never show "hit rate" without minimum sample

## Risks

1. **Futebol has variance** — even perfect patterns will fail sometimes
2. **Provider delays** — ESPN can lag 15-60s
3. **Data gaps** — smaller leagues have poor coverage
4. **Over-confidence** — users may treat signals as guarantees
5. **Regulatory** — gambling-related features need compliance
6. **Rate limits** — aggressive polling can hit API limits

## Non-Negotiable Principles

1. Zero mocks, zero invented data
2. No guaranteed outcomes
3. Unknown is not failure
4. Precision over speed
5. Evidence-based signals only
6. Honest fallbacks
7. Responsible gambling messaging
8. User controls everything
