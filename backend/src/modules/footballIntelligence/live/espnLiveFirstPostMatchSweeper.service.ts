import { createRepositories } from '../../../repositories/index.js'
import type { CausalLearningCase } from '../causal/causalLearning.types.js'
import type {
  LiveFirstPostMatchOutcome,
  PostMatchSweeperResult,
} from './espnLiveFirstWorker.types.js'
import type { LiveMonitoringFixtureState, LiveMonitoringSession } from './liveMonitoringSession.types.js'

const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN', 'FULL_TIME', 'FINAL'])

function isFinalState(state: LiveMonitoringFixtureState): boolean {
  return state.completed || FINAL_STATUSES.has(String(state.lastStatus || '').toUpperCase())
}

function hasKnownFinalScore(state: LiveMonitoringFixtureState): boolean {
  return typeof state.lastScore?.home === 'number' && typeof state.lastScore?.away === 'number'
}

function finalStatusFromState(state: LiveMonitoringFixtureState): string {
  const status = String(state.lastStatus || '')
  if (FINAL_STATUSES.has(status.toUpperCase())) return status
  const recordedCompletion = state.limitations.find(item => /^Match completed:\s*/i.test(item))
  if (recordedCompletion) return recordedCompletion.replace(/^Match completed:\s*/i, '').trim() || status || 'completed'
  return state.completed ? 'completed' : status || 'unknown'
}

function outcomeId(fixtureId: string, sessionId: string): string {
  return `lfo_${fixtureId}_${sessionId}`
}

function caseId(fixtureId: string, sessionId: string): string {
  return `clc_live_first_${fixtureId}_${sessionId}`
}

async function findStateForFixture(
  fixtureId: string,
  sessionId?: string,
): Promise<{ session: LiveMonitoringSession; state: LiveMonitoringFixtureState } | null> {
  const repos = createRepositories()
  const sessions = sessionId
    ? [await repos.intelligence.getLiveMonitoringSession(sessionId).catch(() => null)].filter(Boolean) as LiveMonitoringSession[]
    : await repos.intelligence.listLiveMonitoringSessions(200).catch(() => [])

  for (const session of sessions) {
    const states = await repos.intelligence.listLiveMonitoringFixtureStates(session.id, 200).catch(() => [])
    const state = states.find(s => s.fixtureId === fixtureId)
    if (state) return { session, state }
  }

  return null
}

export async function findCompletedLiveFirstFixtures(): Promise<Array<{
  fixtureId: string
  sessionId: string
  status: string | null | undefined
  snapshotCount: number
}>> {
  const repos = createRepositories()
  const sessions = await repos.intelligence.listLiveMonitoringSessions(200).catch(() => [])
  const completed: Array<{ fixtureId: string; sessionId: string; status: string | null | undefined; snapshotCount: number }> = []

  for (const session of sessions) {
    const states = await repos.intelligence.listLiveMonitoringFixtureStates(session.id, 200).catch(() => [])
    for (const state of states) {
      if (isFinalState(state)) {
        completed.push({
          fixtureId: state.fixtureId,
          sessionId: session.id,
          status: state.lastStatus,
          snapshotCount: state.snapshotCount,
        })
      }
    }
  }

  return completed
}

export async function buildFinalLiveFirstSnapshot(
  fixtureId: string,
  sessionId?: string,
): Promise<{ session: LiveMonitoringSession; state: LiveMonitoringFixtureState } | null> {
  return findStateForFixture(fixtureId, sessionId)
}

export async function resolveCompletedFixtureOutcome(
  fixtureId: string,
  sessionId?: string,
): Promise<LiveFirstPostMatchOutcome> {
  const found = await findStateForFixture(fixtureId, sessionId)
  const now = new Date().toISOString()

  if (!found) {
    return {
      fixtureId,
      sessionId: sessionId || 'unknown',
      finalStatus: 'unknown',
      finalScore: { home: null, away: null },
      outcome: 'not_evaluable_unknown_outcome',
      evaluable: false,
      reason: 'No persisted live-first fixture state found',
      governanceEvaluations: 0,
      snapshotCount: 0,
      eventsDetected: 0,
      limitations: ['ESPN final state unavailable in persisted session data'],
      createdAt: now,
    }
  }

  const { session, state } = found
  const finalStatus = finalStatusFromState(state)
  const finalScoreKnown = hasKnownFinalScore(state)
  const finalStatusKnown = isFinalState(state)
  const evaluable = finalStatusKnown && finalScoreKnown && state.snapshotCount > 0

  return {
    fixtureId,
    sessionId: session.id,
    finalStatus,
    finalScore: {
      home: state.lastScore?.home ?? null,
      away: state.lastScore?.away ?? null,
    },
    outcome: evaluable ? 'live_best_effort_limited' : 'not_evaluable_unknown_outcome',
    evaluable,
    reason: evaluable
      ? 'Final live-first state and score were persisted from monitored ESPN data'
      : 'Final status, score, or snapshots are insufficient for evaluation',
    governanceEvaluations: session.governanceEvaluations,
    snapshotCount: state.snapshotCount,
    eventsDetected: state.eventsDetected,
    limitations: [
      ...new Set([
        ...session.limitations,
        ...state.limitations,
        'Live-first post-match evaluation is observational and does not calibrate or enforce runtime behavior',
        !finalStatusKnown ? 'ESPN final status was not confirmed in persisted state' : '',
        !finalScoreKnown ? 'Final score was not confirmed in persisted state' : '',
      ].filter(Boolean)),
    ],
    createdAt: now,
  }
}

function buildLiveFirstCausalCase(outcome: LiveFirstPostMatchOutcome): CausalLearningCase {
  const now = new Date().toISOString()
  return {
    id: caseId(outcome.fixtureId, outcome.sessionId),
    fixtureId: outcome.fixtureId,
    patternId: null,
    alertId: null,
    candidateAlertId: null,
    opportunityId: null,
    governanceResultId: null,
    influenceLedgerId: null,
    signalLedgerId: null,
    outcomeId: outcomeId(outcome.fixtureId, outcome.sessionId),
    source: 'live_recheck',
    createdAt: now,
    evaluatedAt: outcome.evaluable ? now : null,
    outcomeResult: outcome.evaluable ? `${outcome.finalScore.home}-${outcome.finalScore.away}` : null,
    governanceAction: null,
    linkStrength: 'weak_contextual',
    classification: outcome.evaluable ? 'data_insufficient' : 'not_evaluable',
    successCategories: [],
    failureCategories: outcome.evaluable ? ['provider_limitation'] : ['unknown'],
    decisionTimeline: [
      {
        timestamp: outcome.createdAt,
        eventType: 'post_match',
        summary: `Live-first post-match outcome: ${outcome.finalStatus}`,
        refs: [outcomeId(outcome.fixtureId, outcome.sessionId)],
        limitations: outcome.limitations,
      },
    ],
    evidenceRefs: [outcomeId(outcome.fixtureId, outcome.sessionId)],
    dataQuality: outcome.evaluable ? 'partial' : 'unknown',
    evaluable: outcome.evaluable,
    limitations: [
      ...outcome.limitations,
      'Weak contextual link: no external alert result is changed and no strong causality is inferred',
    ],
  }
}

export async function runLiveFirstPostMatchForFixture(
  fixtureId: string,
  sessionId?: string,
): Promise<{ success: boolean; outcome: LiveFirstPostMatchOutcome; causalCaseCreated: boolean; warnings: string[] }> {
  const repos = createRepositories()
  const outcome = await resolveCompletedFixtureOutcome(fixtureId, sessionId)
  const warnings: string[] = []

  await repos.intelligence.saveLiveFirstPostMatchOutcome(outcome).catch((error: any) => {
    warnings.push(`Could not persist post-match outcome: ${error?.message || 'unknown'}`)
  })

  let causalCaseCreated = false
  if (outcome.evaluable) {
    const causalCase = buildLiveFirstCausalCase(outcome)
    await repos.intelligence.saveCausalLearningCase(causalCase).then(() => {
      causalCaseCreated = true
    }).catch((error: any) => {
      warnings.push(`Could not persist live-first causal case: ${error?.message || 'unknown'}`)
    })
  } else {
    warnings.push(outcome.reason)
  }

  return {
    success: warnings.length === 0 || !!outcome,
    outcome,
    causalCaseCreated,
    warnings,
  }
}

export async function runPostMatchSweeper(): Promise<PostMatchSweeperResult> {
  const completed = await findCompletedLiveFirstFixtures()
  const result: PostMatchSweeperResult = {
    fixturesProcessed: 0,
    outcomesResolved: 0,
    causalCasesCreated: 0,
    evaluableCases: 0,
    notEvaluableCases: 0,
    notEvaluableReasons: {},
    errors: [],
    warnings: [],
    limitations: ['Post-match sweeper is local, observational, and does not enable enforce, odds, Telegram, or auto-bet'],
  }

  for (const item of completed) {
    try {
      const processed = await runLiveFirstPostMatchForFixture(item.fixtureId, item.sessionId)
      result.fixturesProcessed++
      result.outcomesResolved++
      if (processed.causalCaseCreated) result.causalCasesCreated++
      if (processed.outcome.evaluable) {
        result.evaluableCases++
      } else {
        result.notEvaluableCases++
        const reason = processed.outcome.reason || 'not_evaluable'
        result.notEvaluableReasons[reason] = [...(result.notEvaluableReasons[reason] || []), item.fixtureId]
      }
      result.warnings.push(...processed.warnings)
    } catch (error: any) {
      result.errors.push(`Post-match sweep failed for ${item.fixtureId}: ${error?.message || 'unknown'}`)
    }
  }

  if (completed.length === 0) {
    result.limitations.push('No completed live-first fixtures found')
  }

  return result
}

export async function runEspnLiveFirstPostMatchSweeper(
  fixtureId: string,
  sessionId?: string,
): Promise<{ success: boolean; result: PostMatchSweeperResult; outcome?: LiveFirstPostMatchOutcome }> {
  const processed = await runLiveFirstPostMatchForFixture(fixtureId, sessionId)
  const result: PostMatchSweeperResult = {
    fixturesProcessed: 1,
    outcomesResolved: 1,
    causalCasesCreated: processed.causalCaseCreated ? 1 : 0,
    evaluableCases: processed.outcome.evaluable ? 1 : 0,
    notEvaluableCases: processed.outcome.evaluable ? 0 : 1,
    notEvaluableReasons: processed.outcome.evaluable ? {} : { [processed.outcome.reason]: [fixtureId] },
    errors: [],
    warnings: processed.warnings,
    limitations: processed.outcome.limitations,
  }
  return { success: processed.success, result, outcome: processed.outcome }
}

export async function buildPostMatchSweeperSummary(): Promise<PostMatchSweeperResult> {
  const outcomes = await createRepositories().intelligence.listLiveFirstPostMatchOutcomes(500).catch(() => [])
  return {
    fixturesProcessed: outcomes.length,
    outcomesResolved: outcomes.length,
    causalCasesCreated: outcomes.filter(o => o.evaluable).length,
    evaluableCases: outcomes.filter(o => o.evaluable).length,
    notEvaluableCases: outcomes.filter(o => !o.evaluable).length,
    notEvaluableReasons: outcomes.reduce<Record<string, string[]>>((acc, outcome) => {
      if (!outcome.evaluable) acc[outcome.reason] = [...(acc[outcome.reason] || []), outcome.fixtureId]
      return acc
    }, {}),
    errors: [],
    warnings: [],
    limitations: ['Summary is based only on persisted live-first post-match outcomes'],
  }
}
