# API-Football Odds Integration (Phase D2)

## Endpoint Used

**Pre-match / Standard Odds:**
```
GET https://v3.football.api-sports.io/odds?fixture={providerFixtureId}
```

**Live / In-Play Odds (if supported by plan):**
```
GET https://v3.football.api-sports.io/odds/live?fixture={providerFixtureId}
```

## Authentication
```
Header: x-apisports-key: {API_KEY}
```

The adapter uses `ODDS_API_KEY` if set, falling back to `API_FOOTBALL_KEY` if not. Both are backend-only environment variables.

## Parameters Used

| Parameter | Usage |
|---|---|
| `fixture` | The `providerFixtureId` from our `Fixture` model, which maps 1:1 to API-Football fixture IDs. |

## Response Shape (API-Football v3)

```json
{
  "get": "odds",
  "parameters": { "fixture": "12345" },
  "results": 1,
  "response": [
    {
      "league": { "id": 39, "name": "...", "season": 2025 },
      "fixture": { "id": 12345, "date": "..." },
      "update": "2026-05-31T12:00:00+00:00",
      "bookmakers": [
        {
          "id": 8,
          "name": "Bet365",
          "bets": [
            {
              "id": 1,
              "name": "Match Winner",
              "values": [
                { "value": "Home", "odd": "1.50" },
                { "value": "Draw", "odd": "3.25" },
                { "value": "Away", "odd": "6.00" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Market Mapping

| API-Football Bet Name | GoalSense `marketType` |
|---|---|
| Match Winner | `match_winner` |
| Goals Over/Under | `over_under_goals` |
| Both Teams Score | `both_teams_score` |
| Asian Handicap | `asian_handicap` |
| Corners Over Under | `corners` |
| Total Corners | `corners` |
| Cards Over Under | `cards` |
| Total Cards | `cards` |
| Next Goal | `next_goal` |
| *(unknown)* | `custom_unknown` |

## Rate Limits
- Depends on the plan. Typically 10-100 requests/minute.
- The adapter enforces `ODDS_FETCH_TIMEOUT_MS` (default: 8000ms) per request.
- On HTTP 429 (rate limited), the adapter returns an error response without crashing.

## Limitations
- **History:** The `/odds` endpoint has a ~7 day history window.
- **Coverage:** Not all leagues have odds coverage. Check the league coverage flags.
- **Live Odds:** The `/odds/live` endpoint may require a higher-tier plan. The adapter attempts the standard `/odds` endpoint first; live odds can be added in a future phase.
- **Corners/Cards:** These markets may not be available for all fixtures or bookmakers.

## What This Phase Does NOT Do
- No automatic betting.
- No affiliate links or redirects to bookmakers.
- No stake calculation.
- No EV/ROI computation.
- No odds in Telegram signals.
- API key is never exposed to the frontend.
