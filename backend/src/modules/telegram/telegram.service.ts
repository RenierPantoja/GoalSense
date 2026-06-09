/**
 * Telegram Service — sends signals to Telegram channels/groups.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase C1: Semi-automatic. User must confirm each send.
 * No automatic delivery. No odds. No irresponsible language.
 */
import { env } from '../../env.js'
import { parseChannelRules, extractAlertMetadata, evaluateAlertAgainstChannelRules } from './telegramChannelRules.service.js'
import { createRepositories } from '../../repositories/index.js'

const DEFAULT_USER = 'default'

// ─── Telegram API ────────────────────────────────────────────────────────────

export function isTelegramEnabled(): boolean {
  return env.TELEGRAM_ENABLED === 'true' && !!env.TELEGRAM_BOT_TOKEN
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<{ success: boolean; error?: string }> {
  if (!isTelegramEnabled()) return { success: false, error: 'Telegram not enabled' }

  try {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as any
      return { success: false, error: body?.description || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' }
  }
}

// ─── Message Formatting ──────────────────────────────────────────────────────

export function formatSignalMessage(alert: {
  patternName: string
  homeTeam: string
  awayTeam: string
  competition: string
  triggerMinute: number | null
  triggerScoreHome: number
  triggerScoreAway: number
  confidence: number
  evidences: string[]
  momentumSource?: string
  dataQuality?: string
}): string {
  const lines: string[] = []

  lines.push('<b>⚡ GoalSense Signal</b>')
  lines.push('')
  lines.push(`<b>Jogo:</b> ${alert.homeTeam} x ${alert.awayTeam}`)
  if (alert.competition) lines.push(`<b>Liga:</b> ${alert.competition}`)
  if (alert.triggerMinute != null) lines.push(`<b>Minuto:</b> ${alert.triggerMinute}'`)
  lines.push(`<b>Placar:</b> ${alert.triggerScoreHome}–${alert.triggerScoreAway}`)
  lines.push(`<b>Padrão:</b> ${alert.patternName}`)
  lines.push(`<b>Confiança:</b> ${alert.confidence}%`)
  lines.push(`<b>Status:</b> Sinal validado`)
  lines.push('')

  if (alert.evidences.length > 0) {
    lines.push('<b>Evidências:</b>')
    for (const e of alert.evidences.slice(0, 5)) {
      lines.push(`• ${e}`)
    }
    lines.push('')
  }

  if (alert.momentumSource) lines.push(`<b>Momentum:</b> ${alert.momentumSource}`)
  if (alert.dataQuality) lines.push(`<b>Dados:</b> ${alert.dataQuality}`)
  lines.push('')
  lines.push('<i>⚠️ Sinal baseado em leitura estatística ao vivo. Não há garantia de resultado.</i>')

  return lines.join('\n')
}

// ─── Channel Management ──────────────────────────────────────────────────────

export async function listChannels() {
  const repos = createRepositories()
  return repos.telegram.listChannels(DEFAULT_USER)
}

export async function createChannel(data: { name: string; chatId: string; type?: string }) {
  const repos = createRepositories()
  return repos.telegram.createChannel({ name: data.name, chatId: data.chatId, type: data.type || 'group' }, DEFAULT_USER)
}

export async function deleteChannel(id: string) {
  const repos = createRepositories()
  return repos.telegram.deleteChannel(id)
}

// ─── Signal Delivery ─────────────────────────────────────────────────────────

export async function sendAlertToChannel(alertId: string, channelId: string): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
  if (!isTelegramEnabled()) return { success: false, error: 'Telegram not enabled' }

  const repos = createRepositories()

  // Check duplicate delivery
  let delivery = await repos.telegram.findDelivery(alertId, channelId)
  if (delivery?.status === 'sent') return { success: false, error: 'Already sent to this channel' }

  // Load alert (AlertRepository — Prisma in prisma mode; firebase mode throws clear error until E4)
  const alert = await repos.alerts.findById(alertId, DEFAULT_USER)
  if (!alert) return { success: false, error: 'Alert not found' }

  // Load channel
  const channel = await repos.telegram.findChannel(channelId, DEFAULT_USER)
  if (!channel || channel.isActive === false) return { success: false, error: 'Channel not found or inactive' }

  // Evaluate channel rules
  const rules = parseChannelRules(channel.rulesJson)
  if (rules) {
    const alertMeta = extractAlertMetadata(alert as any)
    const eligibility = await evaluateAlertAgainstChannelRules(alertMeta, channelId, rules)
    if (!eligibility.eligible) {
      return { success: false, error: `Blocked by channel rules: ${eligibility.blockedReasons[0]}` }
    }
  }

  // Parse evidence
  const evidence = safeParseJson(alert.evidenceJson, {})
  const temporal = safeParseJson(alert.temporalEvidenceJson, null)

  if (!evidence.evidences || evidence.evidences.length === 0) {
    return { success: false, error: 'Alert has no evidence — cannot send' }
  }

  // Format message
  const messageText = formatSignalMessage({
    patternName: evidence.patternName || 'Padrão',
    homeTeam: evidence.homeTeam || 'Home',
    awayTeam: evidence.awayTeam || 'Away',
    competition: evidence.competition || '',
    triggerMinute: alert.triggerMinute,
    triggerScoreHome: alert.triggerScoreHome,
    triggerScoreAway: alert.triggerScoreAway,
    confidence: alert.confidence,
    evidences: evidence.evidences,
    momentumSource: temporal?.momentumSource,
    dataQuality: evidence.triggerSnapshot?.dataQuality,
  })

  // Create or update delivery record (deterministic id in Firebase = idempotent)
  if (delivery) {
    delivery = await repos.telegram.updateDelivery(delivery.id, { status: 'pending', messageText, errorMessage: null })
  } else {
    delivery = await repos.telegram.createDelivery({ userId: DEFAULT_USER, alertId, channelId, status: 'pending', provider: 'telegram', messageText })
  }

  // Send
  const result = await sendTelegramMessage(channel.chatId, messageText)

  if (result.success) {
    await repos.telegram.updateDelivery(delivery.id, { status: 'sent', sentAt: new Date().toISOString() })
    return { success: true, deliveryId: delivery.id }
  } else {
    await repos.telegram.updateDelivery(delivery.id, { status: 'failed', errorMessage: result.error })
    return { success: false, deliveryId: delivery.id, error: result.error }
  }
}

export async function listDeliveries(alertId?: string) {
  const repos = createRepositories()
  return repos.telegram.listDeliveries({ userId: DEFAULT_USER, alertId, limit: 50 })
}

// ─── Approval Queue ────────────────────────────────────────────────────────────

export async function getApprovalQueue(filters?: { limit?: number; minConfidence?: number; status?: string; channelId?: string; onlyEligible?: boolean; source?: string }) {
  if (!isTelegramEnabled()) return []

  const repos = createRepositories()

  // Load all active channels
  const allChannels = await repos.telegram.listChannels(DEFAULT_USER)
  const channels = allChannels.filter((c: any) => c.isActive !== false)
  if (channels.length === 0) return []

  // Load recent alerts (with evidence to evaluate channel rules)
  let alerts = await repos.alerts.listForApprovalQueue({
    userId: DEFAULT_USER,
    minConfidence: filters?.minConfidence,
    status: filters?.status,
    sinceMs: 24 * 60 * 60 * 1000,
    limit: 200,
  })

  // Filter alerts by source if requested
  if (filters?.source) {
    alerts = alerts.filter((a: any) => {
      const ev = safeParseJson(a.evidenceJson, {})
      return ev.source === filters.source
    })
  }

  const queue = []

  for (const alert of alerts) {
    const alertMeta = extractAlertMetadata(alert as any)
    if (!alertMeta) continue

    const ev = safeParseJson(alert.evidenceJson, {})
    if (!ev.evidences || ev.evidences.length === 0) continue

    const eligibleChannels = []
    const blockedChannels = []
    const alreadySentChannels = []
    const skippedChannels = []

    let isEligibleForAny = false

    for (const channel of channels) {
      if (filters?.channelId && channel.id !== filters.channelId) continue

      // Check deliveries (sent or skipped)
      const delivery = await repos.telegram.findDelivery(alert.id, channel.id)

      if (delivery) {
        if (delivery.status === 'sent') { alreadySentChannels.push(channel.id); continue }
        if (delivery.status === 'skipped') { skippedChannels.push(channel.id); continue }
      }

      // Evaluate channel rules
      const rules = parseChannelRules(channel.rulesJson)
      const eligibility = await evaluateAlertAgainstChannelRules(alertMeta, channel.id, rules)

      if (eligibility.eligible) {
        eligibleChannels.push({ channelId: channel.id, channelName: channel.name, reasons: [], warnings: eligibility.warnings })
        isEligibleForAny = true
      } else {
        blockedChannels.push({ channelId: channel.id, channelName: channel.name, blockedReasons: eligibility.blockedReasons })
      }
    }

    if (!isEligibleForAny) continue
    if (filters?.channelId && eligibleChannels.length === 0) continue

    queue.push({
      alertId: alert.id,
      alert: {
        id: alert.id,
        patternId: alert.patternId,
        fixtureId: alert.fixtureId,
        status: alert.status,
        confidence: alert.confidence,
        triggerMinute: alert.triggerMinute,
        triggerScoreHome: alert.triggerScoreHome,
        triggerScoreAway: alert.triggerScoreAway,
        createdAt: alert.createdAt,
        evidenceJson: alert.evidenceJson,
        temporalEvidenceJson: alert.temporalEvidenceJson,
      },
      eligibleChannels,
      blockedChannels,
      alreadySentChannels,
      skippedChannels,
      recommended: true,
      warnings: [],
      createdAt: alert.createdAt,
    })

    if (filters?.limit && queue.length >= filters.limit) break
  }

  return queue
}

export async function ignoreAlertInQueue(alertId: string, channelId?: string, reason?: string) {
  const repos = createRepositories()
  let channelsToSkip: { id: string }[] = []
  if (channelId) {
    channelsToSkip = [{ id: channelId }]
  } else {
    const channels = await repos.telegram.listChannels(DEFAULT_USER)
    channelsToSkip = channels.filter((c: any) => c.isActive !== false).map((c: any) => ({ id: c.id }))
  }

  const results = []
  for (const ch of channelsToSkip) {
    const existing = await repos.telegram.findDelivery(alertId, ch.id)
    if (!existing) {
      const delivery = await repos.telegram.createDelivery({
        userId: DEFAULT_USER, alertId, channelId: ch.id, status: 'skipped', provider: 'telegram', errorMessage: reason || 'Skipped by user',
      })
      results.push(delivery)
    } else if (existing.status !== 'sent' && existing.status !== 'skipped') {
      const delivery = await repos.telegram.updateDelivery(existing.id, { status: 'skipped', errorMessage: reason || 'Skipped by user' })
      results.push(delivery)
    }
  }

  return { success: true, skippedCount: results.length }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}
