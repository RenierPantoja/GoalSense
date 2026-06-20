/**
 * historicalMemoryApi (B45 / Bloco 2) — historical club/matchup/context memory client.
 * Read-only GETs are safe; POST build endpoints require operator (run:scan).
 */
import { apiFetch } from './apiClient'
import type {
  FixtureMemoryDto, TeamFundamentalMemoryDto, MatchupFundamentalMemoryDto,
  HistoricalPatternContextProfileDto, TabooCandidateDto, SimilarScenarioResultDto,
  MemoryBuildRunDto, ReadinessV6Dto,
} from '@/features/matchIntelligence/historicalMemoryTypes'

const BASE = '/api/match-intelligence'
const fx = (id: string) => `${BASE}/fixtures/${encodeURIComponent(id)}`

export const historicalMemoryApi = {
  getFixtureMemory(id: string) { return apiFetch<FixtureMemoryDto>(`${fx(id)}/memory`) },
  buildFixtureMemory(id: string) { return apiFetch<MemoryBuildRunDto>(`${fx(id)}/memory/build`, { method: 'POST', body: '{}' }) },
  getTeamFundamentalMemory(teamId: string) { return apiFetch<TeamFundamentalMemoryDto>(`${BASE}/teams/${encodeURIComponent(teamId)}/fundamental-memory`) },
  buildTeamFundamentalMemory(teamId: string) { return apiFetch<MemoryBuildRunDto>(`${BASE}/teams/${encodeURIComponent(teamId)}/fundamental-memory/build`, { method: 'POST', body: '{}' }) },
  getMatchupMemory(id: string) { return apiFetch<MatchupFundamentalMemoryDto>(`${fx(id)}/matchup-memory`) },
  getTabooCandidates(id: string) { return apiFetch<TabooCandidateDto[]>(`${fx(id)}/taboos`) },
  getSimilarScenarios(id: string) { return apiFetch<SimilarScenarioResultDto>(`${fx(id)}/similar-scenarios`) },
  getPatternMemory(id: string) { return apiFetch<HistoricalPatternContextProfileDto[]>(`${fx(id)}/pattern-memory`) },
  getMemoryBuildRuns() { return apiFetch<MemoryBuildRunDto[]>(`${BASE}/memory/build-runs`) },
  buildTodayMemory() { return apiFetch<MemoryBuildRunDto>(`${BASE}/memory/today/build`, { method: 'POST', body: '{}' }) },
  getMemoryStatus() { return apiFetch<{ buildEnabled: boolean; schedulerEnabled: boolean }>(`${BASE}/memory/status`) },
  getPackageV4(id: string) { return apiFetch<unknown>(`${fx(id)}/package-v4`) },
  getReadinessV6(id: string) { return apiFetch<ReadinessV6Dto>(`${fx(id)}/readiness-v6`) },
  getPrecheckV6(id: string) { return apiFetch<unknown>(`${fx(id)}/precheck-v6`) },
  getPostMatchExplanationV4(id: string) { return apiFetch<unknown>(`${fx(id)}/post-match-explanation-v4`) },
}
