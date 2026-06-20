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
