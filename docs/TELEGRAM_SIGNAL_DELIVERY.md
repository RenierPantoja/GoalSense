# Telegram Signal Delivery

## Overview

- **Auditability:** Every single delivery is logged to `SignalDelivery` (which contains `{ id, alertId, channelId, status, payload, deliveredAt }`).
- **No Automatic Delivery:** Sending must be triggered manually via `/app/alerts` or through the Approval Queue.

## Note on Odds (Phase D1)

As of Phase D1, Odds Intelligence has been introduced into the Command Center. However, **odds are explicitly excluded from Telegram payloads**. The system will not send odds to Telegram channels until EV and profitability logic are fully validated in future phases.

## Configuration

### Environment Variables (Backend Only)
```
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

**Security**: Token is NEVER exposed to the frontend. All Telegram operations go through backend API.

### Creating a Bot
1. Message @BotFather on Telegram
2. `/newbot` → follow instructions
3. Copy the token to `TELEGRAM_BOT_TOKEN`
4. Add the bot to your group/channel as admin

### Getting Chat ID
- For groups: Add the bot, send a message, then call `https://api.telegram.org/bot<TOKEN>/getUpdates`
- For channels: Use the channel's `@username` or numeric ID
- For private: Use your numeric user ID

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/telegram/status` | GET | Returns enabled, configured, channelsCount |
| `/api/telegram/channels` | GET | List configured channels |
| `/api/telegram/channels` | POST | Create channel (name, chatId, type) |
| `/api/telegram/channels/:id` | DELETE | Remove channel |
| `/api/telegram/send-alert/:alertId` | POST | Send alert to channel (requires `confirm: true`) |
| `/api/telegram/eligibility/:alertId` | GET | Server-side eligibility preview without side effects |
| `/api/telegram/channels/:id/rules` | PATCH | Update channel rules (minConfidence, cooldown, etc.) |
| `/api/telegram/deliveries` | GET | List delivery history |
| `/api/telegram/approval-queue` | GET | List eligible alerts for approval |
| `/api/telegram/approval-queue/:alertId/approve` | POST | Approve and send an alert from the queue |
| `/api/telegram/approval-queue/:alertId/ignore` | POST | Skip an alert (creates a `skipped` delivery record) |

## Server Eligibility Preview (Phase C2.2)

### Endpoint

`GET /api/telegram/eligibility/:alertId`

**Query params (optional)**:
- `channelId` — evaluate only one channel
- `includeInactive=true` — include inactive channels

**Response**:
```json
{
  "alertId": "...",
  "channels": [
    {
      "channelId": "...",
      "channelName": "...",
      "eligible": true,
      "blockedReasons": [],
      "warnings": [],
      "alreadySent": false,
      "lastSentAt": null
    }
  ]
}
```

### Rule Evaluation

Uses the **same** `evaluateAlertAgainstChannelRules()` function as the real `send-alert` endpoint. No logic duplication.

Rules evaluated:
- `minConfidence` — blocks if alert confidence below threshold
- `allowedPatternTypes` / `allowedPatternIds` / `blockedPatternIds`
- `allowedSources`
- `requireRichData` / `requireTimedEvents`
- `blockStatsProxy` / `blockUnknownDataQuality`
- `cooldownMinutes` — blocks if a delivery was sent to the channel within the cooldown window
- `maxSignalsPerMatch` — blocks if the channel has reached the max signals for the same fixture
- `alreadySent` — checks if this alertId+channelId combination was already delivered

### No Side Effects

The eligibility endpoint:
- Does NOT send any message
- Does NOT create any `SignalDelivery` record
- Does NOT alter the database in any way

### Preview vs Send Parity

For the same `alertId + channelId`:
- If `GET eligibility` returns `eligible: true` → `POST send-alert` will allow it
- If `GET eligibility` returns `eligible: false` → `POST send-alert` will block it

Both use the identical `evaluateAlertAgainstChannelRules()` function.

### Frontend Usage

**Priority order**:
1. Server eligibility (via `getEligibilityForAlert`) — includes cooldown, maxSignalsPerMatch, alreadySent
2. Local preview (via `evaluateTelegramEligibilityPreview`) — fallback when backend is offline
3. Backend `send-alert` — final authority, always validates server-side

**Labels in modal**:
- "✅ Prévia do servidor" — server eligibility loaded
- "⚠️ Prévia local" — using local fallback (limited: no cooldown/maxPerMatch)

**State**: `eligibilityByAlertId` in `useTelegramIntegration` caches results per alertId.

## Message Format

```
⚡ GoalSense Signal

Jogo: Flamengo x Palmeiras
Liga: Brasileirão
Minuto: 74'
Placar: 1–1
Padrão: Pressão por gol
Confiança: 82%
Status: Sinal validado

Evidências:
• 3 eventos ofensivos recentes
• 2 finalizações no alvo
• Momentum confirmado por eventos

Momentum: timed_events
Dados: rich

⚠️ Sinal baseado em leitura estatística ao vivo. Não há garantia de resultado.
```

## Anti-Spam / Anti-Duplicate

- Same `alertId + channelId` can only be sent once (unique constraint)
- Resend requires explicit action (not implemented in C1)
- Alert without evidence cannot be sent
- Alert must exist in database
- `cooldownMinutes` per channel prevents rapid-fire sends
- `maxSignalsPerMatch` per channel limits signals per fixture

## Delivery Audit

Every send attempt creates a `SignalDelivery` record:
- `status`: pending → sent | failed
- `messageText`: full message saved for audit
- `errorMessage`: Telegram API error if failed
- `sentAt`: timestamp of successful delivery

## What This Phase Does NOT Do

- No automatic delivery (user must click and confirm)
- No odds integration
- No stake recommendations
- No "green certo" or irresponsible language
- No scheduling
- No compliance beyond basic disclaimer

## Limitations

- Single user (default)
- No rate limiting on user sends (trust-based)
- No message editing after send
- No delivery confirmation callback from Telegram
- Bot must be admin in the target group/channel
- Local preview cannot check cooldown/maxSignalsPerMatch (requires DB)
