# Telegram Semi-Automatic Approval Queue

## Overview

Phase C3 introduces the **Telegram Semi-Automatic Approval Queue**. Instead of navigating through alerts one by one to send them to Telegram, the Command Center now aggregates all eligible alerts into a centralized approval queue. 

**CRITICAL RULE**: The queue can *suggest* sends based on channel rules, but it **cannot send automatically**. A human operator must explicitly click "Aprovar Envio" for each item.

## Workflow

1. The backend evaluates all recent alerts (last 24 hours) against the rules of all active Telegram channels.
2. Alerts that are eligible for at least one channel, and haven't been sent or skipped yet, appear in the queue.
3. The operator reviews the queue in the Command Center (Advanced Mode > Alerts tab).
4. For each item, the operator can:
   - **Aprovar Envio**: Sends the alert to the selected eligible channel. A `SignalDelivery` record is created (or updated) with `status: 'sent'`.
   - **Ignorar**: Skips the alert. A `SignalDelivery` record is created (or updated) with `status: 'skipped'`.

Both actions remove the item from the queue, as it has now been processed.

## API Endpoints

### `GET /api/telegram/approval-queue`
Returns a list of `TelegramApprovalQueueItem` objects.
- Uses `evaluateAlertAgainstChannelRules` under the hood.
- Evaluates duplicate delivery (`alreadySentChannels`, `skippedChannels`).
- Has **zero side effects** (does not create delivery records or send messages).

### `POST /api/telegram/approval-queue/:alertId/approve`
Approves and sends an alert.
- Payload: `{ channelId: string, confirm: true }`
- Reuses the core `sendAlertToChannel` function to ensure channel rules and duplicate guards are strictly enforced at the time of sending.

### `POST /api/telegram/approval-queue/:alertId/ignore`
Skips an alert.
- Payload: `{ channelId?: string, reason?: string }`
- If no `channelId` is provided, skips for all active channels.
- Creates a `SignalDelivery` record with `status: 'skipped'` to ensure the alert doesn't reappear in the queue.

## QA & Hardening (Phase C3.1)

To guarantee the integrity of the delivery system, several QA checks and hardening measures have been implemented:

### Delivery Integrity & Idempotency
- The database enforces a `@@unique([alertId, channelId])` constraint on `SignalDelivery`.
- `sendAlertToChannel` and `ignoreAlertInQueue` gracefully perform **Upsert logic**: they check for existing rows before writing. This allows an alert that was previously `skipped` or `failed` to be overwritten to `pending` or `skipped` again without crashing due to unique constraint violations.
- Repeated clicks on "Aprovar" or "Ignorar" cannot duplicate deliveries or crash the application.

### Parity with Manual Send
- The Approval Queue uses the exact same `sendAlertToChannel` function as the manual send modal.
- Both workflows share the exact same rules, blocking logic, delivery registration, and unique constraints.

### Anti-Spam & Rate Limiting
- `GET /api/telegram/approval-queue` strictly only reads data and never creates dummy deliveries.
- Refreshing the queue does not spam the database.
- The UI disables the Approve and Ignore buttons immediately on click, showing a loading indicator until the request completes.

### Non-Automation Guarantee
- No `useEffect`, `setInterval`, or worker automatically triggers `approveTelegramQueueItem`.
- The user must interact with the `TelegramApprovalQueuePanel` manually.
- The backend endpoint requires the `{ confirm: true }` payload literal to execute an approval, providing a secondary programmatic block against accidental API calls.

## Channel Rules & Duplicate Guards

The approval queue fully respects all channel rules established in Phase C2:
- **minConfidence**: Alerts below the threshold are blocked.
- **allowedPatternTypes / blockedPatternIds**: Enforced.
- **cooldownMinutes**: Active cooldowns block the channel.
- **maxSignalsPerMatch**: Limits per fixture are respected.

Duplicate deliveries are prevented because the queue filters out any channel that already has a `sent` or `skipped` delivery record for that specific `alertId`.

## Limitations
- **No automatic sending**: Every send requires human confirmation.
- **No bulk approval**: Batch approval is deferred to a future phase to maintain maximum control and safety.
- **No odds integration**: Odds are not considered in eligibility.
- **Limited historical window**: The queue only evaluates alerts from the last 24 hours for performance reasons.
