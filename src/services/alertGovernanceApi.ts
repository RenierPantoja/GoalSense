/**
 * alertGovernanceApi (B47 / Bloco 4) — alert decision governance client.
 * Read-only GETs are safe; POST evaluate/recheck/resolve/live-trigger require operator.
 */
import { apiFetch } from './apiClient'
import type {
  GovernanceModeDto, FixtureGovernanceDto, AlertDecisionGovernanceResultDto,
  AlertGovernanceHoldDto, AlertGovernanceRunDto, LiveReevaluationOutcomeDto,
} from '@/features/matchIntelligence/alertGovernanceTypes'

const BASE = '/api/match-intelligence'
const fx = (id: string) => `${BASE}/fixtures/${encodeURIComponent(id)}`

export const alertGovernanceApi = {
  getGovernanceMode() { return apiFetch<GovernanceModeDto>(`${BASE}/governance/mode`) },
  getFixtureGovernance(id: string) { return apiFetch<FixtureGovernanceDto>(`${fx(id)}/governance`) },
  evaluateFixtureGovernance(id: string, body: { patternId?: string; source?: string } = {}) { return apiFetch<AlertDecisionGovernanceResultDto>(`${fx(id)}/governance/evaluate`, { method: 'POST', body: JSON.stringify(body) }) },
  getGovernanceHolds(id: string) { return apiFetch<AlertGovernanceHoldDto[]>(`${fx(id)}/governance/holds`) },
  recheckGovernanceHold(holdId: string, trigger = 'minute_threshold') { return apiFetch<LiveReevaluationOutcomeDto>(`${BASE}/governance/holds/${encodeURIComponent(holdId)}/recheck`, { method: 'POST', body: JSON.stringify({ trigger }) }) },
  resolveGovernanceHold(holdId: string) { return apiFetch<{ count: number }>(`${BASE}/governance/holds/${encodeURIComponent(holdId)}/resolve`, { method: 'POST', body: '{}' }) },
  getGovernanceResult(resultId: string) { return apiFetch<{ result: AlertDecisionGovernanceResultDto; explanation: string }>(`${BASE}/governance/results/${encodeURIComponent(resultId)}`) },
  listGovernanceRuns() { return apiFetch<AlertGovernanceRunDto[]>(`${BASE}/governance/runs`) },
  sendGovernanceLiveTrigger(id: string, trigger: string) { return apiFetch<LiveReevaluationOutcomeDto>(`${fx(id)}/governance/live-trigger`, { method: 'POST', body: JSON.stringify({ trigger }) }) },
}
