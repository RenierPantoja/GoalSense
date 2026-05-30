/**
 * patternDryRunEngine — runs a pattern against current fixtures WITHOUT side effects.
 * ─────────────────────────────────────────────────────────────────────────────
 * Dry-run is read-only. It must never register alerts, mutate storage, or
 * trigger notifications. It uses the exact same evaluator and precision engine
 * that the live system uses, ensuring results match what would happen if the
 * pattern were active.
 *
 * No mocks. No invented data. No side effects.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { Pattern, FixtureStatsForPattern } from '../types/commandTypes'
import type { CommandTimedEvent } from './commandTimedEvents'
import type { CommandCenterAlert } from '@/context/AlertsContext'
import { evaluatePattern } from './patternEvaluator'
import { applyPrecisionChecks, type DataQuality, type SignalState } from './patternPrecisionEngine'
import { isDuplicateAlert } from './alertDuplicateGuard'

// --- Types ----------------------------------------------------------------

export type DryRunSignalState = SignalState | 'insufficient_data' | 'out_of_scope'

export interface PatternDryRunResult {
  fixtureId: number
  matchLabel: string
  league?: string
  minute?: number
  score?: string
  provider?: string

  matched: boolean
  signalState: DryRunSignalState
  rawConfidence?: number
  adjustedConfidence?: number
  dataQuality?: DataQuality
  momentumSource?: 'timed_events' | 'mixed' | 'stats_proxy' | 'insufficient'
  recencyConfidence?: number

  blockers: string[]
  reasons: string[]
  recentEventsUsed: Array<{
    minute: number
    type: string
    teamName?: string
    playerName?: string
    description?: string
  }>

  wouldAlert: boolean
  wouldNotify: boolean
}

export interface DryRunInput {
  pattern: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  fixtures: LiveFixture[]
  statsMap: Map<number, FixtureStatsForPattern>
  eventsMap: Map<number, CommandTimedEvent[]>
  isFavoriteTeam?: (name: string) => boolean
  /** V12: existing alerts for duplicate guard check. */
  commandAlerts?: CommandCenterAlert[]
}

export interface DryRunValidation {
  valid: boolean
  errors: string[]
}

// --- Validation -----------------------------------------------------------

/**
 * Validate that a pattern draft is complete enough to run a dry-run.
 */
export function validateDryRunPattern(
  pattern: Partial<Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>>
): DryRunValidation {
  const errors: string[] = []

  if (!pattern.name || pattern.name.trim().length === 0) {
    errors.push('Defina nome do radar')
  }
  if (!pattern.conditions || pattern.conditions.length === 0) {
    errors.push('Adicione pelo menos uma condição')
  }
  if (!pattern.scope) {
    errors.push('Escolha escopo válido')
  }

  return { valid: errors.length === 0, errors }
}

// --- Main -----------------------------------------------------------------

/**
 * Run a pattern against current fixtures using the real evaluator and precision
 * engine. Returns results for every fixture evaluated (including non-matches).
 *
 * Dry-run is read-only. It must never register alerts or mutate storage.
 */
export function runPatternDryRun(input: DryRunInput): PatternDryRunResult[] {
  const { pattern, fixtures, statsMap, eventsMap, isFavoriteTeam = () => false, commandAlerts = [] } = input

  // Build a full Pattern object for the evaluator (it requires 'active' status)
  const fullPattern: Pattern = {
    id: pattern.id || '__dry_run__',
    name: pattern.name || 'Dry Run',
    description: pattern.description || '',
    conditions: pattern.conditions || [],
    severity: pattern.severity || 'attention',
    status: 'active', // Force active so evaluator doesn't skip it
    isTemplate: pattern.isTemplate || false,
    templateId: pattern.templateId,
    scope: pattern.scope || 'all',
    scopeFilter: pattern.scopeFilter,
    matches: pattern.matches,
    excludeLeagues: pattern.excludeLeagues,
    excludeTeams: pattern.excludeTeams,
    excludeMatches: pattern.excludeMatches,
    requireRichData: pattern.requireRichData,
    onlyLive: pattern.onlyLive,
    onlyPreMatch: pattern.onlyPreMatch,
    minConfidence: pattern.minConfidence ?? 50,
    action: pattern.action || 'register_alert',
    maxTriggersPerMatch: pattern.maxTriggersPerMatch ?? 2,
    antiDuplicateWindow: pattern.antiDuplicateWindow ?? 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // Limit to prevent UI freeze — prioritize live matches
  const isLive = (fx: LiveFixture) => ['LIVE', 'HT', '1H', '2H'].includes(fx.status.short)
  const sorted = [...fixtures].sort((a, b) => {
    const aLive = isLive(a) ? 1 : 0
    const bLive = isLive(b) ? 1 : 0
    return bLive - aLive
  })
  const capped = sorted.slice(0, 50)

  const results: PatternDryRunResult[] = []

  for (const fx of capped) {
    const stats = statsMap.get(fx.id)
    const events = eventsMap.get(fx.id)
    const matchLabel = `${fx.homeTeam.name} x ${fx.awayTeam.name}`
    const score = `${fx.score.home ?? 0}-${fx.score.away ?? 0}`

    // Run the real evaluator
    const hit = evaluatePattern(fullPattern, fx, stats, isFavoriteTeam)

    if (!hit) {
      // Pattern didn't match this fixture — determine why
      const hasStats = !!stats
      const signalState: DryRunSignalState = !hasStats && fullPattern.requireRichData
        ? 'insufficient_data'
        : 'out_of_scope'

      results.push({
        fixtureId: fx.id,
        matchLabel,
        league: fx.league?.name,
        minute: fx.status.elapsed || undefined,
        score,
        provider: fx.provider,
        matched: false,
        signalState,
        blockers: signalState === 'insufficient_data' ? ['Dados ricos exigidos mas não disponíveis'] : [],
        reasons: [],
        recentEventsUsed: [],
        wouldAlert: false,
        wouldNotify: false,
      })
      continue
    }

    // Run the real precision engine
    const precision = applyPrecisionChecks(hit, fullPattern, fx, stats, events)

    // Extract momentum/events info
    let momentumSource: PatternDryRunResult['momentumSource']
    let recencyConfidence: number | undefined
    const recentEventsUsed: PatternDryRunResult['recentEventsUsed'] = []

    if (events && events.length > 0 && fx.status.elapsed) {
      const recentWindow = 10
      const recent = events
        .filter(e => e.minute >= (fx.status.elapsed! - recentWindow) && e.minute <= fx.status.elapsed!)
        .slice(0, 5)

      const offTypes = ['shot_on_target', 'shot_off_target', 'corner', 'dangerous_attack', 'goal', 'penalty_scored']
      const offRecent = recent.filter(e => offTypes.includes(e.type))

      momentumSource = offRecent.length >= 1 ? 'timed_events' : stats ? 'stats_proxy' : 'insufficient'
      recencyConfidence = offRecent.length >= 3 ? 85 : offRecent.length >= 1 ? 65 : 35

      for (const e of recent) {
        recentEventsUsed.push({
          minute: e.minute,
          type: e.type,
          teamName: e.teamName,
          playerName: e.playerName,
          description: e.description,
        })
      }
    } else {
      momentumSource = stats ? 'stats_proxy' : 'insufficient'
    }

    // Determine wouldAlert and wouldNotify
    let wouldAlert = precision.shouldAlert
    // suggest_only never notifies; only register_alert with shouldAlert would notify
    let wouldNotify = wouldAlert && fullPattern.action === 'register_alert'

    // V12: Check duplicate guard (read-only, no side effects)
    if (wouldAlert && commandAlerts.length > 0) {
      const dupCheck = isDuplicateAlert(
        { fixtureId: fx.id, patternId: fullPattern.id, score: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 }, minute: fx.status.elapsed || null, momentumSource: momentumSource },
        commandAlerts,
        { includeResolved: true }
      )
      if (dupCheck.duplicate) {
        wouldAlert = false
        wouldNotify = false
        precision.blockers.push(dupCheck.reason || 'Bloqueado para evitar duplicidade no mesmo jogo')
      }
    }

    results.push({
      fixtureId: fx.id,
      matchLabel,
      league: fx.league?.name,
      minute: fx.status.elapsed || undefined,
      score,
      provider: fx.provider,
      matched: true,
      signalState: precision.signalState,
      rawConfidence: hit.confidence,
      adjustedConfidence: precision.adjustedConfidence,
      dataQuality: precision.dataQuality,
      momentumSource,
      recencyConfidence,
      blockers: precision.blockers,
      reasons: [...hit.reasons, ...precision.reasons],
      recentEventsUsed,
      wouldAlert,
      wouldNotify,
    })
  }

  // Sort: matched first, then by adjustedConfidence desc
  return results.sort((a, b) => {
    if (a.matched && !b.matched) return -1
    if (!a.matched && b.matched) return 1
    return (b.adjustedConfidence ?? 0) - (a.adjustedConfidence ?? 0)
  })
}
