# Telegram Signal Delivery

## Overview

Phase C1 introduces semi-automatic Telegram signal delivery. The user manually selects which alerts to send to configured Telegram channels/groups. No automatic delivery.

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
| `/api/telegram/deliveries` | GET | List delivery history |

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
- No multiple rules per channel
- No scheduling
- No compliance beyond basic disclaimer

## Limitations

- Single user (default)
- No rate limiting on user sends (trust-based)
- No message editing after send
- No delivery confirmation callback from Telegram
- Bot must be admin in the target group/channel
