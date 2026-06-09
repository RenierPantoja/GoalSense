/**
 * Telegram Channel Rules — evaluates alert eligibility per channel.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase C2: Rules control which alerts can be sent to which channels.
 * Phase E2: DB access routed through the repository layer (Prisma or Firebase).
 * Backend is the final authority. Frontend can preview but backend enforces.
 */
import { createRepositories } from '../../repositories/index.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TelegramChannelRules {
  minConfidence?: number
  allowedPatternTypes?: string[]
  allowedPatternIds?: string[]
  blockedPatternIds?: string[]
  allowedSources?: string[]
  requireRichData?: boolean
  requireTimedEvents?: boolean
  blockStatsProxy?: boolean
  blockUnknownDataQuality?: boolean
  maxSignalsPerMatch?: number
  cooldownMinutes?: number
}

export interface ChannelEligibility {
  eligible: boolean
  blockedReasons: string[]
  warnings: string[]
}

export interface AlertMetadataForRules {
  confidence: number
  patternId: string
  patternName: string
  patternType: string
  source: string
  dataQuality: string
  momentumSource: string
  fixtureId: string
  triggerMinute: number | null
}

// ─── Parse Rules ─────────────────────────────────────────────────────────────

export function parseChannelRules(rulesJson: string | null | undefined): TelegramChannelRules | null {
  if (!rulesJson) return null
  try { return JSON.parse(rulesJson) as TelegramChannelRules } catch { return null }
}

// ─── Extract Alert Metadata ──────────────────────────────────────────────────

export function extractAlertMetadata(alert: { confidence: number; patternId: string; fixtureId: string; triggerMinute: number | null; evidenceJson: string; temporalEvidenceJson: string | null }): AlertMetadataForRules {
  const evidence = safeParseJson(alert.evidenceJson, {})
  const temporal = safeParseJson(alert.temporalEvidenceJson, null)

  // Infer pattern type from name
  const patternName = (evidence.patternName || '').toLowerCase()
  let patternType = 'custom'
  if (patternName.includes('gol') || patternName.includes('goal') || patternName.includes('pressão')) patternType = 'goal_pressure'
  else if (patternName.includes('escanteio') || patternName.includes('corner')) patternType = 'corner_pressure'
  else if (patternName.includes('cartão') || patternName.includes('card')) patternType = 'card_heat'
  else if (patternName.includes('reta final') || patternName.includes('late')) patternType = 'late_goal'
  else if (patternName.includes('over') || patternName.includes('acima')) patternType = 'over_trend'
  else if (patternName.includes('favorito')) patternType = 'favorite_risk'
  else if (patternName.includes('zebra') || patternName.includes('underdog')) patternType = 'underdog_threat'

  return {
    confidence: alert.confidence,
    patternId: alert.patternId,
    patternName: evidence.patternName || '',
    patternType,
    source: evidence.source || 'unknown',
    dataQuality: evidence.triggerSnapshot?.dataQuality || 'unknown',
    momentumSource: temporal?.momentumSource || 'unknown',
    fixtureId: alert.fixtureId,
    triggerMinute: alert.triggerMinute,
  }
}

// ─── Evaluate Eligibility ────────────────────────────────────────────────────

export async function evaluateAlertAgainstChannelRules(
  alertMeta: AlertMetadataForRules,
  channelId: string,
  rules: TelegramChannelRules | null,
): Promise<ChannelEligibility> {
  const blockedReasons: string[] = []
  const warnings: string[] = []

  // No rules = accept all
  if (!rules) return { eligible: true, blockedReasons: [], warnings: [] }

  // minConfidence
  if (rules.minConfidence != null && alertMeta.confidence < rules.minConfidence) {
    blockedReasons.push(`Confiança ${alertMeta.confidence}% abaixo do mínimo ${rules.minConfidence}%`)
  }

  // allowedPatternTypes
  if (rules.allowedPatternTypes && rules.allowedPatternTypes.length > 0) {
    if (!rules.allowedPatternTypes.includes(alertMeta.patternType)) {
      blockedReasons.push(`Tipo "${alertMeta.patternType}" não permitido neste canal`)
    }
  }

  // allowedPatternIds
  if (rules.allowedPatternIds && rules.allowedPatternIds.length > 0) {
    if (!rules.allowedPatternIds.includes(alertMeta.patternId)) {
      blockedReasons.push('Padrão não está na lista de permitidos')
    }
  }

  // blockedPatternIds
  if (rules.blockedPatternIds && rules.blockedPatternIds.includes(alertMeta.patternId)) {
    blockedReasons.push('Padrão está bloqueado neste canal')
  }

  // allowedSources
  if (rules.allowedSources && rules.allowedSources.length > 0) {
    if (!rules.allowedSources.includes(alertMeta.source)) {
      blockedReasons.push(`Fonte "${alertMeta.source}" não permitida`)
    }
  }

  // requireRichData
  if (rules.requireRichData && alertMeta.dataQuality !== 'rich') {
    blockedReasons.push(`Dados ricos exigidos, mas qualidade é "${alertMeta.dataQuality}"`)
  }

  // requireTimedEvents
  if (rules.requireTimedEvents && alertMeta.momentumSource !== 'timed_events' && alertMeta.momentumSource !== 'mixed') {
    blockedReasons.push(`Eventos minutados exigidos, mas momentum é "${alertMeta.momentumSource}"`)
  }

  // blockStatsProxy
  if (rules.blockStatsProxy && alertMeta.momentumSource === 'stats_proxy') {
    blockedReasons.push('Stats proxy bloqueado neste canal')
  }

  // blockUnknownDataQuality
  if (rules.blockUnknownDataQuality && (alertMeta.dataQuality === 'unknown' || alertMeta.dataQuality === 'poor')) {
    blockedReasons.push(`Qualidade de dados "${alertMeta.dataQuality}" bloqueada`)
  }

  // cooldownMinutes
  if (rules.cooldownMinutes && rules.cooldownMinutes > 0) {
    const repos = createRepositories()
    const cutoff = new Date(Date.now() - rules.cooldownMinutes * 60 * 1000)
    const recentDelivery = await repos.telegram.findRecentDeliveryByChannel(channelId, cutoff)
    if (recentDelivery) {
      blockedReasons.push(`Cooldown ativo: último envio há menos de ${rules.cooldownMinutes}min`)
    }
  }

  // maxSignalsPerMatch
  if (rules.maxSignalsPerMatch && rules.maxSignalsPerMatch > 0) {
    const repos = createRepositories()
    const alertIds = await getAlertIdsForFixture(alertMeta.fixtureId)
    const matchDeliveries = await repos.telegram.countSentDeliveries(channelId, alertIds)
    if (matchDeliveries >= rules.maxSignalsPerMatch) {
      blockedReasons.push(`Máximo de ${rules.maxSignalsPerMatch} sinal(is) por partida atingido`)
    }
  }

  return { eligible: blockedReasons.length === 0, blockedReasons, warnings }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAlertIdsForFixture(fixtureId: string): Promise<string[]> {
  const repos = createRepositories()
  const alerts = await repos.alerts.findByFixtureIds(fixtureId)
  return alerts.map((a: any) => a.id)
}

function safeParseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}
