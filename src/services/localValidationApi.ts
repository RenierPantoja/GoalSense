/**
 * localValidationApi (B49 / Bloco 6) — local long-run validation client.
 * Read-only GETs are safe; POST run/cancel/repair require operator (run:scan).
 */
import { apiFetch } from './apiClient'
import type {
  LocalValidationPlanDto, LocalValidationRunDto, LocalValidationReliabilityMetricsDto,
  LocalValidationCoverageMetricsDto, LocalValidationCostMetricsDto, LocalValidationGoNoGoReportDto,
  ProviderCoverageReportDto, BackendHealthReportDto, LinkRepairResultDto,
} from '@/features/matchIntelligence/localValidationTypes'
import type { DailyValidationReportDto } from '@/features/matchIntelligence/dailyValidationReportTypes'
import type { ValidationCampaignDto } from '@/features/matchIntelligence/validationCampaignTypes'
import type { ControlledBetaReadinessReportDto } from '@/features/matchIntelligence/controlledBetaReadinessTypes'
import type { EspnLiveFirstWorkerStatusDto } from '@/features/matchIntelligence/espnLiveFirstWorkerTypes'

const BASE = '/api/match-intelligence/local-validation'
const LIVE_FIRST_BASE = '/api/match-intelligence/espn-live-first'
const run = (id: string) => `${BASE}/runs/${encodeURIComponent(id)}`

export const localValidationApi = {
  getTodayValidationPlan() { return apiFetch<LocalValidationPlanDto>(`${BASE}/plan/today`) },
  runTodayValidation() { return apiFetch<LocalValidationRunDto>(`${BASE}/run/today`, { method: 'POST', body: '{}' }) },
  runFixtureValidation(fixtureId: string) { return apiFetch<LocalValidationRunDto>(`${BASE}/run/fixtures/${encodeURIComponent(fixtureId)}`, { method: 'POST', body: '{}' }) },
  listValidationRuns() { return apiFetch<LocalValidationRunDto[]>(`${BASE}/runs`) },
  getValidationRun(runId: string) { return apiFetch<LocalValidationRunDto>(run(runId)) },
  cancelValidationRun(runId: string) { return apiFetch<{ count: number }>(`${run(runId)}/cancel`, { method: 'POST', body: '{}' }) },
  getReliabilityMetrics(runId: string) { return apiFetch<LocalValidationReliabilityMetricsDto>(`${run(runId)}/metrics/reliability`) },
  getCoverageMetrics(runId: string) { return apiFetch<LocalValidationCoverageMetricsDto>(`${run(runId)}/metrics/coverage`) },
  getCostMetrics(runId: string) { return apiFetch<LocalValidationCostMetricsDto>(`${run(runId)}/metrics/cost`) },
  getReadinessReport(runId: string) { return apiFetch<unknown>(`${run(runId)}/report/readiness`) },
  getGoNoGoReport(runId: string) { return apiFetch<LocalValidationGoNoGoReportDto>(`${run(runId)}/report/go-no-go`) },
  getProviderCoverage() { return apiFetch<ProviderCoverageReportDto>(`${BASE}/provider-coverage`) },
  getBackendHealth() { return apiFetch<BackendHealthReportDto>(`${BASE}/backend-health`) },
  repairTodayDecisionOutcomeLinks() { return apiFetch<LinkRepairResultDto>(`${BASE}/links/repair/today`, { method: 'POST', body: '{}' }) },
  repairFixtureDecisionOutcomeLinks(fixtureId: string) { return apiFetch<LinkRepairResultDto>(`${BASE}/links/repair/fixtures/${encodeURIComponent(fixtureId)}`, { method: 'POST', body: '{}' }) },
  // B50
  getDailyValidationReport(date?: string) { return apiFetch<DailyValidationReportDto>(`${BASE}/daily-report${date ? `?date=${encodeURIComponent(date)}` : ''}`) },
  generateDailyValidationReport(date?: string, campaignId?: string) { return apiFetch<DailyValidationReportDto>(`${BASE}/daily-report/generate`, { method: 'POST', body: JSON.stringify({ date, campaignId }) }) },
  listValidationCampaigns() { return apiFetch<ValidationCampaignDto[]>(`${BASE}/campaigns`) },
  createValidationCampaign(title: string, targetDays = 14) { return apiFetch<ValidationCampaignDto>(`${BASE}/campaigns`, { method: 'POST', body: JSON.stringify({ title, targetDays }) }) },
  getValidationCampaign(campaignId: string) { return apiFetch<ValidationCampaignDto>(`${BASE}/campaigns/${encodeURIComponent(campaignId)}`) },
  closeValidationCampaign(campaignId: string) { return apiFetch<ValidationCampaignDto>(`${BASE}/campaigns/${encodeURIComponent(campaignId)}/close`, { method: 'POST', body: '{}' }) },
  getControlledBetaReadiness() { return apiFetch<ControlledBetaReadinessReportDto>(`${BASE}/controlled-beta-readiness`) },
  getEspnLiveFirstWorkerStatus() { return apiFetch<EspnLiveFirstWorkerStatusDto>(`${LIVE_FIRST_BASE}/worker/status`) },
  startEspnLiveFirstWorker(options: { maxDurationMinutes?: number; maxFixtures?: number; pollIntervalSeconds?: number } = {}) {
    return apiFetch<{ success: boolean; workerRunId?: string; message: string }>(`${LIVE_FIRST_BASE}/worker/start`, { method: 'POST', body: JSON.stringify(options) })
  },
  stopEspnLiveFirstWorker(workerRunId: string) {
    return apiFetch<{ success: boolean; message: string }>(`${LIVE_FIRST_BASE}/worker/${encodeURIComponent(workerRunId)}/stop`, { method: 'POST', body: '{}' })
  },
  resumeEspnLiveFirstWorker(workerRunId: string) {
    return apiFetch<{ success: boolean; message: string }>(`${LIVE_FIRST_BASE}/worker/${encodeURIComponent(workerRunId)}/resume`, { method: 'POST', body: '{}' })
  },
  runEspnLiveFirstRecoverySweep() {
    return apiFetch<unknown>(`${LIVE_FIRST_BASE}/recovery-sweep`, { method: 'POST', body: '{}' })
  },
  runEspnLiveFirstPostMatchSweeper() {
    return apiFetch<unknown>(`${LIVE_FIRST_BASE}/post-match-sweeper`, { method: 'POST', body: '{}' })
  },
}
