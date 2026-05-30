/**
 * Pattern Resolution Engine V3 — resolves triggered alerts with
 * strong/partial confirmation, failure, expiry, and unknown states.
 * V3 uses PatternResolutionType for type-specific windows and criteria.
 * No mocks. Uses real score/stats changes only.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { CommandAlertStatus, ResolutionStrength } from '@/context/AlertsContext'
import { inferPatternResolutionType, getResolutionWindow, type PatternResolutionType } from './patternResolutionTypes'

export interface ResolutionInput {
  id: string
  patternName: string
  patternId?: string
  templateId?: string
  fixtureId: number
  minuteAtTrigger: number | null
  scoreAtTrigger: { home: number; away: number }
  confidence: number
  createdAt: string
  status: CommandAlertStatus
}

export interface ResolutionResult {
  status: CommandAlertStatus
  strength: ResolutionStrength
  scoreAtResolution: { home: number; away: number }
  reason: string
  evidence: string[]
  confidence: number
  /** V3: resolution type used for evaluation. */
  resolutionType?: PatternResolutionType
  /** V3: window used for evaluation. */
  windowMinutes?: number
}

export function resolveAlert(
  alert: ResolutionInput,
  currentFixture: LiveFixture | undefined
): ResolutionResult | null {
  if (alert.status !== 'pending') return null
  if (!currentFixture) {
    const age = Date.now() - new Date(alert.createdAt).getTime()
    if (age > 3 * 60 * 60 * 1000) {
      return { status: 'expired', strength: 'expired', scoreAtResolution: alert.scoreAtTrigger, reason: 'Partida não encontrada após 3h', evidence: [], confidence: 0 }
    }
    return null
  }

  const isFinished = currentFixture.status.short === 'FT' || currentFixture.raw === 'STATUS_FULL_TIME' || (currentFixture as any)._state === 'post'
  const cH = currentFixture.score.home ?? 0
  const cA = currentFixture.score.away ?? 0
  const tH = alert.scoreAtTrigger.home
  const tA = alert.scoreAtTrigger.away
  const goalsSince = (cH + cA) - (tH + tA)
  const elapsed = currentFixture.status.elapsed || 0
  const trigMin = alert.minuteAtTrigger || 0
  const alertAge = Date.now() - new Date(alert.createdAt).getTime()
  const score = { home: cH, away: cA }

  // V15: If fixture is in penalty shootout, don't count shootout goals as confirmations
  // for open-play patterns. Return unknown if window expired during shootout.
  const isPenaltyPhase = currentFixture.status.short === 'P' || currentFixture.status.short === 'PEN'
  const effectiveGoalsSince = isPenaltyPhase ? 0 : goalsSince

  // V3: Infer resolution type and use type-specific window
  const resType = inferPatternResolutionType({ name: alert.patternName, templateId: alert.templateId, description: '', conditions: [], severity: 'attention', status: 'active', isTemplate: false, scope: 'all', minConfidence: 50, action: 'register_alert', maxTriggersPerMatch: 2, antiDuplicateWindow: 5, id: alert.patternId || '', createdAt: '', updatedAt: '' })
  const typeWindow = getResolutionWindow(resType)
  const minutesSinceTrigger = elapsed - trigMin

  // ─── Time-based expiry ─────────────────────────────────────────────────
  if (alertAge > 2.5 * 60 * 60 * 1000 && !isFinished) {
    return { status: 'expired', strength: 'expired', scoreAtResolution: score, reason: 'Alerta expirou (>2.5h)', evidence: [], confidence: 0, resolutionType: resType, windowMinutes: typeWindow }
  }

  // ─── V3: Type-based resolution ─────────────────────────────────────────
  // Goal-based types: goal_pressure, late_goal, over_trend, open_game, dominance
  if (resType === 'goal_pressure' || resType === 'late_goal' || resType === 'over_trend' || resType === 'open_game' || resType === 'dominance') {
    if (effectiveGoalsSince > 0) {
      return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Gol confirmado: ${tH}-${tA} → ${cH}-${cA}`, evidence: ['Gol após disparo', `Placar mudou de ${tH}-${tA} para ${cH}-${cA}`], confidence: 95, resolutionType: resType, windowMinutes: typeWindow }
    }
    if (isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: 'Jogo terminou sem novo gol', evidence: ['Nenhum gol após o disparo'], confidence: 90, resolutionType: resType, windowMinutes: typeWindow }
    }
    if (minutesSinceTrigger >= typeWindow && !isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: `${typeWindow} min sem gol após disparo`, evidence: ['Janela de pressão expirou'], confidence: 70, resolutionType: resType, windowMinutes: typeWindow }
    }
    return null
  }

  // Corner-based type
  if (resType === 'corner_pressure') {
    if (effectiveGoalsSince > 0) {
      return { status: 'confirmed', strength: 'partial_confirmation', scoreAtResolution: score, reason: 'Pressão territorial resultou em gol', evidence: ['Gol após pressão de escanteios'], confidence: 60, resolutionType: resType, windowMinutes: typeWindow }
    }
    if (isFinished) {
      return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Dados de escanteios indisponíveis para confirmação', evidence: ['Provider não fornece escanteios em tempo real'], confidence: 0, resolutionType: resType, windowMinutes: typeWindow }
    }
    if (minutesSinceTrigger >= typeWindow) {
      return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Janela expirou sem dados de escanteios', evidence: [], confidence: 0, resolutionType: resType, windowMinutes: typeWindow }
    }
    return null
  }

  // Card-based type
  if (resType === 'card_heat') {
    if (isFinished) {
      return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Dados de cartões indisponíveis para confirmação automática', evidence: ['Sem tracking de cartões em tempo real'], confidence: 0, resolutionType: resType, windowMinutes: typeWindow }
    }
    if (minutesSinceTrigger >= typeWindow) {
      return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Janela expirou sem dados de cartões', evidence: [], confidence: 0, resolutionType: resType, windowMinutes: typeWindow }
    }
    return null
  }

  // Favorite/underdog risk types
  if (resType === 'favorite_risk' || resType === 'underdog_threat') {
    if (isFinished) {
      if (cH === cA || (tH <= tA && cH <= cA) || (tA <= tH && cA <= cH)) {
        return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Favorito não venceu: ${cH}-${cA}`, evidence: ['Resultado final confirma risco'], confidence: 90, resolutionType: resType, windowMinutes: typeWindow }
      }
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: `Favorito se recuperou: ${cH}-${cA}`, evidence: ['Favorito virou/venceu'], confidence: 85, resolutionType: resType, windowMinutes: typeWindow }
    }
    if (effectiveGoalsSince > 0 && minutesSinceTrigger <= typeWindow) {
      return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Evento confirmado: gol (${cH}-${cA})`, evidence: ['Gol após disparo'], confidence: 88, resolutionType: resType, windowMinutes: typeWindow }
    }
    return null
  }

  // Custom/unknown type — conservative
  if (isFinished) {
    if (effectiveGoalsSince > 0) {
      return { status: 'confirmed', strength: 'partial_confirmation', scoreAtResolution: score, reason: `Evento após disparo: ${cH}-${cA}`, evidence: ['Gol detectado'], confidence: 60, resolutionType: resType, windowMinutes: typeWindow }
    }
    return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Sem dados suficientes para confirmar', evidence: [], confidence: 0, resolutionType: resType, windowMinutes: typeWindow }
  }
  if (minutesSinceTrigger >= typeWindow && !isFinished) {
    return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Janela expirou sem dados suficientes', evidence: [], confidence: 0, resolutionType: resType, windowMinutes: typeWindow }
  }

  return null
}
