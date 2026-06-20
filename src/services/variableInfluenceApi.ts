/**
 * variableInfluenceApi (B46 / Bloco 3) — variable influence engine client.
 * Read-only GETs are safe; POST build endpoints require operator (run:scan).
 */
import { apiFetch } from './apiClient'
import type {
  ComposedInfluenceDto, InfluenceBuildRunDto, ReadinessV7Dto,
} from '@/features/matchIntelligence/variableInfluenceTypes'

const BASE = '/api/match-intelligence'
const fx = (id: string) => `${BASE}/fixtures/${encodeURIComponent(id)}`

export const variableInfluenceApi = {
  getFixtureInfluence(id: string) { return apiFetch<ComposedInfluenceDto>(`${fx(id)}/influence`) },
  buildFixtureInfluence(id: string) { return apiFetch<{ run: InfluenceBuildRunDto }>(`${fx(id)}/influence/build`, { method: 'POST', body: '{}' }) },
  getPatternInfluence(id: string, patternId: string) { return apiFetch<ComposedInfluenceDto>(`${fx(id)}/patterns/${encodeURIComponent(patternId)}/influence`) },
  buildPatternInfluence(id: string, patternId: string) { return apiFetch<{ run: InfluenceBuildRunDto }>(`${fx(id)}/patterns/${encodeURIComponent(patternId)}/influence/build`, { method: 'POST', body: '{}' }) },
  getPackageV5(id: string) { return apiFetch<unknown>(`${fx(id)}/package-v5`) },
  getReadinessV7(id: string) { return apiFetch<ReadinessV7Dto>(`${fx(id)}/readiness-v7`) },
  getPrecheckV7(id: string) { return apiFetch<unknown>(`${fx(id)}/precheck-v7`) },
  getPostMatchExplanationV5(id: string) { return apiFetch<unknown>(`${fx(id)}/post-match-explanation-v5`) },
  listInfluenceBuildRuns() { return apiFetch<InfluenceBuildRunDto[]>(`${BASE}/influence/build-runs`) },
}
