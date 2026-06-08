# Odds Intelligence Foundation (Phase D1)

## Overview

GoalSense now includes a foundational abstraction for Odds Intelligence. The purpose of this phase is to fetch, normalize, and display read-only odds context next to alerts in the Command Center (Advanced Mode).

**CRITICAL LIMITATIONS FOR PHASE D1:**
- **No Automatic Betting**: The system does not place bets.
- **No Redirects**: There are no affiliate links or redirects to bookmakers.
- **No Telegram Sync**: Odds are explicitly excluded from Telegram payloads and the approval queue to avoid mixing experimental features with the production signal pipeline.
- **No Financial Advice/EV**: We do not yet calculate Expected Value or recommend stake sizes.

## Architecture

1. **Provider Abstraction (`oddsProvider.service.ts`)**:
   - Centralized interface that routes requests to provider implementations.
   - Controlled by the `ODDS_PROVIDER` environment variable.
   - **Phase D2**: `api_football` is the first real provider. The adapter (`apiFootballOdds.provider.ts`) calls `GET /odds?fixture={id}` on the API-Football v3 API.
   - API key resolution: uses `ODDS_API_KEY`, falling back to `API_FOOTBALL_KEY`.

2. **Market Mapper (`oddsMarketMapper.ts`)**:
   - Infers logical betting markets from a pattern's intention.
   - Example: A `corner_pressure` pattern maps to `corners`. A `goal_pressure` pattern maps to `over_under_goals`, `next_goal`, etc.

3. **Database Schema (`schema.prisma`)**:
   - `OddsSnapshot`: Stores raw point-in-time snapshots to ensure historical auditing. Never overwritten.
   - `AlertOddsContext`: Associates a specific alert with the best available odds at the moment it was evaluated.

4. **Stale Policy**:
   - Real-time odds fluctuate rapidly. 
   - A snapshot is considered valid for `ODDS_CACHE_TTL_SECONDS` (default: 30s).
   - If odds are older than the TTL, the frontend will explicitly display a "Stale / Desatualizado" warning, and users can manually click "Atualizar Odds".

## Environment Configuration

```env
ODDS_ENABLED=true
ODDS_PROVIDER=none
ODDS_API_KEY=your_key_here
ODDS_FETCH_TIMEOUT_MS=8000
ODDS_CACHE_TTL_SECONDS=30
```

If `ODDS_ENABLED=false`, the entire frontend odds block hides itself or shows "Disabled".

## Next Steps (Phase D3+)
- Implement live odds via `/odds/live` endpoint (requires higher-tier plan).
- Implement the `OddsProviderAdapter` contract for The Odds API / Sportmonks.
- Calculate EV and ROI based on historical pattern performance vs normalized odds.
- Enable appending odds to Telegram signals (after accuracy is validated).

## Quality Assurance (Phase D1.1)
The foundation was hardened and QA'd against multiple fallback scenarios:
- **No API Key / Disabled**: Handled gracefully. UI shows clear status.
- **Provider Contract**: An interface `OddsProviderAdapter` exists to guarantee consistent integration when D2 starts.
- **Idempotency & Snapshots**: Repeated clicks to refresh odds generate distinct `OddsSnapshot` records preserving history, while `AlertOddsContext` correctly captures the context of the alert.
