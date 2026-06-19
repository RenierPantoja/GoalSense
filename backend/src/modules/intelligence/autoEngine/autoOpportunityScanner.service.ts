/**
 * Auto Opportunity Scanner (Phase B19) — deterministic strategies over live data.
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure per-fixture evaluation: builds opportunities (candidate/watch/strong/blocked)
 * with score + risk gate + explanation. No alerts, no Telegram, no odds, no ML.
 * Strategies use ONLY data that exists; missing required stats → blocked, not failure.
 */
import type { PatternEvaluationInput } from '../../command/snapshotToPatternInput.js'
import type { MatchContext } from '../../command/matchContext.service.js'
import type { DataQuality, SampleQuality, PatternLearningProfile, CompetitionLearningProfile, TeamLearningProfile } from '../contracts/learning.types.js'
import type { AutoOpportunity, OpportunityType, AutoEngineRunConfig } from './autoEngine.types.js'
import { autoOpportunityId } from './utils/autoSignalId.util.js'
import { flattenStats, recentOffensiveCount, confidenceBandFor, statusFromScore } from './utils/autoSignalContext.util.js'
import { minuteWindowOf, minuteWindowLabel } from '../learning/minuteWindow.util.js'
import { contextKey, normalizeKeyPart } from '../learning/contextKey.util.js'
import { scoreOpportunity } from './autoSignalScoring.service.js'
import { evaluateRiskGate } from './autoSignalRiskGate.service.js'
import { buildExplanation } from './autoSignalExplainability.service.js'

export interface ProfileMaps {
  patternById: Map<string, PatternLearningProfile>
  competitionByKey: Map<string, CompetitionLearningProfile>
  teamByKey: Map<string, TeamLearningProfile>
}

export interface ScanFixtureCtx {
  runId: string
  fixtureId: string
  fixtureLabel: string
  config: AutoEngineRunConfig
  input: PatternEvaluationInput
  context: MatchContext
  profiles: ProfileMaps
  activePatterns: { id: string; name: string }[]
  hasRecentManualAlert: boolean
  snapshotAgeMs: number | null
}

interface StrategyResult {
  type: OpportunityType
  applicable: boolean
  requiredDataPresent: boolean
  hasEvidence: boolean
  baseScore: number
  passedSignals: string[]
  missingData: string[]
  learningDependent: boolean
  relatedPattern?: { id: string; name: string } | null
}

const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT'])

function totalShots(s: any): number | null { return s?.shotsHome != null ? (s.shotsHome + (s.shotsAway ?? 0)) : null }
function totalCorners(s: any): number | null { return s?.cornersHome != null ? (s.cornersHome + (s.cornersAway ?? 0)) : null }
function totalCards(s: any): number | null { return s?.yellowCardsHome != null ? (s.yellowCardsHome + (s.yellowCardsAway ?? 0) + (s.redCardsHome ?? 0) + (s.redCardsAway ?? 0)) : null }

function strategies(input: PatternEvaluationInput, recentOff: number, activePatterns: { id: string; name: string }[], patternById: Map<string, PatternLearningProfile>, window: string, league: string): StrategyResult[] {
  const s = input.stats as any
  const minute = input.minute
  const diff = Math.abs(input.score.home - input.score.away)
  const out: StrategyResult[] = []
  const hasStats = !!flattenStats(s)
  const shots = totalShots(s)
  const pressure = recentOff >= 1 || (shots != null && shots >= 10)

  // late_goal_pressure
  if (LIVE.has(input.status) && minute != null && minute >= 70) {
    out.push({ type: 'late_goal_pressure', applicable: true, requiredDataPresent: true, hasEvidence: diff <= 1 && pressure,
      baseScore: 38, learningDependent: false,
      passedSignals: ["Reta final (≥70')", diff <= 1 ? 'Placar curto' : 'Placar aberto', recentOff > 0 ? `${recentOff} eventos ofensivos recentes` : (shots != null ? `${shots} finalizações` : 'sem stats')].filter(Boolean),
      missingData: hasStats ? [] : ['estatísticas ao vivo'] })
  }
  // first_half_goal_pressure
  if (input.status === '1H' && minute != null && minute >= 25 && minute <= 45) {
    out.push({ type: 'first_half_goal_pressure', applicable: true, requiredDataPresent: true, hasEvidence: diff <= 1 && pressure,
      baseScore: 34, learningDependent: false,
      passedSignals: ['Primeiro tempo avançado', diff <= 1 ? 'Placar curto' : 'Placar aberto', recentOff > 0 ? `${recentOff} eventos ofensivos recentes` : 'sem evento recente'],
      missingData: hasStats ? [] : ['estatísticas ao vivo'] })
  }
  // corners_pressure (requires corner data)
  if (LIVE.has(input.status) && minute != null && minute >= 25) {
    const tc = totalCorners(s)
    out.push({ type: 'corners_pressure', applicable: true, requiredDataPresent: tc != null, hasEvidence: tc != null && tc >= 7,
      baseScore: 32, learningDependent: false,
      passedSignals: tc != null ? [`${tc} escanteios`] : [], missingData: tc != null ? [] : ['escanteios'] })
  }
  // cards_pressure (requires card data)
  if (LIVE.has(input.status) && minute != null && minute >= 30) {
    const tcards = totalCards(s)
    out.push({ type: 'cards_pressure', applicable: true, requiredDataPresent: tcards != null, hasEvidence: tcards != null && tcards >= 4,
      baseScore: 30, learningDependent: false,
      passedSignals: tcards != null ? [`${tcards} cartões`] : [], missingData: tcards != null ? [] : ['cartões'] })
  }
  // dominant_home / dominant_away (requires possession + shots)
  if (LIVE.has(input.status) && minute != null && minute >= 20 && s?.possessionHome != null && s?.shotsHome != null) {
    const shotDiff = (s.shotsHome ?? 0) - (s.shotsAway ?? 0)
    if (s.possessionHome >= 58 && shotDiff >= 4 && diff <= 1) {
      out.push({ type: 'dominant_home_pressure', applicable: true, requiredDataPresent: true, hasEvidence: true, baseScore: 34, learningDependent: false,
        passedSignals: [`Posse mandante ${s.possessionHome}%`, `+${shotDiff} finalizações`], missingData: [] })
    }
    if ((s.possessionAway ?? 0) >= 58 && -shotDiff >= 4 && diff <= 1) {
      out.push({ type: 'dominant_away_pressure', applicable: true, requiredDataPresent: true, hasEvidence: true, baseScore: 34, learningDependent: false,
        passedSignals: [`Posse visitante ${s.possessionAway}%`, `+${-shotDiff} finalizações`], missingData: [] })
    }
  }
  // pattern_similarity — best active pattern whose learning profile matches this context
  if (LIVE.has(input.status)) {
    let best: { id: string; name: string; profile: PatternLearningProfile } | null = null
    for (const p of activePatterns) {
      const prof = patternById.get(p.id)
      if (!prof || prof.usefulRate == null) continue
      if (!(prof.sampleQuality === 'moderate' || prof.sampleQuality === 'strong')) continue
      if (prof.usefulRate < 0.5) continue
      const matchesWindow = prof.bestMinuteWindows.some(w => w.contextKey === contextKey.minuteWindow(window))
      const matchesLeague = prof.bestCompetitions.some(c => c.contextKey === contextKey.competition(league))
      if (!matchesWindow && !matchesLeague) continue
      if (!best || (prof.usefulRate > (best.profile.usefulRate ?? 0))) best = { id: p.id, name: p.name, profile: prof }
    }
    if (best) {
      out.push({ type: 'pattern_similarity', applicable: true, requiredDataPresent: true, hasEvidence: true, baseScore: 30, learningDependent: true,
        passedSignals: [`Radar "${best.name}" performa bem neste contexto`], missingData: [], relatedPattern: { id: best.id, name: best.name } })
    }
  }
  return out
}

export function scanFixture(ctx: ScanFixtureCtx): AutoOpportunity[] {
  const { input, context, profiles, config } = ctx
  const now = new Date().toISOString()
  const window = minuteWindowOf(input.minute, null)
  const league = input.competition || 'unknown'
  const recentOff = recentOffensiveCount(input.events as any[], input.minute)
  const liveStats = flattenStats(input.stats as any)
  const dataQuality = (input.dataQuality as DataQuality) || 'unknown'
  const compProfile = profiles.competitionByKey.get(normalizeKeyPart(league)) || null
  const homeProfile = profiles.teamByKey.get(normalizeKeyPart(input.homeName)) || null
  const awayProfile = profiles.teamByKey.get(normalizeKeyPart(input.awayName)) || null
  const teamUsefulRate = homeProfile?.usefulRate ?? awayProfile?.usefulRate ?? null

  const results = strategies(input, recentOff, ctx.activePatterns, profiles.patternById, window, league)
  const opps: AutoOpportunity[] = []
  let oppCount = 0

  for (const r of results) {
    if (!r.applicable) continue
    // Skip silently when there is no evidence and required data is present (just "nothing here").
    if (!r.hasEvidence && r.requiredDataPresent) continue

    const patternProfile = r.relatedPattern ? profiles.patternById.get(r.relatedPattern.id) || null : null
    const sampleQuality: SampleQuality = r.learningDependent
      ? (patternProfile?.sampleQuality || 'insufficient')
      : (compProfile?.sampleQuality || 'insufficient')
    const minuteWindowUsefulRate = patternProfile?.bestMinuteWindows.find(w => w.contextKey === contextKey.minuteWindow(window))?.usefulRate ?? null

    const breakdown = scoreOpportunity({
      baseScore: r.baseScore,
      recentOffensive: recentOff,
      hasLiveStats: !!liveStats,
      scoreDiff: Math.abs(input.score.home - input.score.away),
      importanceLabel: context.importanceLabel,
      patternProfile: patternProfile ? { usefulRate: patternProfile.usefulRate, sampleQuality: patternProfile.sampleQuality, unknownRate: patternProfile.unknownRate } : null,
      competitionUsefulRate: compProfile?.usefulRate ?? null,
      teamUsefulRate,
      minuteWindowUsefulRate,
      dataQuality,
      unknownRate: patternProfile?.unknownRate ?? compProfile?.unknownRate ?? null,
    })

    const historicallyWeak = !!patternProfile && patternProfile.failedRate != null && patternProfile.failedRate >= 0.5 && (patternProfile.sampleQuality === 'moderate' || patternProfile.sampleQuality === 'strong')

    const gate = evaluateRiskGate({
      isLive: LIVE.has(input.status),
      dataQuality,
      snapshotAgeMs: ctx.snapshotAgeMs,
      requiredDataPresent: r.requiredDataPresent,
      hasEvidence: r.hasEvidence,
      learningDependent: r.learningDependent,
      sampleQuality,
      minSampleQuality: config.minSampleQuality,
      historicallyWeak,
      unknownRate: patternProfile?.unknownRate ?? compProfile?.unknownRate ?? null,
      hasRecentManualAlert: ctx.hasRecentManualAlert,
      isDuplicate: false,
      oppCountForFixture: oppCount,
      maxOppsPerFixture: config.maxOppsPerFixture,
      score: breakdown.finalScore,
      minScore: config.minScore,
    })

    const status = gate.allowed ? statusFromScore(breakdown.finalScore, config.minScore, sampleQuality) : 'blocked'
    const confidenceBand = confidenceBandFor(breakdown.finalScore, sampleQuality, dataQuality)

    const matchedContexts: string[] = []
    if (minuteWindowUsefulRate != null) matchedContexts.push(minuteWindowLabel(window))
    if (compProfile?.usefulRate != null) matchedContexts.push(league)
    const contextSource: 'observed' | 'heuristic' | 'limited' = patternProfile || compProfile ? 'observed' : (context.competitionType ? 'heuristic' : 'limited')

    const evidence = {
      liveStatsUsed: liveStats, minute: input.minute, scoreState: input.score,
      recentOffensiveEvents: recentOff, passedSignals: r.passedSignals, missingData: r.missingData,
      dataQuality, provider: input.provider,
    }
    const contextFit = {
      competitionType: context.competitionType, importanceLabel: context.importanceLabel,
      minuteWindow: window, matchedLearningContexts: matchedContexts, sampleQuality, source: contextSource, notes: context.notes,
    }
    const explanation = buildExplanation({
      opportunityType: r.type, minute: input.minute, scoreState: input.score,
      evidence, contextFit, riskGate: gate, relatedPatternName: r.relatedPattern?.name ?? null,
    })

    opps.push({
      id: autoOpportunityId(ctx.fixtureId, r.type, input.minute),
      runId: ctx.runId, fixtureId: ctx.fixtureId, fixtureLabel: ctx.fixtureLabel,
      leagueName: league, homeTeam: input.homeName, awayTeam: input.awayName,
      minute: input.minute, scoreState: input.score, opportunityType: r.type,
      status, score: breakdown.finalScore, confidenceBand, scoreBreakdown: breakdown,
      evidence, contextFit, riskGate: gate,
      relatedPatternIds: r.relatedPattern ? [r.relatedPattern.id] : [],
      learningProfileRefs: [patternProfile?.id, compProfile?.id, homeProfile?.id, awayProfile?.id].filter((x): x is string => !!x),
      dataAvailability: { liveStats: !!liveStats, corners: totalCorners(input.stats as any) != null, cards: totalCards(input.stats as any) != null, learningProfile: !!patternProfile || !!compProfile },
      explanation, createdAt: now, updatedAt: now,
    })
    if (status !== 'blocked') oppCount++
  }
  return opps
}
