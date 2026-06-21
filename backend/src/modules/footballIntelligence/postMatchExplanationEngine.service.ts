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

// ─── Post-Match Explanation V3 (B44) — data-domain failure analysis ────────────
import { listPreMatchDomainSnapshots, effectiveFreshness } from './preMatchDataStore.service.js'

export interface PostMatchExplanationV3 extends PostMatchExplanation {
  domainsAvailableBeforeAlert: string[]
  domainsMissingBeforeAlert: string[]
  domainsStaleBeforeAlert: string[]
  missingDomainContributedToError: boolean
  staleDataContributedToError: boolean
  shouldHaveWaitedForDomain: boolean
  shouldHaveUsedManualIntake: boolean
  providerLimitationWasCritical: boolean
  domainRefinementCandidates: string[]
}

const PM_CRITICAL = ['confirmed_lineups', 'injuries', 'standings']

export async function buildPostMatchExplanationV3(fixtureId: string): Promise<PostMatchExplanationV3 | null> {
  const v1 = await buildPostMatchExplanation(fixtureId)
  if (!v1) return null
  const snapshots = await listPreMatchDomainSnapshots(fixtureId, 200).catch(() => [])
  const byDomain = new Map<string, any>()
  for (const s of snapshots) if (!byDomain.has(s.domain) || s.fetchedAt > byDomain.get(s.domain).fetchedAt) byDomain.set(s.domain, s)

  const available: string[] = [], missing: string[] = [], stale: string[] = []
  for (const d of PM_CRITICAL) {
    const s = byDomain.get(d)
    const usable = s && (s.availability === 'available' || s.availability === 'partial' || s.availability === 'available_empty_confirmed')
    if (usable && effectiveFreshness(s) !== 'stale') available.push(d)
    else if (usable) stale.push(d)
    else missing.push(d)
  }

  const failed = v1.outcome === 'failed'
  const missingDomainContributedToError = failed && missing.length > 0 && !v1.wasMostlyRandom
  const staleDataContributedToError = failed && stale.length > 0 && !v1.wasMostlyRandom
  const providerLimitationWasCritical = failed && (v1.wasProviderLimited || missing.length === PM_CRITICAL.length)

  const domainRefinementCandidates: string[] = []
  if (missingDomainContributedToError) domainRefinementCandidates.push(`Buscar domínios ausentes antes de alertar: ${missing.join(', ')}.`)
  if (staleDataContributedToError) domainRefinementCandidates.push(`Atualizar domínios stale: ${stale.join(', ')}.`)

  return {
    ...v1,
    domainsAvailableBeforeAlert: available, domainsMissingBeforeAlert: missing, domainsStaleBeforeAlert: stale,
    missingDomainContributedToError, staleDataContributedToError,
    shouldHaveWaitedForDomain: missingDomainContributedToError || staleDataContributedToError,
    shouldHaveUsedManualIntake: missingDomainContributedToError && missing.length > 0,
    providerLimitationWasCritical, domainRefinementCandidates,
  }
}

// ─── Post-Match Explanation V4 (B45) — memory-aware learning ───────────────────
import { buildTeamFundamentalMemory } from './memory/teamFundamentalMemory.service.js'
import { getPatternMemoryForFixture } from './memory/contextualPatternMemory.service.js'
import { detectTabooCandidatesForFixture } from './memory/tabooIntelligence.service.js'
import { findSimilarPreMatchScenarios } from './memory/similarScenarioRetrieval.service.js'

export interface PostMatchExplanationV4 extends PostMatchExplanation {
  memorySupportedOutcome: boolean
  memoryContradictedOutcome: boolean
  memoryWasMisleading: boolean
  sampleWasTooWeak: boolean
  tabooWasInvalid: boolean
  similarScenarioWasUseful: boolean
  memoryRefinementCandidates: string[]
}

export async function buildPostMatchExplanationV4(fixtureId: string): Promise<PostMatchExplanationV4 | null> {
  const v1 = await buildPostMatchExplanation(fixtureId)
  if (!v1) return null
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)

  const [homeMem, awayMem, patternContext, taboos, similar] = await Promise.all([
    fixture?.homeName ? buildTeamFundamentalMemory(fixture.homeName).catch(() => null) : Promise.resolve(null),
    fixture?.awayName ? buildTeamFundamentalMemory(fixture.awayName).catch(() => null) : Promise.resolve(null),
    getPatternMemoryForFixture(fixtureId).catch(() => []),
    detectTabooCandidatesForFixture(fixtureId).catch(() => []),
    findSimilarPreMatchScenarios(fixtureId).catch(() => null),
  ])

  const confirmed = v1.outcome === 'confirmed' || v1.outcome === 'confirmed_partial'
  const failed = v1.outcome === 'failed'

  const favorableContexts = patternContext.filter(p => p.recommendation === 'use_with_confidence').length
  const unfavorableContexts = patternContext.filter(p => p.recommendation === 'stay_out').length

  const memorySupportedOutcome = confirmed && favorableContexts > 0
  const memoryContradictedOutcome = (confirmed && unfavorableContexts > 0) || (failed && favorableContexts > 0)
  const memoryWasMisleading = patternContext.some(p => p.sample.quality === 'misleading_risk') && failed
  const sampleQualityWeak = (homeMem?.overallSample.quality === 'weak' || homeMem?.overallSample.quality === 'insufficient') && (awayMem?.overallSample.quality === 'weak' || awayMem?.overallSample.quality === 'insufficient')
  const sampleWasTooWeak = sampleQualityWeak
  // A taboo was "invalid" if a usable constraint existed yet the constrained outcome happened.
  const usableTaboo = taboos.find(t => t.status === 'supported' && t.isUsableConstraint)
  const tabooWasInvalid = !!usableTaboo && confirmed
  const similarScenarioWasUseful = !!similar && similar.usableScenarios > 0 && (
    confirmed
      ? similar.scenarios.some(s => s.observedOutcome === 'confirmed' || s.observedOutcome === 'confirmed_partial')
      : similar?.scenarios.some(s => s.observedOutcome === 'failed') ?? false
  )

  const memoryRefinementCandidates: string[] = []
  if (memoryContradictedOutcome) memoryRefinementCandidates.push('Memória contradiz o resultado — revisar contexto/peso (sem rebaixar por acaso).')
  if (memoryWasMisleading) memoryRefinementCandidates.push('Memória potencialmente enganosa contribuiu — reforçar disciplina de amostra.')
  if (sampleWasTooWeak) memoryRefinementCandidates.push('Amostra fraca demais — coletar mais histórico antes de pesar memória.')
  if (tabooWasInvalid) memoryRefinementCandidates.push(`Restrição "${usableTaboo?.description}" falhou — rebaixar/invalidar.`)

  return {
    ...v1,
    memorySupportedOutcome, memoryContradictedOutcome, memoryWasMisleading,
    sampleWasTooWeak, tabooWasInvalid, similarScenarioWasUseful, memoryRefinementCandidates,
  }
}

// ─── Post-Match Explanation V5 (B46) — influence outcome analysis ──────────────
import { composeInfluence } from './influence/influenceLedger.service.js'

export interface PostMatchExplanationV5 extends PostMatchExplanation {
  netInfluenceBand: string
  influenceAssessmentWasAligned: boolean
  misleadingInfluences: string[]
  underestimatedInfluences: string[]
  overestimatedInfluences: string[]
  ignoredBlockers: string[]
  ignoredWaitReasons: string[]
  influenceRefinementCandidates: string[]
}

export async function buildPostMatchExplanationV5(fixtureId: string): Promise<PostMatchExplanationV5 | null> {
  const v1 = await buildPostMatchExplanation(fixtureId)
  if (!v1) return null
  const composed = await composeInfluence(fixtureId, null).catch(() => null)
  const agg = composed?.aggregate

  const confirmed = v1.outcome === 'confirmed' || v1.outcome === 'confirmed_partial'
  const failed = v1.outcome === 'failed'

  const supportive = agg?.netInfluenceBand === 'strongly_supportive' || agg?.netInfluenceBand === 'supportive'
  const contradictory = agg?.netInfluenceBand === 'contradictory'

  // Aligned when supportive→confirmed or contradictory→failed.
  const influenceAssessmentWasAligned = (supportive && confirmed) || (contradictory && failed)

  const misleadingInfluences: string[] = []
  const underestimatedInfluences: string[] = []
  const overestimatedInfluences: string[] = []
  if (failed && supportive) {
    for (const a of agg?.positiveInfluences ?? []) {
      if (a.magnitude === 'high' || a.magnitude === 'critical') overestimatedInfluences.push(a.label)
      misleadingInfluences.push(a.label)
    }
  }
  if (confirmed && contradictory) {
    for (const a of agg?.negativeInfluences ?? []) underestimatedInfluences.push(a.label)
  }

  // Blockers/waits that existed pre-match but the (hypothetical) decision ignored.
  const ignoredBlockers = failed ? (agg?.blockingInfluences ?? []).map(a => a.label) : []
  const ignoredWaitReasons = failed ? (agg?.waitInfluences ?? []).map(a => a.waitReason || a.label) : []

  const influenceRefinementCandidates: string[] = []
  if (overestimatedInfluences.length) influenceRefinementCandidates.push('Magnitude superestimada — reduzir peso de variáveis com reliability baixa.')
  if (misleadingInfluences.length && (composed?.variables ?? []).some(v => v.sampleQuality === 'weak' || v.sampleQuality === 'misleading_risk')) influenceRefinementCandidates.push('Source fraco/amostra fraca enganou — exigir confirmação ao vivo.')
  if (ignoredBlockers.length) influenceRefinementCandidates.push('Bloqueador ignorado — reforçar gate de bloqueio antes de alertar.')
  if (ignoredWaitReasons.length) influenceRefinementCandidates.push('Wait ignorado — esperar dado crítico/temporal.')
  if (agg && agg.confidenceOfAssessment === 'low' && failed) influenceRefinementCandidates.push('Confiança da avaliação baixa — não alertar forte.')

  return {
    ...v1,
    netInfluenceBand: agg?.netInfluenceBand ?? 'unknown',
    influenceAssessmentWasAligned, misleadingInfluences: [...new Set(misleadingInfluences)],
    underestimatedInfluences: [...new Set(underestimatedInfluences)], overestimatedInfluences: [...new Set(overestimatedInfluences)],
    ignoredBlockers, ignoredWaitReasons, influenceRefinementCandidates,
  }
}

// ─── Post-Match Explanation V6 (B47) — governance outcome review ───────────────

export interface PostMatchExplanationV6 extends PostMatchExplanation {
  governanceActionBeforeAlert: string | null
  wouldHaveBlocked: boolean
  wouldHaveWaited: boolean
  wouldHaveAllowed: boolean
  actualAlertCreated: boolean
  overrideUsed: boolean
  governanceWasAligned: boolean
  governanceWasTooStrict: boolean
  governanceWasTooLoose: boolean
  ignoredHold: boolean
  ignoredBlocker: boolean
  alertTooEarly: boolean
  alertTooLate: boolean
  shouldHaveWaitedGovernance: boolean
  shouldHaveStayedOutGovernance: boolean
  governanceRefinementCandidates: string[]
}

export async function buildPostMatchExplanationV6(fixtureId: string): Promise<PostMatchExplanationV6 | null> {
  const v1 = await buildPostMatchExplanation(fixtureId)
  if (!v1) return null
  const repos = createRepositories()

  // Most recent governance result for this fixture (pre-alert decision view).
  let govResults: any[] = []
  try { govResults = await repos.intelligence.listGovernanceResultsByFixture(fixtureId, 50) } catch { /* noop */ }
  // Prefer a command/promoted decision; fall back to the latest.
  const decision = govResults.find(r => r.source === 'command_pattern' || r.source === 'promoted_opportunity') || govResults[0] || null

  const confirmed = v1.outcome === 'confirmed' || v1.outcome === 'confirmed_partial'
  const failed = v1.outcome === 'failed'
  const actualAlertCreated = v1.alertId != null && v1.outcome !== 'no_alert'

  const action: string | null = decision?.action ?? null
  const wouldHaveBlocked = !!decision?.wouldHaveBlocked
  const wouldHaveWaited = !!action && action.startsWith('wait_')
  const wouldHaveAllowed = !!decision?.wouldHaveAllowed
  const overrideUsed = actualAlertCreated && (wouldHaveBlocked || wouldHaveWaited)

  // Alignment: blocked/wait → outcome failed = aligned; allowed → confirmed = aligned.
  const governanceWasAligned = (wouldHaveBlocked && failed) || (wouldHaveWaited && failed) || (wouldHaveAllowed && confirmed)
  const governanceWasTooStrict = (wouldHaveBlocked || wouldHaveWaited) && confirmed
  const governanceWasTooLoose = wouldHaveAllowed && failed

  const ignoredHold = overrideUsed && wouldHaveWaited && failed
  const ignoredBlocker = overrideUsed && wouldHaveBlocked && failed

  const govRefs: string[] = []
  if (ignoredBlocker) govRefs.push('ignored_blocker: governança recomendou bloquear e o alerta falhou.')
  if (ignoredHold) govRefs.push('ignored_wait_reason: governança recomendou esperar e o alerta falhou.')
  if (governanceWasTooStrict) govRefs.push('possible_overconservative_policy: governança bloquearia/esperaria mas o resultado confirmou.')
  if (governanceWasTooLoose) govRefs.push('governança permitiria mas falhou — reforçar gates.')

  return {
    ...v1,
    governanceActionBeforeAlert: action,
    wouldHaveBlocked, wouldHaveWaited, wouldHaveAllowed, actualAlertCreated, overrideUsed,
    governanceWasAligned, governanceWasTooStrict, governanceWasTooLoose,
    ignoredHold, ignoredBlocker,
    alertTooEarly: wouldHaveWaited && failed,
    alertTooLate: false,
    shouldHaveWaitedGovernance: wouldHaveWaited && failed,
    shouldHaveStayedOutGovernance: wouldHaveBlocked && failed,
    governanceRefinementCandidates: govRefs,
  }
}

// ─── Post-Match Explanation V7 (B48) — causal learning output ──────────────────
import { buildCasesForFixture } from './causal/causalLearningCaseBuilder.service.js'
import { generateInsightsForCase } from './causal/causalInsightGenerator.service.js'
import { suggestGovernancePolicyRefinements, suggestVariableInfluenceRefinements } from './causal/calibrationSuggestion.service.js'
import type { CausalLearningCase, CausalLearningInsight, GovernanceCalibrationSuggestion, VariableInfluenceCalibrationSuggestion } from './causal/causalLearning.types.js'

export interface PostMatchExplanationV7 extends PostMatchExplanation {
  causalLearningCaseId: string | null
  decisionOutcomeLinkStrength: string | null
  causalClassification: string | null
  causalFailureCategories: string[]
  causalSuccessCategories: string[]
  causalInsights: CausalLearningInsight[]
  governanceCalibrationSuggestions: GovernanceCalibrationSuggestion[]
  influenceCalibrationSuggestions: VariableInfluenceCalibrationSuggestion[]
  dataAcquisitionRefinements: string[]
  timingRefinements: string[]
  finalCausalSummary: string
}

export async function buildPostMatchExplanationV7(fixtureId: string): Promise<PostMatchExplanationV7 | null> {
  const v1 = await buildPostMatchExplanation(fixtureId)
  if (!v1) return null

  const cases = await buildCasesForFixture(fixtureId).catch(() => [] as CausalLearningCase[])
  // Prefer an evaluable case; else the first.
  const primary = cases.find(c => c.evaluable) ?? cases[0] ?? null
  const insights = primary ? generateInsightsForCase(primary) : []
  const govSuggestions = suggestGovernancePolicyRefinements(cases)
  const infSuggestions = suggestVariableInfluenceRefinements(cases)

  const dataAcquisitionRefinements = insights.filter(i => i.insightType === 'data_acquisition').map(i => i.suggestedRefinement || i.title)
  const timingRefinements = insights.filter(i => i.insightType === 'live_recheck' || i.insightType === 'alert_timing').map(i => i.suggestedRefinement || i.title)

  const finalCausalSummary = primary
    ? `Classificação: ${primary.classification} (link ${primary.linkStrength}). ${primary.evaluable ? `${insights.length} insight(s).` : 'Não avaliável (sem vínculo forte ou outcome pendente).'} Sugestões exigem revisão humana.`
    : 'Sem casos causais para esta partida (insufficient/Noop).'

  return {
    ...v1,
    causalLearningCaseId: primary?.id ?? null,
    decisionOutcomeLinkStrength: primary?.linkStrength ?? null,
    causalClassification: primary?.classification ?? null,
    causalFailureCategories: primary?.failureCategories ?? [],
    causalSuccessCategories: primary?.successCategories ?? [],
    causalInsights: insights,
    governanceCalibrationSuggestions: govSuggestions,
    influenceCalibrationSuggestions: infSuggestions,
    dataAcquisitionRefinements, timingRefinements, finalCausalSummary,
  }
}
