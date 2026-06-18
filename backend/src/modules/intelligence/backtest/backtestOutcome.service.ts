/**
 * Backtest Outcome Estimation (Phase B14) — honest, read-only.
 * ─────────────────────────────────────────────────────────────────────────────
 * Classifies a simulated signal's outcome using ONLY real post-trigger snapshots.
 * Mirrors the B8 resolution philosophy (windows by signal type) but never calls
 * the production resolver, never writes, and never invents events.
 *
 * Rules: `unknown` ≠ `failed`; no post data ⇒ `not_evaluable`; a goal only
 * confirms goal-type signals (corners/cards have their own criteria).
 */
import type { BacktestOutcomeGuess } from './backtest.types.js'
import type { RawSnapshot } from './utils/replayTimeline.util.js'

const RESOLUTION_WINDOWS: Record<string, number> = {
  goal_pressure: 12, late_goal: 15, over_trend: 15, open_game: 15, dominance: 15,
  favorite_risk: 15, underdog_threat: 15, corner_pressure: 8, card_heat: 12, custom_unknown: 10,
}
const GOAL_TYPES = new Set(['goal_pressure', 'late_goal', 'over_trend', 'open_game', 'dominance', 'favorite_risk', 'underdog_threat'])
const CORNER_TYPES = new Set(['corner_pressure'])
const CARD_TYPES = new Set(['card_heat'])

/** Infer the resolution type from the pattern name / signal type (mirrors B8). */
export function inferResolutionType(patternName: string, signalType?: string): string {
  const n = `${patternName || ''} ${signalType || ''}`.toLowerCase()
  if (n.includes('escanteio') || n.includes('corner')) return 'corner_pressure'
  if (n.includes('cartao') || n.includes('cartão') || n.includes('card') || n.includes('falta')) return 'card_heat'
  if (n.includes('reta final') || n.includes('late')) return 'late_goal'
  if (n.includes('over') || n.includes('acima')) return 'over_trend'
  if (n.includes('gol') || n.includes('goal') || n.includes('pressao') || n.includes('pressão')) return 'goal_pressure'
  if (n.includes('favorito') || n.includes('favorite')) return 'favorite_risk'
  if (n.includes('zebra') || n.includes('underdog')) return 'underdog_threat'
  if (n.includes('aberto') || n.includes('open')) return 'open_game'
  if (n.includes('dominio') || n.includes('domínio') || n.includes('dominance')) return 'dominance'
  return 'custom_unknown'
}

function safeParse<T>(s: string | null | undefined, fb: T): T { if (!s) return fb; try { return JSON.parse(s) as T } catch { return fb } }

export interface OutcomeInput {
  patternName: string
  signalType?: string
  triggerMinute: number | null
  triggerScore: { home: number; away: number }
  postSnapshots: RawSnapshot[]
}

export function estimateOutcome(i: OutcomeInput): BacktestOutcomeGuess {
  const resolutionType = inferResolutionType(i.patternName, i.signalType)
  const windowMinutes = RESOLUTION_WINDOWS[resolutionType] || 10
  const warnings: string[] = []
  const post = i.postSnapshots

  const emptyEvidence = { postSnapshots: post.length, goalsInWindow: 0, cornersInWindow: 0, cardsInWindow: 0, hasTimedEvents: false, hasStats: false, warnings }

  if (post.length === 0) {
    return { outcome: 'not_evaluable', reason: 'Sem snapshots após o gatilho — não avaliável', windowMinutes, evidence: emptyEvidence }
  }

  const last = post[post.length - 1]
  const matchFinished = last.status === 'FT' || last.status === 'AET'
  const inShootout = last.status === 'P' || last.status === 'PEN'
  const scoreDelta = { home: (last.scoreHome ?? 0) - i.triggerScore.home, away: (last.scoreAway ?? 0) - i.triggerScore.away }

  let hasStats = false
  for (const s of post) if (s.statsJson) hasStats = true

  let goals = 0, corners = 0, cards = 0, hasTimedEvents = false
  const windowEnd = i.triggerMinute != null ? i.triggerMinute + windowMinutes : null
  const lastWithEvents = [...post].reverse().find(s => s.eventsJson)
  if (lastWithEvents?.eventsJson) {
    const events = safeParse<Array<{ minute: number; type: string }>>(lastWithEvents.eventsJson, [])
    if (events.length > 0) {
      hasTimedEvents = true
      for (const e of events) {
        if (i.triggerMinute != null) {
          if (e.minute < i.triggerMinute) continue
          if (windowEnd != null && e.minute > windowEnd) continue
        }
        if (e.type === 'goal' || e.type === 'penalty_scored' || e.type === 'own_goal') goals++
        else if (e.type === 'corner') corners++
        else if (e.type === 'yellow_card' || e.type === 'red_card') cards++
      }
    }
  }
  if (!hasTimedEvents && (scoreDelta.home > 0 || scoreDelta.away > 0)) {
    goals = scoreDelta.home + scoreDelta.away
    warnings.push('Gols inferidos pela variação de placar (sem eventos cronometrados)')
  }

  const evidence = { postSnapshots: post.length, goalsInWindow: goals, cornersInWindow: corners, cardsInWindow: cards, hasTimedEvents, hasStats, warnings }

  if (inShootout) return { outcome: 'unknown', reason: 'Partida foi para os pênaltis — não confirma padrão de gol', windowMinutes, evidence }

  const isGoal = GOAL_TYPES.has(resolutionType)
  const isCorner = CORNER_TYPES.has(resolutionType)
  const isCard = CARD_TYPES.has(resolutionType)
  const target = isCorner ? corners : isCard ? cards : goals
  const label = isCorner ? 'escanteio' : isCard ? 'cartão' : 'gol'

  if (target > 0 && hasTimedEvents) {
    return { outcome: 'confirmed', reason: `${target} ${label}(s) confirmado(s) por eventos em ${windowMinutes}min`, windowMinutes, evidence }
  }
  if (target > 0) {
    return { outcome: 'confirmed_partial', reason: `${label} observado por variação de dados, sem eventos cronometrados`, windowMinutes, evidence }
  }
  if (!hasTimedEvents && !hasStats) {
    return { outcome: 'unknown', reason: 'Provedor não entregou eventos/estatísticas pós-gatilho', windowMinutes, evidence }
  }
  if (matchFinished || (isGoal && hasTimedEvents && hasStats)) {
    return { outcome: 'failed', reason: `Sem ${label} na janela de ${windowMinutes}min com dados suficientes`, windowMinutes, evidence }
  }
  return { outcome: 'unknown', reason: 'Dados insuficientes para confirmar ou negar', windowMinutes, evidence }
}
