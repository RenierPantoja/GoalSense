/**
 * Pattern Precision Engine V5 — anti-false-positive layer for the Command Center.
 * ---------------------------------------------------------------------------------
 * This module sits between the evaluator output and the alert registration.
 * It applies hard gates, confidence caps, data quality checks, and momentum
 * validation to ensure only high-quality signals become alerts.
 *
 * No mocks. No invented data. No guaranteed outcomes.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { PatternHit, FixtureStatsForPattern, Pattern } from '../types/commandTypes'
import type { CommandTimedEvent } from './commandTimedEvents'
import { buildMomentumWindow, getMomentumAdjustment, patternRequiresMomentum, getMomentumWindowForPattern, type MomentumWindowResult } from './momentumWindowEngine'

// --- Types ----------------------------------------------------------------

export type DataQuality = 'rich' | 'partial' | 'poor'
export type SignalState = 'ready_to_alert' | 'strong_candidate' | 'watch_only' | 'blocked'

export interface PrecisionResult {
  /** Whether this hit should trigger an alert. */
  shouldAlert: boolean
  /** Signal state for the scanner. */
  signalState: SignalState
  /** Adjusted confidence after precision checks. */
  adjustedConfidence: number
  /** Data quality assessment. */
  dataQuality: DataQuality
  /** Maximum confidence allowed given data quality. */
  confidenceCap: number
  /** Reasons the signal was promoted or blocked. */
  reasons: string[]
  /** Blockers preventing alert (empty if shouldAlert). */
  blockers: string[]
  /** Evidence snapshot for audit trail. */
  evidence: PrecisionEvidence
}

export interface PrecisionEvidence {
  fixtureId: number
  patternId: string
  patternName: string
  timestamp: string
  match: { home: string; away: string; league: string; minute: number | null; score: { home: number; away: number }; provider: string }
  dataQuality: DataQuality
  conditionsMatched: number
  conditionsTotal: number
  rawConfidence: number
  adjustedConfidence: number
  confidenceCap: number
  signalState: SignalState
  blockers: string[]
  reasons: string[]
}

// --- Confidence caps by data quality --------------------------------------

const CONFIDENCE_CAP_RICH = 95
const CONFIDENCE_CAP_PARTIAL = 72
const CONFIDENCE_CAP_POOR = 55

// --- Data quality assessment ----------------------------------------------

function assessDataQuality(_fixture: LiveFixture, stats: FixtureStatsForPattern | undefined): DataQuality {
  if (!stats) return 'poor'
  const hasShots = stats.shots !== undefined && (stats.shots.home > 0 || stats.shots.away > 0)
  const hasShotsOnTarget = stats.shotsOnTarget !== undefined
  const hasPossession = stats.possession !== undefined && (stats.possession.home > 0)

  if (hasShots && hasShotsOnTarget && hasPossession) return 'rich'
  if (hasShots || hasShotsOnTarget || hasPossession) return 'partial'
  return 'poor'
}

// --- Hard gates -----------------------------------------------------------

interface GateResult {
  passed: boolean
  blocker?: string
}

function checkHardGates(_hit: PatternHit, pattern: Pattern, fixture: LiveFixture, dataQuality: DataQuality): GateResult[] {
  const gates: GateResult[] = []
  const elapsed = fixture.status.elapsed || 0
  const isLive = ['LIVE', 'HT', '1H', '2H'].includes(fixture.status.short)

  // Gate 1: Pattern must be active
  if (pattern.status !== 'active') {
    gates.push({ passed: false, blocker: 'Padrão não está ativo' })
  }

  // Gate 2: Match must be live for live-only patterns
  if (pattern.onlyLive && !isLive) {
    gates.push({ passed: false, blocker: 'Partida não está ao vivo' })
  }

  // Gate 3: Data quality gate for critical patterns
  if (pattern.severity === 'critical' && dataQuality === 'poor') {
    gates.push({ passed: false, blocker: 'Dados insuficientes para alerta crítico' })
  }

  // Gate 4: Require rich data if pattern demands it
  if (pattern.requireRichData && dataQuality === 'poor') {
    gates.push({ passed: false, blocker: 'Dados ricos exigidos pelo escopo' })
  }

  // Gate 5: Match must have reliable minute
  if (isLive && elapsed === 0 && pattern.conditions.some(c => c.type === 'minute_between' || c.type === 'is_final_phase')) {
    gates.push({ passed: false, blocker: 'Minuto não confiável' })
  }

  // Gate 6: suggest_only patterns cannot trigger alerts
  if (pattern.action === 'suggest_only') {
    gates.push({ passed: false, blocker: 'Padrão configurado como sugestão apenas' })
  }

  // Gate 7: Match must not be finished/suspended
  if (['FT', 'AET', 'PEN', 'SUSP', 'ABD'].includes(fixture.status.short)) {
    gates.push({ passed: false, blocker: 'Partida encerrada ou suspensa' })
  }

  return gates
}

// --- Main precision check -------------------------------------------------

/**
 * Apply precision checks to a pattern hit before allowing it to become an alert.
 */
export function applyPrecisionChecks(
  hit: PatternHit,
  pattern: Pattern,
  fixture: LiveFixture,
  stats: FixtureStatsForPattern | undefined,
  events?: CommandTimedEvent[],
): PrecisionResult {
  const reasons: string[] = []
  const blockers: string[] = []

  // 1. Assess data quality
  const dataQuality = assessDataQuality(fixture, stats)
  const confidenceCap = dataQuality === 'rich' ? CONFIDENCE_CAP_RICH
    : dataQuality === 'partial' ? CONFIDENCE_CAP_PARTIAL
    : CONFIDENCE_CAP_POOR

  // 2. Apply confidence cap
  let adjustedConfidence = Math.min(hit.confidence, confidenceCap)
  if (adjustedConfidence < hit.confidence) {
    reasons.push(`Confiança limitada por qualidade de dados (${dataQuality}): ${hit.confidence} → ${adjustedConfidence}`)
  }

  // 3. Check hard gates
  const gates = checkHardGates(hit, pattern, fixture, dataQuality)
  const failedGates = gates.filter(g => !g.passed)
  for (const g of failedGates) {
    if (g.blocker) blockers.push(g.blocker)
  }

  // 4. Check minimum confidence after adjustment
  if (adjustedConfidence < pattern.minConfidence) {
    blockers.push(`Confiança ${adjustedConfidence}% abaixo do mínimo ${pattern.minConfidence}%`)
  }

  // 4b. Momentum validation for offensive patterns
  let momentum: MomentumWindowResult | undefined
  if (patternRequiresMomentum(pattern) && blockers.length === 0) {
    const windowMin = getMomentumWindowForPattern(pattern)
    momentum = buildMomentumWindow(fixture, stats, windowMin, events)
    const { adjustment, reason: momReason } = getMomentumAdjustment(momentum, pattern.name)
    if (adjustment !== 0) {
      adjustedConfidence = Math.max(20, Math.min(confidenceCap, adjustedConfidence + adjustment))
      if (momReason) reasons.push(momReason)
    }

    // Apply momentum source caps
    const momentumCap = momentum.momentumSource === 'timed_events' ? 95
      : momentum.momentumSource === 'mixed' ? 88
      : momentum.momentumSource === 'stats_proxy' ? 68
      : 50
    if (adjustedConfidence > momentumCap) {
      adjustedConfidence = momentumCap
      reasons.push(`Cap por fonte de momentum (${momentum.momentumSource}): max ${momentumCap}%`)
    }

    // Strict mode: critical offensive patterns require confirmed recency
    if (pattern.severity === 'critical' && pattern.action === 'register_alert') {
      if (momentum.momentumSource === 'stats_proxy' || momentum.momentumSource === 'insufficient') {
        blockers.push('Padrão crítico exige recência confirmada por eventos')
      } else if (momentum.momentumSource === 'mixed' && momentum.recencyConfidence < 70) {
        blockers.push('Recência insuficiente para padrão crítico')
      }
    }

    // Re-check min confidence after momentum adjustment + caps
    if (adjustedConfidence < pattern.minConfidence && blockers.length === 0) {
      blockers.push(`Confiança pós-momentum ${adjustedConfidence}% abaixo do mínimo ${pattern.minConfidence}%`)
    }
    // Add momentum blockers for falling trend
    if (!momentum.hasRecentActivity && momentum.trend === 'falling' && blockers.length === 0) {
      blockers.push('Sem pressão ofensiva recente')
    }
  }

  // 5. Determine signal state
  let signalState: SignalState
  let shouldAlert = false

  if (blockers.length > 0) {
    signalState = failedGates.some(g => g.blocker?.includes('sugestão') || g.blocker?.includes('encerrada') || g.blocker?.includes('ativo'))
      ? 'blocked'
      : 'watch_only'
  } else if (adjustedConfidence >= pattern.minConfidence && pattern.action === 'register_alert') {
    signalState = 'ready_to_alert'
    shouldAlert = true
    reasons.push('Todas as condições atendidas')
  } else if (adjustedConfidence >= pattern.minConfidence * 0.8) {
    signalState = 'strong_candidate'
    reasons.push('Próximo do limiar de alerta')
  } else {
    signalState = 'watch_only'
    reasons.push('Confiança insuficiente para alerta')
  }

  // 6. Build evidence
  const evidence: PrecisionEvidence = {
    fixtureId: fixture.id,
    patternId: hit.patternId,
    patternName: hit.patternName,
    timestamp: new Date().toISOString(),
    match: {
      home: fixture.homeTeam.name,
      away: fixture.awayTeam.name,
      league: fixture.league.name,
      minute: fixture.status.elapsed || null,
      score: { home: fixture.score.home ?? 0, away: fixture.score.away ?? 0 },
      provider: fixture.provider || 'unknown',
    },
    dataQuality,
    conditionsMatched: hit.matchedConditions,
    conditionsTotal: hit.totalConditions,
    rawConfidence: hit.confidence,
    adjustedConfidence,
    confidenceCap,
    signalState,
    blockers,
    reasons,
  }

  return { shouldAlert, signalState, adjustedConfidence, dataQuality, confidenceCap, reasons, blockers, evidence }
}

/**
 * Get a human-readable explanation of why a signal was blocked.
 */
export function getBlockerExplanation(result: PrecisionResult): string {
  if (result.blockers.length === 0) return ''
  return result.blockers.join(' · ')
}
