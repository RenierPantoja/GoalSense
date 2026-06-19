/**
 * Auto Engine Learning Aggregator (Phase B24) — observational, never auto-tunes.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the closed B22/B23 loop (promoted links + outcome summaries + the source
 * opportunities) and materializes a SEPARATE Auto Engine learning profile +
 * conservative recommendations + observational learning events. Recomputed from
 * raw records (idempotent). Never mutates opportunities/alerts/patterns/scores,
 * never touches performance counters, never sends Telegram, never uses odds.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { buildAutoEngineLearningProfile } from './utils/autoEngineCalibration.util.js'
import type { JoinedPromotedOutcome, AutoEngineLearningRun, AutoEngineLearningProfile } from './autoEngineLearning.types.js'
import type { OpportunityType, ConfidenceBand } from './autoEngine.types.js'
import type { LearningEvent, LearningEventType } from '../contracts/intelligence.types.js'

export function isAutoEngineLearningRebuildEnabled(): boolean {
  return String(env.ENABLE_AUTO_ENGINE_LEARNING_REBUILD).toLowerCase() === 'true'
}

export interface AutoEngineAggregationOptions { dryRun?: boolean; from?: string; to?: string }

const REC_EVENT_TYPE: Record<string, LearningEventType> = {
  opportunity_type_positive_signal: 'auto_engine_opportunity_type_positive_signal',
  opportunity_type_high_unknown: 'auto_engine_opportunity_type_high_unknown',
  score_bucket_insufficient_sample: 'auto_engine_score_bucket_insufficient_sample',
  score_bucket_overestimating_possible: 'auto_engine_score_bucket_insufficient_sample',
  data_quality_limitation: 'auto_engine_data_quality_limitation',
  risk_gate_observation: 'auto_engine_risk_gate_observation',
  insufficient_sample: 'auto_engine_score_bucket_insufficient_sample',
}

function inRange(iso: string | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (from && t < new Date(from).getTime()) return false
  if (to && t > new Date(to).getTime() + 86_400_000) return false // inclusive day
  return true
}

export async function rebuildAutoEngineLearningProfiles(opts: AutoEngineAggregationOptions = {}): Promise<{ run: AutoEngineLearningRun; profile: AutoEngineLearningProfile | null }> {
  const dryRun = !!opts.dryRun
  const repos = createRepositories()
  const startedAt = new Date().toISOString()
  const run: AutoEngineLearningRun = {
    id: `aelr_${Date.now().toString(36)}`, startedAt, finishedAt: null, status: 'running',
    source: 'auto_engine_promoted_alerts', outcomeSummariesScanned: 0, outcomeLinksScanned: 0,
    opportunitiesJoined: 0, sampleSize: 0, profileGenerated: false, recommendations: 0,
    learningEventsCreated: 0, dryRun, notes: [],
  }

  try {
    const [links, summaries, opps] = await Promise.all([
      repos.intelligence.listManualPromotedAlertLinks(1000).catch(() => []),
      repos.intelligence.listAutoOpportunityOutcomeSummaries(1000).catch(() => []),
      repos.intelligence.listAutoOpportunities({ limit: 1000 }).catch(() => []),
    ])
    run.outcomeLinksScanned = links.length
    run.outcomeSummariesScanned = summaries.length

    const oppById = new Map(opps.map(o => [o.id, o]))
    const linkByOpp = new Map(links.map(l => [l.opportunityId, l]))

    // Blocked-reason frequency (risk-gate observation only — blocked opps have no outcome).
    const blockedReasonCounts: Record<string, number> = {}
    for (const o of opps) {
      if (o.status !== 'blocked') continue
      for (const reason of (o.riskGate?.blockReasons ?? [])) blockedReasonCounts[reason] = (blockedReasonCounts[reason] || 0) + 1
    }

    const joined: JoinedPromotedOutcome[] = []
    for (const s of summaries) {
      if (!inRange(s.updatedAt, opts.from, opts.to)) continue
      const opp = oppById.get(s.opportunityId)
      const link = linkByOpp.get(s.opportunityId)
      const opportunityType: OpportunityType = (opp?.opportunityType ?? link?.opportunityType ?? 'unknown') as OpportunityType
      const originalScore = link?.originalScore ?? opp?.score ?? 0
      joined.push({
        opportunityId: s.opportunityId,
        opportunityType,
        score: opp?.score ?? originalScore,
        originalScore,
        confidenceBand: (opp?.confidenceBand ?? link?.originalConfidenceBand ?? 'insufficient_data') as ConfidenceBand,
        league: opp?.leagueName ?? 'unknown',
        homeTeam: opp?.homeTeam ?? 'unknown',
        awayTeam: opp?.awayTeam ?? 'unknown',
        minute: opp?.minute ?? null,
        dataQuality: opp?.evidence?.dataQuality ?? 'unknown',
        warnings: opp?.riskGate?.warnings ?? [],
        result: s.result,
        timeToResolutionMinutes: s.timeToResolutionMinutes,
        unknownReason: s.unknownReason,
      })
    }
    run.opportunitiesJoined = joined.length

    const generatedAt = new Date().toISOString()
    const profile = buildAutoEngineLearningProfile({
      id: `aelp_${Date.now().toString(36)}`, generatedAt, joined,
      promotedAlertsTotal: links.length, blockedReasonCounts,
    })
    run.sampleSize = profile.sampleSize
    run.recommendations = profile.recommendations.length
    run.profileGenerated = true

    if (!dryRun) {
      await repos.intelligence.upsertAutoEngineLearningProfile(profile)
      // Observational learning events for the strongest recommendations only (dedup by id).
      for (const rec of profile.recommendations) {
        if (rec.strength === 'low') continue
        try {
          const ev: LearningEvent = {
            id: `lev_aecal_${rec.id}`, type: REC_EVENT_TYPE[rec.type] || 'auto_engine_calibration_rebuilt',
            fixtureId: null, alertId: null, patternId: null, contextKey: rec.scopeKey,
            message: rec.message, evidenceRef: profile.id, confidence: rec.strength,
            source: 'auto_engine_calibration', createdAt: generatedAt,
          }
          await repos.intelligence.createLearningEvent(ev)
          run.learningEventsCreated++
        } catch { /* never block aggregation */ }
      }
      // One rebuild marker event (always, observational).
      try {
        await repos.intelligence.createLearningEvent({
          id: `lev_aecal_run_${run.id}`, type: 'auto_engine_calibration_rebuilt',
          fixtureId: null, alertId: null, patternId: null, contextKey: 'auto_engine_calibration',
          message: `Calibração do Motor Automático recomputada: ${profile.sampleSize} promovidos resolvidos, ${profile.recommendations.length} recomendações.`,
          evidenceRef: profile.id, confidence: profile.sampleQuality === 'insufficient' ? 'low' : 'medium',
          source: 'auto_engine_calibration', createdAt: generatedAt,
        })
        run.learningEventsCreated++
      } catch { /* */ }
      await repos.intelligence.createAutoEngineLearningRun({ ...run, status: 'completed', finishedAt: new Date().toISOString() })
    }

    run.status = 'completed'
    run.finishedAt = new Date().toISOString()
    if (joined.length === 0) run.notes.push('Nenhum alerta promovido resolvido ainda — perfil vazio honesto.')
    if (dryRun) run.notes.push('Dry-run: nada persistido.')
    return { run, profile }
  } catch (e: any) {
    run.status = 'failed'
    run.finishedAt = new Date().toISOString()
    run.notes.push(`Erro na agregação: ${e?.message || e}`)
    if (!dryRun) { try { await repos.intelligence.createAutoEngineLearningRun(run) } catch { /* */ } }
    return { run, profile: null }
  }
}
