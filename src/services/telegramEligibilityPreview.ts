/**
 * telegramEligibilityPreview — local preview of channel eligibility for alerts.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase C2.1: Frontend preview. Backend remains final authority.
 */
import type { HybridCommandAlert } from './hybridAlertMerge'

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

export interface EligibilityPreview {
  eligible: boolean
  blockedReasons: string[]
}

// ─── Pattern Type Inference ──────────────────────────────────────────────────

export function inferPatternType(patternName: string): string {
  const name = patternName.toLowerCase()
  if (name.includes('gol') || name.includes('goal') || name.includes('pressão')) return 'goal_pressure'
  if (name.includes('reta final') || name.includes('late')) return 'late_goal'
  if (name.includes('over') || name.includes('acima')) return 'over_trend'
  if (name.includes('escanteio') || name.includes('corner')) return 'corner_pressure'
  if (name.includes('cartão') || name.includes('card') || name.includes('falta')) return 'card_heat'
  if (name.includes('favorito') || name.includes('favorite')) return 'favorite_risk'
  if (name.includes('zebra') || name.includes('underdog')) return 'underdog_threat'
  if (name.includes('aberto') || name.includes('open')) return 'open_game'
  if (name.includes('domínio') || name.includes('dominance')) return 'dominance'
  return 'custom'
}

// ─── Evaluate ────────────────────────────────────────────────────────────────

export function evaluateTelegramEligibilityPreview(
  alert: HybridCommandAlert,
  rules: TelegramChannelRules | null | undefined,
): EligibilityPreview {
  if (!rules) return { eligible: true, blockedReasons: [] }

  const blockedReasons: string[] = []
  const patternType = inferPatternType(alert.patternName)

  if (rules.minConfidence != null && alert.confidence < rules.minConfidence) {
    blockedReasons.push(`Confiança ${alert.confidence}% < mínimo ${rules.minConfidence}%`)
  }

  if (rules.allowedPatternTypes && rules.allowedPatternTypes.length > 0) {
    if (!rules.allowedPatternTypes.includes(patternType)) {
      blockedReasons.push(`Tipo "${patternType}" não permitido`)
    }
  }

  if (rules.allowedPatternIds && rules.allowedPatternIds.length > 0) {
    if (!rules.allowedPatternIds.includes(alert.patternId)) {
      blockedReasons.push('Padrão não permitido')
    }
  }

  if (rules.blockedPatternIds && rules.blockedPatternIds.includes(alert.patternId)) {
    blockedReasons.push('Padrão bloqueado')
  }

  if (rules.allowedSources && rules.allowedSources.length > 0) {
    if (!rules.allowedSources.includes(alert.source)) {
      blockedReasons.push(`Fonte "${alert.source}" não permitida`)
    }
  }

  // Note: requireRichData, requireTimedEvents, blockStatsProxy need metadata
  // from backendAlert which may not be fully available in frontend preview.
  // Backend remains final authority for these checks.

  return { eligible: blockedReasons.length === 0, blockedReasons }
}

// ─── Rules Summary Label ─────────────────────────────────────────────────────

export function getRulesSummaryLabel(rules: TelegramChannelRules | null | undefined): string {
  if (!rules) return 'Sem restrições'
  const parts: string[] = []
  if (rules.minConfidence) parts.push(`≥${rules.minConfidence}%`)
  if (rules.allowedPatternTypes?.length) parts.push(`${rules.allowedPatternTypes.length} tipo(s)`)
  if (rules.requireRichData) parts.push('dados ricos')
  if (rules.requireTimedEvents) parts.push('eventos minutados')
  if (rules.blockStatsProxy) parts.push('sem proxy')
  if (rules.cooldownMinutes) parts.push(`cooldown ${rules.cooldownMinutes}min`)
  if (rules.maxSignalsPerMatch) parts.push(`max ${rules.maxSignalsPerMatch}/jogo`)
  return parts.length > 0 ? parts.join(' · ') : 'Sem restrições'
}
