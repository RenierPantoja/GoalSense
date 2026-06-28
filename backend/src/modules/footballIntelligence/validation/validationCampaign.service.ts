/**
 * Validation Campaign Tracker (B50).
 * ─────────────────────────────────────────────────────────────────────────────
 * Groups several daily validation reports across a 7–14 day campaign and aggregates
 * metrics. Observational; a campaign summary is NOT a promise of accuracy. Persists to
 * Firebase; Noop returns empty honestly.
 */
import { createRepositories } from '../../../repositories/index.js'
import type { ValidationCampaign } from './validationCampaign.types.js'
import type { DailyValidationReport } from './validationCampaign.types.js'

let seq = 0
function campaignId(): string { seq = (seq + 1) % 1e9; return `vcamp_${Date.now().toString(36)}_${seq.toString(36)}` }

export async function createValidationCampaign(title: string, targetDays = 14): Promise<ValidationCampaign> {
  const campaign: ValidationCampaign = {
    id: campaignId(), title: title || 'Campanha de validação local', startedAt: new Date().toISOString(), endedAt: null,
    status: 'running', targetDays, actualDays: 0, dailyReportIds: [],
    aggregateMetrics: {
      fixturesAnalyzed: 0,
      fixturesWithData: 0,
      governanceEvaluations: 0,
      causalEvaluable: 0,
      causalNotEvaluable: 0,
      providerLimitedFixtures: 0,
      liveMonitoringHours: 0,
      completedLiveFirstFixtures: 0,
      evaluableLiveFirstCases: 0,
      orphanRecoveryCount: 0,
      postMatchSweeperCount: 0,
    },
    blockers: [], warnings: [], finalRecommendation: 'Em andamento — acumular dias reais antes de concluir.',
    limitations: ['Campanha observacional; resumo não é promessa de acerto.'],
  }
  try { await createRepositories().intelligence.saveValidationCampaign(campaign) } catch { /* noop */ }
  return campaign
}

export async function attachDailyReport(campaignId: string, report: DailyValidationReport): Promise<{ count: number }> {
  const repos = createRepositories()
  const campaign = await repos.intelligence.getValidationCampaign(campaignId).catch(() => null)
  if (!campaign) return { count: 0 }
  if (campaign.dailyReportIds.includes(report.id)) return { count: 0 } // idempotent per date
  const dailyReportIds = [...campaign.dailyReportIds, report.id]
  const agg = campaign.aggregateMetrics
  const aggregateMetrics = {
    fixturesAnalyzed: agg.fixturesAnalyzed + report.fixturesAnalyzed,
    fixturesWithData: agg.fixturesWithData + (report.fixturesAnalyzed - report.notEvaluableSummary.fixturesWithoutData),
    governanceEvaluations: agg.governanceEvaluations + report.governanceSummary.evaluations,
    causalEvaluable: agg.causalEvaluable + report.causalSummary.evaluable,
    causalNotEvaluable: agg.causalNotEvaluable + report.causalSummary.notEvaluable,
    providerLimitedFixtures: agg.providerLimitedFixtures + report.providerLimitations.length,
    liveMonitoringHours: (agg.liveMonitoringHours ?? 0) + Math.round((report.workerSessionsCompleted * report.averageSessionDurationMinutes) / 60),
    completedLiveFirstFixtures: (agg.completedLiveFirstFixtures ?? 0) + report.liveFirstCompletedFixtures,
    evaluableLiveFirstCases: (agg.evaluableLiveFirstCases ?? 0) + report.liveFirstEvaluableCases,
    orphanRecoveryCount: (agg.orphanRecoveryCount ?? 0) + report.orphanSessionsRecovered,
    postMatchSweeperCount: (agg.postMatchSweeperCount ?? 0) + report.postMatchSweeperRuns,
  }
  return repos.intelligence.updateValidationCampaign(campaignId, { dailyReportIds, actualDays: dailyReportIds.length, aggregateMetrics }).catch(() => ({ count: 0 }))
}

export function buildCampaignSummary(campaign: ValidationCampaign): { recommendation: string; warnings: string[] } {
  const warnings: string[] = []
  if (campaign.actualDays < 7) warnings.push(`Apenas ${campaign.actualDays} dia(s) — abaixo do mínimo recomendado (7–14).`)
  if (campaign.aggregateMetrics.causalEvaluable < 25) warnings.push('Poucos casos causais avaliáveis — base ainda pequena.')
  const recommendation = campaign.actualDays >= 7 && campaign.aggregateMetrics.fixturesWithData > 0
    ? 'Base inicial acumulada — revisar bloqueadores antes de considerar beta controlado (sem garantia comercial).'
    : 'Continuar a campanha — base insuficiente para qualquer decisão de beta.'
  return { recommendation, warnings }
}

export async function closeCampaign(campaignId: string): Promise<ValidationCampaign | null> {
  const repos = createRepositories()
  const campaign = await repos.intelligence.getValidationCampaign(campaignId).catch(() => null)
  if (!campaign) return null
  const summary = buildCampaignSummary(campaign)
  const patch = { status: 'completed' as const, endedAt: new Date().toISOString(), finalRecommendation: summary.recommendation, warnings: [...new Set([...campaign.warnings, ...summary.warnings])] }
  await repos.intelligence.updateValidationCampaign(campaignId, patch).catch(() => ({ count: 0 }))
  return { ...campaign, ...patch }
}

export async function listCampaigns(limit = 50): Promise<ValidationCampaign[]> {
  try { return await createRepositories().intelligence.listValidationCampaigns(limit) } catch { return [] }
}
export async function getCampaign(id: string): Promise<ValidationCampaign | null> {
  try { return await createRepositories().intelligence.getValidationCampaign(id) } catch { return null }
}
