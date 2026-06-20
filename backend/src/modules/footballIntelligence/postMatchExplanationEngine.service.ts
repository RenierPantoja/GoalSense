/**
 * Post-Match Explanation Engine (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * After the match, explains WHY a pattern worked or not — as logical learning, not
 * an excuse. A miss is NOT called "random" without evidence of an extreme/
 * unpredictable event (red card, penalty, very late goal, game-state shock). A miss
 * by missing data is a provider/data limitation; a decision flaw is named honestly.
 * unknown/not_evaluable/pending are never failures.
 */
import { createRepositories } from '../../repositories/index.js'
import { buildMatchIntelligencePackage } from './matchIntelligencePackage.service.js'

export interface PostMatchExplanation {
  fixtureId: string
  alertId: string | null
  outcome: 'confirmed' | 'confirmed_partial' | 'failed' | 'unknown' | 'expired' | 'not_evaluable' | 'pending' | 'no_alert'
  keyReasonsItWorked: string[]
  keyReasonsItFailed: string[]
  invalidatedAssumptions: string[]
  unexpectedEvents: string[]
  dataQualityIssues: string[]
  refinementCandidates: string[]
  wasMostlyRandom: boolean
  wasAnalysisWeak: boolean
  wasProviderLimited: boolean
  shouldHaveStayedOut: boolean
  shouldHaveWaited: boolean
  shouldHaveAlertedEarlier: boolean
  shouldHaveAlertedLater: boolean
  learningNotes: string[]
  limitations: string[]
  generatedAt: string
}

const EXTREME_EVENT_TYPES = new Set(['red_card', 'own_goal', 'penalty_scored', 'penalty_missed', 'goal_disallowed', 'var'])

export async function buildPostMatchExplanation(fixtureId: string): Promise<PostMatchExplanation | null> {
  const repos = createRepositories()
  const pkg = await buildMatchIntelligencePackage(fixtureId).catch(() => null)
  if (!pkg) return null

  const limitations = ['Explicação observacional baseada em snapshots/eventos disponíveis (ESPN) e memória interna.']
  if (pkg.phase !== 'post_match') limitations.push('Jogo ainda não finalizado — explicação parcial/provisória.')

  // Find the alert outcome (if any) for this fixture.
  let alertId: string | null = null
  let result: string = 'no_alert'
  try {
    const alerts = await repos.alerts.findByFixtureIds(fixtureId).catch(() => [])
    for (const a of alerts as any[]) {
      const o = await repos.intelligence.getAlertOutcomeByAlertId(a.id).catch(() => null)
      if (o) { alertId = a.id; result = o.result || 'pending'; break }
      if (!alertId) alertId = a.id
    }
    if (alertId && result === 'no_alert') result = 'pending'
  } catch { /* noop */ }

  const events = pkg.postMatch?.events ?? pkg.live?.recentEvents ?? []
  const unexpectedEvents = events.filter(e => EXTREME_EVENT_TYPES.has(e.type)).map(e => `${e.type} aos ${e.minute}'`)
  const lateGoals = events.filter(e => (e.type === 'goal' || e.type === 'penalty_scored') && e.minute >= 80).map(e => `gol tardio aos ${e.minute}'`)

  const keyReasonsItWorked: string[] = []
  const keyReasonsItFailed: string[] = []
  const invalidatedAssumptions: string[] = []
  const dataQualityIssues: string[] = []
  const refinementCandidates: string[] = []
  const learningNotes: string[] = []

  // Data quality issues honestly noted.
  if (pkg.live && !pkg.live.hasStats) dataQualityIssues.push('Sem stats ao vivo — leitura limitada (não é falha do padrão).')
  if ((pkg.teams.home?.sampleSize ?? 0) + (pkg.teams.away?.sampleSize ?? 0) === 0) dataQualityIssues.push('Sem memória interna dos clubes (insufficient_history).')

  // Classify causes WITHOUT calling chance lightly.
  let wasMostlyRandom = false
  let wasAnalysisWeak = false
  let wasProviderLimited = dataQualityIssues.length > 0

  if (result === 'confirmed' || result === 'confirmed_partial') {
    keyReasonsItWorked.push('Resultado confirmou o padrão observado.')
    if (pkg.context?.importanceLevel === 'high' || pkg.context?.importanceLevel === 'critical') keyReasonsItWorked.push('Contexto de alta importância coerente com a leitura.')
  } else if (result === 'failed') {
    if (unexpectedEvents.length > 0 || lateGoals.length > 0) {
      // Evidence of an extreme/late event → variance/shock, with evidence.
      wasMostlyRandom = true
      keyReasonsItFailed.push('Evento extremo/tardio alterou o jogo (variância com evidência).')
      invalidatedAssumptions.push('Premissa pré-evento invalidada por choque de game-state.')
      learningNotes.push('Falha com evidência de evento extremo — não rebaixar o padrão por acaso.')
    } else if (wasProviderLimited) {
      keyReasonsItFailed.push('Falha possivelmente ligada a dados ausentes/limitados.')
      learningNotes.push('Investigar cobertura de dados antes de culpar o padrão.')
    } else if (pkg.stayOutReasons.length > 0) {
      wasAnalysisWeak = true
      keyReasonsItFailed.push('Fundamentos contraindicavam o alerta (decisão deveria ter ficado fora).')
      refinementCandidates.push('Reforçar gate de contexto/volatilidade antes de alertar.')
    } else {
      keyReasonsItFailed.push('Falha sem evento extremo aparente — investigar (não assumir acaso).')
      learningNotes.push('Erro não tratado como acaso automaticamente — requer investigação.')
    }
  } else if (result === 'unknown' || result === 'expired') {
    learningNotes.push('Resultado unknown/expired — NÃO é falha; dado insuficiente para avaliar.')
  } else if (result === 'pending') {
    learningNotes.push('Outcome pendente — sem conclusão.')
  } else if (result === 'no_alert') {
    learningNotes.push('Nenhum alerta gerado para este jogo.')
  }

  const shouldHaveStayedOut = result === 'failed' && wasAnalysisWeak
  const shouldHaveWaited = !!pkg.squads?.waitForLineupRecommended && result === 'failed'

  return {
    fixtureId, alertId,
    outcome: (['confirmed', 'confirmed_partial', 'failed', 'unknown', 'expired', 'not_evaluable', 'pending', 'no_alert'].includes(result) ? result : 'pending') as PostMatchExplanation['outcome'],
    keyReasonsItWorked, keyReasonsItFailed, invalidatedAssumptions, unexpectedEvents: [...unexpectedEvents, ...lateGoals],
    dataQualityIssues, refinementCandidates,
    wasMostlyRandom, wasAnalysisWeak, wasProviderLimited,
    shouldHaveStayedOut, shouldHaveWaited, shouldHaveAlertedEarlier: false, shouldHaveAlertedLater: false,
    learningNotes, limitations, generatedAt: new Date().toISOString(),
  }
}

// ─── Post-Match V2 (B40) — lineup/provider/context-aware learning ──────────────
import { getLineupWindowStatus } from './lineupWindowEngine.service.js'
import { getBestProviderForDomain } from './providers/providerRegistry.service.js'

export type PostMatchCauseCategory = 'game_state_shock' | 'data_limitation' | 'decision_flaw' | 'variance_shock' | 'confirmed_read' | 'inconclusive'

export interface PostMatchExplanationV2 extends PostMatchExplanation {
  causeCategory: PostMatchCauseCategory
  lineupConfirmedRead: boolean | 'unknown'
  lineupInvalidatedRead: boolean | 'unknown'
  keyAbsenceWeighed: boolean | 'unknown'
  suspensionOrInjuryAffected: boolean | 'unknown'
  redCardChangedGame: boolean
  substitutionChangedTempo: boolean | 'unknown'
  competitionContextChangedBehavior: boolean | 'unknown'
  classicOrKnockoutVolatility: boolean | 'unknown'
  providerWasLimited: boolean
  shouldHaveWaitedLineup: boolean
  shouldHaveWaitedLiveConfirmation: boolean
}

export async function buildPostMatchExplanationV2(fixtureId: string): Promise<PostMatchExplanationV2 | null> {
  const v1 = await buildPostMatchExplanation(fixtureId)
  if (!v1) return null
  const pkg = await buildMatchIntelligencePackage(fixtureId).catch(() => null)
  const lineupWindow = await getLineupWindowStatus(fixtureId).catch(() => null)

  const events = pkg?.postMatch?.events ?? []
  const redCardChangedGame = events.some(e => e.type === 'red_card')
  const providerWasLimited = v1.wasProviderLimited || (!getBestProviderForDomain('confirmed_lineups') && !getBestProviderForDomain('injuries'))
  const isKnockout = pkg?.context?.competitionContext.isKnockout === true

  let causeCategory: PostMatchCauseCategory
  if (v1.outcome === 'confirmed' || v1.outcome === 'confirmed_partial') causeCategory = 'confirmed_read'
  else if (v1.outcome === 'failed') {
    if (redCardChangedGame || v1.unexpectedEvents.length > 0) causeCategory = v1.wasAnalysisWeak ? 'decision_flaw' : 'variance_shock'
    else if (v1.wasAnalysisWeak) causeCategory = 'decision_flaw'
    else if (providerWasLimited) causeCategory = 'data_limitation'
    else causeCategory = 'inconclusive'
  } else causeCategory = 'inconclusive'

  // game_state_shock is reserved for clear in-match shocks with evidence.
  if (v1.outcome === 'failed' && redCardChangedGame) causeCategory = 'game_state_shock'

  return {
    ...v1,
    causeCategory,
    lineupConfirmedRead: lineupWindow?.status === 'confirmed_available' ? 'unknown' : 'unknown', // we lack structured lineup → honest unknown
    lineupInvalidatedRead: 'unknown',
    keyAbsenceWeighed: 'unknown',
    suspensionOrInjuryAffected: 'unknown',
    redCardChangedGame,
    substitutionChangedTempo: 'unknown',
    competitionContextChangedBehavior: isKnockout ? 'unknown' : 'unknown',
    classicOrKnockoutVolatility: isKnockout ? true : 'unknown',
    providerWasLimited,
    shouldHaveWaitedLineup: !!lineupWindow?.shouldWait && v1.outcome === 'failed',
    shouldHaveWaitedLiveConfirmation: pkg?.phase !== 'post_match' ? false : (v1.outcome === 'failed' && !(pkg?.live?.hasStats)),
  }
}
