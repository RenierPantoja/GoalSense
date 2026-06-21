/**
 * causalLearningApi (B48 / Bloco 5) — post-match causal learning client.
 * Read-only GETs are safe; POST run/review require operator (run:scan).
 */
import { apiFetch } from './apiClient'
import type {
  CausalLearningCaseDto, CausalLearningInsightDto, CausalLearningRunDto,
  GovernanceCalibrationSuggestionDto, VariableInfluenceCalibrationSuggestionDto,
} from '@/features/matchIntelligence/causalLearningTypes'

const BASE = '/api/match-intelligence'
const fx = (id: string) => `${BASE}/fixtures/${encodeURIComponent(id)}`

export const causalLearningApi = {
  listCausalCases() { return apiFetch<CausalLearningCaseDto[]>(`${BASE}/causal/cases`) },
  getCausalCase(caseId: string) { return apiFetch<CausalLearningCaseDto>(`${BASE}/causal/cases/${encodeURIComponent(caseId)}`) },
  listFixtureCausalCases(id: string) { return apiFetch<CausalLearningCaseDto[]>(`${fx(id)}/causal/cases`) },
  runFixtureCausalLearning(id: string) { return apiFetch<CausalLearningRunDto>(`${fx(id)}/causal/run`, { method: 'POST', body: '{}' }) },
  runTodayCausalLearning() { return apiFetch<CausalLearningRunDto>(`${BASE}/causal/today/run`, { method: 'POST', body: '{}' }) },
  runAlertCausalLearning(alertId: string) { return apiFetch<CausalLearningRunDto>(`${BASE}/alerts/${encodeURIComponent(alertId)}/causal/run`, { method: 'POST', body: '{}' }) },
  runGovernanceResultCausalLearning(resultId: string) { return apiFetch<CausalLearningRunDto>(`${BASE}/governance/results/${encodeURIComponent(resultId)}/causal/run`, { method: 'POST', body: '{}' }) },
  listCausalInsights() { return apiFetch<CausalLearningInsightDto[]>(`${BASE}/causal/insights`) },
  listFixtureCausalInsights(id: string) { return apiFetch<CausalLearningInsightDto[]>(`${fx(id)}/causal/insights`) },
  listGovernanceCalibrationSuggestions() { return apiFetch<GovernanceCalibrationSuggestionDto[]>(`${BASE}/causal/calibration/governance`) },
  listInfluenceCalibrationSuggestions() { return apiFetch<VariableInfluenceCalibrationSuggestionDto[]>(`${BASE}/causal/calibration/influence`) },
  reviewCalibrationSuggestion(suggestionId: string) { return apiFetch<{ count: number; kind: string }>(`${BASE}/causal/calibration/${encodeURIComponent(suggestionId)}/review`, { method: 'POST', body: '{}' }) },
  rejectCalibrationSuggestion(suggestionId: string) { return apiFetch<{ count: number; kind: string }>(`${BASE}/causal/calibration/${encodeURIComponent(suggestionId)}/reject`, { method: 'POST', body: '{}' }) },
  acceptCalibrationSuggestionForFuture(suggestionId: string) { return apiFetch<{ count: number; kind: string }>(`${BASE}/causal/calibration/${encodeURIComponent(suggestionId)}/accept-for-future`, { method: 'POST', body: '{}' }) },
  listCausalLearningRuns() { return apiFetch<CausalLearningRunDto[]>(`${BASE}/causal/runs`) },
  getPostMatchExplanationV7(id: string) { return apiFetch<unknown>(`${fx(id)}/post-match-explanation-v7`) },
}
