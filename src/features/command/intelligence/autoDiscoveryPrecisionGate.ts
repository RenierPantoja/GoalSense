/**
 * autoDiscoveryPrecisionGate — validates auto-discovery candidates through
 * the same Precision Engine gates used by manual patterns.
 * ─────────────────────────────────────────────────────────────────────────────
 * No auto-discovery signal should become an alert without passing precision
 * validation equivalent to manual patterns. This module bridges the gap.
 *
 * No mocks. No invented data. No side effects.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { AutoDiscoveryConfig, FixtureStatsForPattern } from '../types/commandTypes'
import type { CommandTimedEvent } from './commandTimedEvents'
import type { AutoDiscovery } from './autoDiscoveryEngine'
import type { DataQuality } from './patternPrecisionEngine'
import { buildMomentumWindow, getMomentumAdjustment, type MomentumWindowResult } from './momentumWindowEngine'

// --- Types ----------------------------------------------------------------

export type AutoDiscoveryState = 'ready_to_alert' | 'suggestion' | 'watch_only' | 'blocked' | 'insufficient_data'

export interface AutoDiscoveryCandidate {
  fixtureId: number
  matchLabel: string
  discoveryType: AutoDiscovery['type']
  rawConfidence: number
  reasons: string[]
  suggestedAction: 'suggest_only' | 'register_alert'
  syntheticPatternLike: {
    name: string
    severity: 'critical' | 'attention' | 'info'
    action: 'register_alert' | 'suggest_only'
    minConfidence: number
    requireRichData?: boolean
  }
}

export interface AutoDiscoveryValidationResult {
  state: AutoDiscoveryState
  rawConfidence: number
  adjustedConfidence: number
  dataQuality: DataQuality
  momentumSource: 'timed_events' | 'mixed' | 'stats_proxy' | 'insufficient'
  recencyConfidence: number
  blockers: string[]
  reasons: string[]
  temporalEvidence: {
    momentumSource: 'timed_events' | 'mixed' | 'stats_proxy' | 'insufficient'
    recencyConfidence: number
    windowMinutes: number
    recentEventsUsed: { minute: number; type: string; side: string; teamName?: string; playerName?: string }[]
  }
  wouldAlert: boolean
}

// --- Constants ------------------------------------------------------------

// Rigor-specific caps
const RIGOR_CAPS = {
  conservative: { rich: 85, partial: 60, poor: 40, requireTimedForAttention: true },
  balanced: { rich: 90, partial: 68, poor: 50, requireTimedForAttention: false },
  aggressive: { rich: 95, partial: 75, poor: 55, requireTimedForAttention: false },
} as const

// --- Helpers --------------------------------------------------------------

function assessDataQuality(stats: FixtureStatsForPattern | undefined): DataQuality {
  if (!stats) return 'poor'
  const hasShots = stats.shots !== undefined && (stats.shots.home > 0 || stats.shots.away > 0)
  const hasShotsOnTarget = stats.shotsOnTarget !== undefined
  const hasPossession = stats.possession !== undefined && (stats.possession.home > 0)
  if (hasShots && hasShotsOnTarget && hasPossession) return 'rich'
  if (hasShots || hasShotsOnTarget || hasPossession) return 'partial'
  return 'poor'
}

function inferSeverity(type: AutoDiscovery['type']): 'critical' | 'attention' | 'info' {
  if (type === 'final_phase' || type === 'favorite_risk') return 'attention'
  return 'info'
}

function discoveryRequiresMomentum(type: AutoDiscovery['type']): boolean {
  return type === 'pressure' || type === 'dominance' || type === 'open_game' || type === 'final_phase'
}

// --- Main -----------------------------------------------------------------

/**
 * Convert an AutoDiscovery into a candidate for precision validation.
 */
export function buildAutoDiscoveryCandidate(
  discovery: AutoDiscovery,
  config: AutoDiscoveryConfig,
): AutoDiscoveryCandidate {
  const severity = inferSeverity(discovery.type)
  return {
    fixtureId: discovery.fixtureId,
    matchLabel: `${discovery.fixture.homeTeam.name} x ${discovery.fixture.awayTeam.name}`,
    discoveryType: discovery.type,
    rawConfidence: discovery.confidence,
    reasons: [discovery.evidence].filter(Boolean),
    suggestedAction: config.registerAlertAuto ? 'register_alert' : 'suggest_only',
    syntheticPatternLike: {
      name: discovery.insight || `auto_${discovery.type}`,
      severity,
      action: config.registerAlertAuto ? 'register_alert' : 'suggest_only',
      minConfidence: config.minConfidence,
      requireRichData: config.rigor === 'conservative',
    },
  }
}

/**
 * Validate an auto-discovery candidate through precision gates.
 * Uses the same momentum engine, data quality assessment, and confidence caps
 * as the manual pattern precision engine.
 */
export function validateAutoDiscoveryCandidate(
  candidate: AutoDiscoveryCandidate,
  fixture: LiveFixture,
  stats: FixtureStatsForPattern | undefined,
  events: CommandTimedEvent[] | undefined,
  config: AutoDiscoveryConfig,
  manualAlertFixtureIds?: Set<number>,
): AutoDiscoveryValidationResult {
  const blockers: string[] = []
  const reasons: string[] = []
  const rigorCaps = RIGOR_CAPS[config.rigor || 'balanced']

  // 1. Data quality assessment
  const dataQuality = assessDataQuality(stats)
  const confidenceCap = dataQuality === 'rich' ? rigorCaps.rich
    : dataQuality === 'partial' ? rigorCaps.partial
    : rigorCaps.poor

  // 2. Apply confidence cap
  let adjustedConfidence = Math.min(candidate.rawConfidence, confidenceCap)
  if (adjustedConfidence < candidate.rawConfidence) {
    reasons.push(`Confiança limitada por qualidade de dados (${dataQuality}): ${candidate.rawConfidence} → ${adjustedConfidence}`)
  }

  // 3. Hard gates
  // Gate: requireRichData in conservative mode
  if (rigorCaps === RIGOR_CAPS.conservative && dataQuality === 'poor') {
    blockers.push('Modo conservador exige dados ricos')
  }

  // Gate: match must be live for live discoveries
  const isLive = ['LIVE', 'HT', '1H', '2H'].includes(fixture.status.short)
  if (!isLive && candidate.discoveryType !== 'starting_soon') {
    blockers.push('Partida não está ao vivo')
  }

  // Gate: match must not be finished
  if (['FT', 'AET', 'PEN', 'SUSP', 'ABD'].includes(fixture.status.short)) {
    blockers.push('Partida encerrada ou suspensa')
  }

  // Gate: suggest_only never alerts
  if (candidate.suggestedAction === 'suggest_only') {
    blockers.push('Configurado como sugestão apenas')
  }

  // Gate: anti-duplicate with manual patterns
  if (manualAlertFixtureIds && manualAlertFixtureIds.has(fixture.id)) {
    blockers.push('Padrão manual já alertou para esta partida')
  }

  // 4. Momentum validation for offensive discovery types
  let momentum: MomentumWindowResult | undefined
  let momentumSource: AutoDiscoveryValidationResult['momentumSource'] = 'insufficient'
  let recencyConfidence = 0
  const recentEventsUsed: AutoDiscoveryValidationResult['temporalEvidence']['recentEventsUsed'] = []

  if (discoveryRequiresMomentum(candidate.discoveryType) && blockers.length === 0) {
    momentum = buildMomentumWindow(fixture, stats, 10, events)
    momentumSource = momentum.momentumSource
    recencyConfidence = momentum.recencyConfidence

    const { adjustment, reason: momReason } = getMomentumAdjustment(momentum, candidate.syntheticPatternLike.name)
    if (adjustment !== 0) {
      adjustedConfidence = Math.max(20, Math.min(confidenceCap, adjustedConfidence + adjustment))
      if (momReason) reasons.push(momReason)
    }

    // Momentum source caps
    const momentumCap = momentum.momentumSource === 'timed_events' ? 90
      : momentum.momentumSource === 'mixed' ? 80
      : momentum.momentumSource === 'stats_proxy' ? 60
      : 45
    if (adjustedConfidence > momentumCap) {
      adjustedConfidence = momentumCap
      reasons.push(`Cap por fonte de momentum (${momentum.momentumSource}): max ${momentumCap}%`)
    }

    // Conservative rigor: attention-level discoveries require timed events
    if (rigorCaps.requireTimedForAttention && candidate.syntheticPatternLike.severity === 'attention') {
      if (momentum.momentumSource === 'stats_proxy' || momentum.momentumSource === 'insufficient') {
        blockers.push('Modo conservador exige recência confirmada para descobertas de atenção')
      }
    }

    // Falling trend blocks
    if (!momentum.hasRecentActivity && momentum.trend === 'falling' && blockers.length === 0) {
      blockers.push('Sem pressão ofensiva recente')
    }

    // Extract recent events for temporal evidence
    if (events && fixture.status.elapsed) {
      const recent = events
        .filter(e => e.minute >= (fixture.status.elapsed! - 10) && e.minute <= fixture.status.elapsed!)
        .slice(0, 5)
      for (const e of recent) {
        recentEventsUsed.push({
          minute: e.minute,
          type: e.type,
          side: e.side,
          teamName: e.teamName,
          playerName: e.playerName,
        })
      }
    }
  } else {
    // Non-momentum types: still assess source
    if (events && events.length > 0 && fixture.status.elapsed) {
      const recent = events
        .filter(e => e.minute >= (fixture.status.elapsed! - 10) && e.minute <= fixture.status.elapsed!)
      const offTypes = ['shot_on_target', 'shot_off_target', 'corner', 'dangerous_attack', 'goal', 'penalty_scored']
      const offRecent = recent.filter(e => offTypes.includes(e.type))
      momentumSource = offRecent.length >= 1 ? 'timed_events' : stats ? 'stats_proxy' : 'insufficient'
      recencyConfidence = offRecent.length >= 3 ? 85 : offRecent.length >= 1 ? 65 : 35
      for (const e of recent.slice(0, 5)) {
        recentEventsUsed.push({ minute: e.minute, type: e.type, side: e.side, teamName: e.teamName, playerName: e.playerName })
      }
    } else {
      momentumSource = stats ? 'stats_proxy' : 'insufficient'
      recencyConfidence = stats ? 35 : 10
    }
  }

  // 5. Final confidence check
  if (adjustedConfidence < candidate.syntheticPatternLike.minConfidence && blockers.length === 0) {
    blockers.push(`Confiança ${adjustedConfidence}% abaixo do mínimo ${candidate.syntheticPatternLike.minConfidence}%`)
  }

  // 6. Determine state
  let state: AutoDiscoveryState
  let wouldAlert = false

  if (blockers.length > 0) {
    if (blockers.some(b => b.includes('sugestão') || b.includes('encerrada') || b.includes('manual já alertou'))) {
      state = 'blocked'
    } else if (dataQuality === 'poor' && blockers.some(b => b.includes('dados'))) {
      state = 'insufficient_data'
    } else {
      state = 'watch_only'
    }
  } else if (adjustedConfidence >= candidate.syntheticPatternLike.minConfidence && candidate.suggestedAction === 'register_alert') {
    state = 'ready_to_alert'
    wouldAlert = true
    reasons.push('Todas as condições de precisão atendidas')
  } else if (adjustedConfidence >= candidate.syntheticPatternLike.minConfidence * 0.8) {
    state = 'suggestion'
    reasons.push('Próximo do limiar — sugestão')
  } else {
    state = 'watch_only'
    reasons.push('Confiança insuficiente para alerta')
  }

  return {
    state,
    rawConfidence: candidate.rawConfidence,
    adjustedConfidence,
    dataQuality,
    momentumSource,
    recencyConfidence,
    blockers,
    reasons,
    temporalEvidence: {
      momentumSource,
      recencyConfidence,
      windowMinutes: 10,
      recentEventsUsed,
    },
    wouldAlert,
  }
}

/**
 * Process all auto-discoveries through precision validation.
 * Returns only those that pass as ready_to_alert or suggestion.
 */
export function validateAllAutoDiscoveries(
  discoveries: AutoDiscovery[],
  statsMap: Map<number, FixtureStatsForPattern>,
  eventsMap: Map<number, CommandTimedEvent[]>,
  config: AutoDiscoveryConfig,
  manualAlertFixtureIds?: Set<number>,
): Array<{ discovery: AutoDiscovery; candidate: AutoDiscoveryCandidate; validation: AutoDiscoveryValidationResult }> {
  return discoveries.map(d => {
    const candidate = buildAutoDiscoveryCandidate(d, config)
    const validation = validateAutoDiscoveryCandidate(
      candidate,
      d.fixture,
      statsMap.get(d.fixtureId),
      eventsMap.get(d.fixtureId),
      config,
      manualAlertFixtureIds,
    )
    return { discovery: d, candidate, validation }
  })
}
