# Telegram Channel Rules

## Overview

Phase C2 introduces per-channel rules that control which alerts are eligible for delivery to each Telegram channel. The backend is the final authority — the frontend can preview eligibility but the backend enforces it.

## Rule Fields

| Field | Type | Description |
|-------|------|-------------|
| `minConfidence` | number (0–100) | Minimum alert confidence to allow delivery |
| `allowedPatternTypes` | string[] | Only these pattern types are allowed |
| `allowedPatternIds` | string[] | Only these specific patterns are allowed |
| `blockedPatternIds` | string[] | These patterns are blocked |
| `allowedSources` | string[] | Only these sources are allowed |
| `requireRichData` | boolean | Require dataQuality === 'rich' |
| `requireTimedEvents` | boolean | Require momentum from timed events |
| `blockStatsProxy` | boolean | Block stats_proxy momentum |
| `blockUnknownDataQuality` | boolean | Block unknown/poor data quality |
| `maxSignalsPerMatch` | number (1–50) | Max deliveries per fixture per channel |
| `cooldownMinutes` | number (0–1440) | Min minutes between deliveries to channel |

## Storage

Rules are stored as JSON in `TelegramChannel.rulesJson` column.

```
PATCH /api/telegram/channels/:id/rules
Body: { "rules": { "minConfidence": 70, "cooldownMinutes": 10 } }
```

## Evaluation Flow

1. `parseChannelRules(rulesJson)` — parse JSON string to typed rules object
2. `extractAlertMetadata(alert)` — extract pattern type, source, data quality from alert
3. `evaluateAlertAgainstChannelRules(alertMeta, channelId, rules)` — evaluate all rules

**Returns**: `{ eligible: boolean, blockedReasons: string[], warnings: string[] }`

## Shared Logic

All endpoints use the **same** evaluation function:
- `POST /api/telegram/send-alert/:alertId` — blocks delivery if ineligible
- `GET /api/telegram/eligibility/:alertId` — returns preview without side effects
- `GET /api/telegram/approval-queue` — filters alerts that are eligible for at least one channel

## Database-Dependent Rules

These rules require database queries and cannot be evaluated locally:

### cooldownMinutes
Queries `SignalDelivery` for the most recent delivery to the channel. If sent within the cooldown window, the channel is blocked.

### maxSignalsPerMatch
Counts `SignalDelivery` records for the same fixture + channel. If the count reaches the max, the channel is blocked.

### alreadySent
The eligibility endpoint additionally checks if the specific `alertId + channelId` combination already has a `sent` delivery.

## Frontend Preview

### Server Preview (Phase C2.2)
- `getTelegramEligibility(alertId)` calls `GET /api/telegram/eligibility/:alertId`
- Returns full eligibility with cooldown, maxSignalsPerMatch, alreadySent
- Cached in `telegramEligibilityByAlertId`

### Local Preview (Fallback)
- `evaluateTelegramEligibilityPreview(alert, rules)` evaluates locally
- Cannot check cooldown or maxSignalsPerMatch (no DB access)
- Used when backend is offline or eligibility endpoint fails

### Modal Labels
- "✅ Prévia do servidor" — server eligibility used
- "⚠️ Prévia local" — fallback to local evaluation

## Channel Without Rules

A channel with no rules (`rulesJson` = null) accepts all alerts, subject only to `alreadySent` deduplication.

## What This Does NOT Cover

- Time-of-day rules (e.g., only send during business hours)
- Competition-based rules (e.g., only Brasileirão)
- Odds-based rules
- Automatic sending
- Advanced compliance rules
