/**
 * Command Evaluation Service — evaluates patterns against live snapshots.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B7: Backend pattern evaluation. Conservative, auditable, no false positives.
 */
import { createRepositories } from '../../repositories/index.js'
import { buildPatternInput, type PatternEvaluationInput } from './snapshotToPatternInput.js'
import { extractBreakdownKeys } from '../performance/performanceInputAdapter.js'
import { evaluateMomentum, type MomentumResult } from './backendMomentum.service.js'
import { checkDuplicate, buildDuplicateSignature } from './backendDuplicateGuard.service.js'
import { deriveMatchContext, contextConfidenceDelta } from './matchContext.service.js'
import { evaluatePatternScope, parseScopeExtended, parseScopeFilter } from './backendScopeFilter.service.js'
import { recordAlertCreated } from '../intelligence/memory/intelligenceMemory.service.js'
import { classifyConditionKind, flattenStats } from '../intelligence/explainability/signalExplainability.service.js'

const DEFAULT_USER = 'default'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EvaluationResult {
  patternId: string
  fixtureId: string
  matchLabel: string
  shouldAlert: boolean
  confidence: number
  signalState: 'ready_to_alert' | 'strong_candidate' | 'watch_only' | 'blocked'
  reasons: string[]
  blockers: string[]
  momentum: MomentumResult | null
  matchedConditions: number
  totalConditions: number
}

export interface WorkerRunResult {
  patternsChecked: number
  fixturesChecked: number
  evaluations: number
  blocked: number
  candidates: number
  alertsCreated: number
  duplicatesBlocked: number
  scopeSkipped: number
  maxTriggersBlocked: number
  errors: string[]
}

// ─── Blocked Statuses ────────────────────────────────────────────────────────

const BLOCKED_STATUSES = new Set(['P', 'PEN', 'FT', 'AET', 'CANC', 'PST', 'SUSP', 'NS'])
const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT'])

// ─── Condition Evaluation ────────────────────────────────────────────────────

/** Exported for read-only diagnostics (radarDiagnostic.service). Pure, no writes. */
export function evaluateCondition(
  condition: { type: string; params: Record<string, any> },
  input: PatternEvaluationInput,
): boolean {
  const { type, params } = condition
  const s = input.stats
  const score = input.score
  const minute = input.minute

  switch (type) {
    case 'is_live':
      return LIVE_STATUSES.has(input.status)
    case 'minute_between':
      return minute != null && minute >= (params.min || 0) && minute <= (params.max || 90)
    case 'score_tied':
      return score.home === score.away
    case 'score_diff_lte':
      return Math.abs(score.home - score.away) <= (params.maxDiff ?? params.value ?? 1)
    case 'goals_total_gte':
      return (score.home + score.away) >= (params.value || 1)
    case 'goals_total_lte':
      return (score.home + score.away) <= (params.value || 3)
    case 'possession_gte':
      return s?.possessionHome != null && (s.possessionHome >= (params.value || 60) || (s.possessionAway ?? 0) >= (params.value || 60))
    case 'shots_on_target_gte':
      return s?.shotsOnTargetHome != null && ((s.shotsOnTargetHome + (s.shotsOnTargetAway ?? 0)) >= (params.value || 4))
    case 'corners_gte':
      return s?.cornersHome != null && ((s.cornersHome + (s.cornersAway ?? 0)) >= (params.value || 6))
    case 'cards_gte':
      return s?.yellowCardsHome != null && ((s.yellowCardsHome + (s.yellowCardsAway ?? 0) + (s.redCardsHome ?? 0) + (s.redCardsAway ?? 0)) >= (params.value || 3))
    case 'is_final_phase':
      return minute != null && minute >= 75
    case 'shots_total_gte':
      return s?.shotsHome != null && ((s.shotsHome + (s.shotsAway ?? 0)) >= (params.value || 10))
    case 'home_shots_on_target_gte':
      return s?.shotsOnTargetHome != null && s.shotsOnTargetHome >= (params.value || 3)
    case 'away_shots_on_target_gte':
      return s?.shotsOnTargetAway != null && s.shotsOnTargetAway >= (params.value || 3)
    case 'home_possession_gte':
      return s?.possessionHome != null && s.possessionHome >= (params.value || 60)
    case 'away_possession_gte':
      return s?.possessionAway != null && s.possessionAway >= (params.value || 60)
    case 'home_corners_gte':
      return s?.cornersHome != null && s.cornersHome >= (params.value || 4)
    case 'away_corners_gte':
      return s?.cornersAway != null && s.cornersAway >= (params.value || 4)
    case 'home_goals_gte':
      return score.home >= (params.value || 1)
    case 'away_goals_gte':
      return score.away >= (params.value || 1)
    case 'yellow_cards_gte':
      return s?.yellowCardsHome != null && ((s.yellowCardsHome + (s.yellowCardsAway ?? 0)) >= (params.value || 4))
    case 'red_cards_gte':
      return s?.redCardsHome != null && ((s.redCardsHome + (s.redCardsAway ?? 0)) >= (params.value || 1))
    case 'shots_recent_gte':
      // Catalog defines this as "soma de finalizações dos dois times" (total),
      // so it resolves against total shots — no invented "recent" window.
      return s?.shotsHome != null && ((s.shotsHome + (s.shotsAway ?? 0)) >= (params.value || 8))
    case 'favorite_involved': {
      const favs = input.favoriteTeams
      if (!favs || favs.length === 0) return false
      const teamHit = (name: string) => favs.some(f => normName(f) === normName(name) || (normName(f).length >= 4 && normName(name).includes(normName(f))))
      return teamHit(input.homeName) || teamHit(input.awayName)
    }
    case 'is_pre_live':
      // The live worker only sees live fixtures; a pre-live gate is never true here.
      return false
    default:
      return false // Unknown condition type — conservative: don't match
  }
}

/** Accent-insensitive name normalization used by favorite matching. */
function normName(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// ─── Pattern Evaluation ──────────────────────────────────────────────────────

export function evaluatePatternAgainstInput(
  pattern: { id: string; name: string; conditions: any[]; minConfidence: number; severity: string; requireRichData?: boolean; action: string; status: string },
  input: PatternEvaluationInput,
): EvaluationResult {
  const blockers: string[] = []
  const reasons: string[] = []

  // ─── Hard Gates ────────────────────────────────────────────────────────
  if (pattern.status !== 'active') {
    blockers.push('Pattern not active')
    return { patternId: pattern.id, fixtureId: input.fixtureId, matchLabel: input.matchLabel, shouldAlert: false, confidence: 0, signalState: 'blocked', reasons, blockers, momentum: null, matchedConditions: 0, totalConditions: pattern.conditions.length }
  }

  if (pattern.action === 'suggest_only' || pattern.action === 'highlight') {
    blockers.push(`Pattern action is ${pattern.action}`)
    return { patternId: pattern.id, fixtureId: input.fixtureId, matchLabel: input.matchLabel, shouldAlert: false, confidence: 0, signalState: 'blocked', reasons, blockers, momentum: null, matchedConditions: 0, totalConditions: pattern.conditions.length }
  }

  if (BLOCKED_STATUSES.has(input.status)) {
    blockers.push(`Match status ${input.status} is blocked`)
    return { patternId: pattern.id, fixtureId: input.fixtureId, matchLabel: input.matchLabel, shouldAlert: false, confidence: 0, signalState: 'blocked', reasons, blockers, momentum: null, matchedConditions: 0, totalConditions: pattern.conditions.length }
  }

  if (!LIVE_STATUSES.has(input.status)) {
    blockers.push(`Match not live (status: ${input.status})`)
    return { patternId: pattern.id, fixtureId: input.fixtureId, matchLabel: input.matchLabel, shouldAlert: false, confidence: 0, signalState: 'blocked', reasons, blockers, momentum: null, matchedConditions: 0, totalConditions: pattern.conditions.length }
  }

  if (pattern.requireRichData && input.dataQuality !== 'rich') {
    blockers.push(`Pattern requires rich data, got ${input.dataQuality}`)
    return { patternId: pattern.id, fixtureId: input.fixtureId, matchLabel: input.matchLabel, shouldAlert: false, confidence: 0, signalState: 'blocked', reasons, blockers, momentum: null, matchedConditions: 0, totalConditions: pattern.conditions.length }
  }

  if (pattern.severity === 'critical' && input.dataQuality === 'poor') {
    blockers.push('Critical pattern blocked by poor data quality')
    return { patternId: pattern.id, fixtureId: input.fixtureId, matchLabel: input.matchLabel, shouldAlert: false, confidence: 0, signalState: 'blocked', reasons, blockers, momentum: null, matchedConditions: 0, totalConditions: pattern.conditions.length }
  }

  // ─── Condition Evaluation ──────────────────────────────────────────────
  const conditions = Array.isArray(pattern.conditions) ? pattern.conditions : []
  if (conditions.length === 0) {
    blockers.push('Pattern has no conditions')
    return { patternId: pattern.id, fixtureId: input.fixtureId, matchLabel: input.matchLabel, shouldAlert: false, confidence: 0, signalState: 'blocked', reasons, blockers, momentum: null, matchedConditions: 0, totalConditions: 0 }
  }

  let matched = 0
  for (const cond of conditions) {
    if (evaluateCondition(cond, input)) {
      matched++
      reasons.push(`${cond.type} matched`)
    }
  }

  const matchRatio = matched / conditions.length
  if (matchRatio < 0.5) {
    return { patternId: pattern.id, fixtureId: input.fixtureId, matchLabel: input.matchLabel, shouldAlert: false, confidence: Math.round(matchRatio * 100), signalState: 'watch_only', reasons, blockers, momentum: null, matchedConditions: matched, totalConditions: conditions.length }
  }

  // ─── Momentum ──────────────────────────────────────────────────────────
  const momentum = evaluateMomentum(input)

  // ─── Confidence Calculation ────────────────────────────────────────────
  let confidence = Math.round(matchRatio * 80) // Base: up to 80 from conditions
  if (momentum.momentumSource === 'timed_events') confidence += 15
  else if (momentum.momentumSource === 'stats_proxy') confidence += 5
  if (input.dataQuality === 'rich') confidence += 5

  // ─── Match-context intelligence (bounded, conservative) ────────────────
  // High-stakes matches (finals, knockouts, continental) get a small nudge;
  // friendlies a small penalty. This never flips a non-match into a match —
  // the matchRatio gate above already decided the conditions are met.
  if (input.context) {
    const delta = contextConfidenceDelta(input.context)
    if (delta !== 0) {
      confidence += delta
      reasons.push(delta > 0
        ? `Contexto: ${input.context.importanceLabel} (${input.context.competitionType})`
        : `Contexto: ${input.context.competitionType} reduz peso`)
    }
    for (const note of input.context.notes) reasons.push(note)
  }

  confidence = Math.max(1, Math.min(confidence, 99))

  // ─── Signal State ──────────────────────────────────────────────────────
  let signalState: EvaluationResult['signalState'] = 'watch_only'
  if (confidence >= pattern.minConfidence && matchRatio >= 0.7 && momentum.strength !== 'none') {
    signalState = 'ready_to_alert'
  } else if (confidence >= pattern.minConfidence && matchRatio >= 0.6) {
    signalState = 'strong_candidate'
  }

  const shouldAlert = signalState === 'ready_to_alert'

  return {
    patternId: pattern.id,
    fixtureId: input.fixtureId,
    matchLabel: input.matchLabel,
    shouldAlert,
    confidence,
    signalState,
    reasons,
    blockers,
    momentum,
    matchedConditions: matched,
    totalConditions: conditions.length,
  }
}

// ─── Full Evaluation Run ─────────────────────────────────────────────────────

export async function runPatternEvaluation(maxFixtures: number): Promise<WorkerRunResult> {
  const result: WorkerRunResult = { patternsChecked: 0, fixturesChecked: 0, evaluations: 0, blocked: 0, candidates: 0, alertsCreated: 0, duplicatesBlocked: 0, scopeSkipped: 0, maxTriggersBlocked: 0, errors: [] }
  const repos = createRepositories()

  // Load active patterns
  const patterns = await repos.patterns.listActive(DEFAULT_USER)
  result.patternsChecked = patterns.length
  if (patterns.length === 0) return result

  // Load live fixtures with recent snapshots
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT']
  const fixtures = await repos.fixtures.listLive(liveStatuses, maxFixtures)
  result.fixturesChecked = fixtures.length
  if (fixtures.length === 0) return result

  // Load latest snapshot for each fixture
  for (const fixture of fixtures) {
    const snapshot = await repos.liveSnapshots.findLatestByFixture(fixture.id)
    if (!snapshot) continue

    // Check snapshot freshness (max 5 min old). capturedAt may be Date or ISO string.
    const snapshotAge = Date.now() - toDate(snapshot.capturedAt).getTime()
    if (snapshotAge > 5 * 60 * 1000) continue // Stale snapshot

    const baseInput = buildPatternInput(fixture as any, snapshot as any)
    // Analytical context derived from the competition (finals/knockouts/etc.).
    const context = deriveMatchContext(fixture.competition)

    const scopeFx = {
      competition: fixture.competition,
      homeName: fixture.homeName,
      awayName: fixture.awayName,
      canonicalKey: fixture.canonicalKey,
    }

    // Evaluate each pattern
    for (const pattern of patterns) {
      const conditions = safeParseConditions(pattern.conditionsJson)
      const extended = parseScopeExtended(pattern.extendedJson)
      const scopeFilter = parseScopeFilter(pattern.scopeFilterJson)

      // ── Scope enforcement: respect the radar's configured contract ──────
      const scopeDecision = evaluatePatternScope({
        scope: pattern.scope,
        onlyLive: pattern.onlyLive,
        onlyPreMatch: pattern.onlyPreMatch,
        scopeFilter,
        matches: extended.matches,
        excludeLeagues: extended.excludeLeagues,
        excludeTeams: extended.excludeTeams,
        excludeMatches: extended.excludeMatches,
        favoriteTeams: extended.favoriteTeams,
        favoriteLeagues: extended.favoriteLeagues,
      }, scopeFx)
      if (!scopeDecision.inScope) {
        result.scopeSkipped++
        continue
      }

      result.evaluations++

      const input: PatternEvaluationInput = { ...baseInput, context, favoriteTeams: extended.favoriteTeams }

      const evalResult = evaluatePatternAgainstInput(
        { id: pattern.id, name: pattern.name, conditions, minConfidence: pattern.minConfidence, severity: pattern.severity, requireRichData: pattern.requireRichData, action: pattern.action, status: pattern.status },
        input,
      )

      if (evalResult.signalState === 'blocked') {
        result.blocked++
        continue
      }

      if (!evalResult.shouldAlert) {
        if (evalResult.signalState === 'strong_candidate') result.candidates++
        continue
      }

      // ── maxTriggersPerMatch: cap alerts per (pattern, fixture) ──────────
      const maxTriggers = extended.maxTriggersPerMatch ?? 2
      if (maxTriggers > 0) {
        try {
          const existing = await repos.alerts.findByFixtureIds(fixture.id)
          const sameP = existing.filter((a: any) => a.patternId === pattern.id && a.status !== 'rejected' && a.status !== 'expired')
          if (sameP.length >= maxTriggers) {
            result.maxTriggersBlocked++
            continue
          }
        } catch { /* read failure should never block the run */ }
      }

      // Duplicate check
      const dupCheck = await checkDuplicate(
        pattern.id, fixture.id, input.score.home, input.score.away, input.minute,
      )
      if (dupCheck.duplicate) {
        result.duplicatesBlocked++
        continue
      }

      // Create alert
      try {
        const signature = buildDuplicateSignature(pattern.id, fixture.id, input.score.home, input.score.away, input.minute)
        const evidenceData = {
          patternName: pattern.name,
          homeTeam: fixture.homeName,
          awayTeam: fixture.awayName,
          competition: fixture.competition,
          severity: pattern.severity,
          evidences: evalResult.reasons,
          scope: { resolved: scopeDecision.reason },
          matchContext: {
            competitionType: context.competitionType,
            stage: context.stage,
            isKnockout: context.isKnockout,
            importance: context.importance,
            importanceLabel: context.importanceLabel,
          },
          triggerSnapshot: { provider: input.provider, stats: input.stats, dataQuality: input.dataQuality },
          source: 'backend_worker',
        }
        const temporalData = evalResult.momentum ? {
          momentumSource: evalResult.momentum.momentumSource,
          recencyConfidence: evalResult.momentum.recencyConfidence,
          windowMinutes: 10,
          recentEventsUsed: evalResult.momentum.recentEventsUsed.map(e => ({ minute: e.minute, type: e.type, side: e.side, teamName: e.teamName, playerName: e.playerName })),
        } : null

        await repos.alerts.create({
          patternId: pattern.id,
          fixtureId: fixture.id,
          status: 'pending',
          confidence: evalResult.confidence,
          signalState: 'ready_to_alert',
          triggerMinute: input.minute,
          triggerScoreHome: input.score.home,
          triggerScoreAway: input.score.away,
          evidenceJson: JSON.stringify(evidenceData),
          temporalEvidenceJson: temporalData ? JSON.stringify(temporalData) : null,
          duplicateSignature: signature,
        }, DEFAULT_USER).then(async (createdAlert: any) => {
          // Incremental performance counter (derivative; never block alert creation).
          try {
            const keys = extractBreakdownKeys(createdAlert)
            await repos.performance.onAlertCreated({
              alertId: createdAlert.id, patternId: pattern.id, userId: DEFAULT_USER,
              confidence: evalResult.confidence, ...keys,
            })
          } catch (e: any) {
            console.warn(`[PatternWorker] counter onAlertCreated failed for ${createdAlert?.id}: ${e?.message || e}`)
          }
          // Intelligence Memory (Phase B12): make the alert traceable. Self-contained,
          // non-blocking — never throws, never affects alert creation.
          try {
            const condTypes = conditions.map((c: any) => c.type)
            const passed: string[] = []
            const failed: string[] = []
            for (const c of conditions) { (evaluateCondition(c, input) ? passed : failed).push(c.type) }
            const signalType = condTypes.find((t: string) => classifyConditionKind(t) === 'signal') || 'eligibility_only'
            void recordAlertCreated({
              alertId: createdAlert.id,
              userId: DEFAULT_USER,
              pattern: { id: pattern.id, name: pattern.name, severity: pattern.severity },
              fixture: { id: fixture.id, homeName: fixture.homeName, awayName: fixture.awayName, competition: fixture.competition, canonicalKey: fixture.canonicalKey },
              minute: input.minute,
              score: input.score,
              confidence: evalResult.confidence,
              blockers: evalResult.blockers,
              conditionTypes: condTypes,
              passedConditionTypes: passed,
              failedConditionTypes: failed,
              signalType,
              momentumSource: evalResult.momentum?.momentumSource ?? null,
              liveStats: flattenStats(input.stats as any),
              recentEvents: Array.isArray(input.events) ? input.events.slice(0, 8).map((e: any) => ({ minute: e.minute, type: e.type, side: e.side })) : null,
              provider: input.provider,
              dataQuality: input.dataQuality,
              scopeReason: scopeDecision.reason,
              matchContext: { competitionType: context.competitionType, stage: context.stage, isKnockout: context.isKnockout, importance: context.importance, importanceLabel: context.importanceLabel, notes: context.notes },
            })
          } catch (e: any) {
            console.warn(`[PatternWorker] intelligence ledger failed for ${createdAlert?.id}: ${e?.message || e}`)
          }
        })
        result.alertsCreated++
      } catch (err: any) {
        result.errors.push(`Alert creation failed for ${pattern.name} on ${fixture.homeName} vs ${fixture.awayName}: ${err?.message}`)
      }
    }
  }

  return result
}

function safeParseConditions(json: string): any[] {
  try { return JSON.parse(json) } catch { return [] }
}

/** Coerce a Date (Prisma) or ISO string (Firebase) to a Date. */
function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}
