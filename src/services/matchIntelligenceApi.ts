/**
 * matchIntelligenceApi (Match Intelligence Fabric) — Backstage client.
 * ─────────────────────────────────────────────────────────────────────────────
 * Token-aware reads + operator-gated refresh. Reads degrade honestly. No odds,
 * no Telegram, no stake.
 */
import { apiFetch } from './apiClient'
import type {
  ProviderCapabilitiesDto, MatchDayScopeDto, MatchIntelligencePackageDto, ReadinessDto,
  DecisionInputBundleDto, AlertPrecheckDto, PostMatchExplanationDto, TeamMemoryDto,
  SquadAvailabilityDto,
} from '@/features/matchIntelligence/matchIntelligenceTypes'

const BASE = '/api/match-intelligence'
const fx = (id: string) => `${BASE}/fixtures/${encodeURIComponent(id)}`

export const matchIntelligenceApi = {
  getProviderCapabilities() { return apiFetch<{ capabilities: ProviderCapabilitiesDto; reliability: unknown }>(`${BASE}/provider-capabilities`) },
  getTodayMatchScope(onlyLive = false) { return apiFetch<MatchDayScopeDto>(`${BASE}/today${onlyLive ? '?onlyLive=true' : ''}`) },
  refreshTodayMatchScope() { return apiFetch<{ scope: MatchDayScopeDto; providerBudget: unknown }>(`${BASE}/today/refresh`, { method: 'POST', body: '{}' }) },
  getMatchIntelligencePackage(id: string) { return apiFetch<MatchIntelligencePackageDto>(`${fx(id)}/package`) },
  getMatchReadiness(id: string) { return apiFetch<ReadinessDto>(`${fx(id)}/readiness`) },
  getMatchContext(id: string) { return apiFetch<MatchIntelligencePackageDto['context']>(`${fx(id)}/context`) },
  getTeamMemoryForFixture(id: string) { return apiFetch<{ home: TeamMemoryDto | null; away: TeamMemoryDto | null }>(`${fx(id)}/team-memory`) },
  getH2HIntelligence(id: string) { return apiFetch<unknown>(`${fx(id)}/h2h`) },
  getSquadAvailability(id: string) { return apiFetch<SquadAvailabilityDto>(`${fx(id)}/squad-availability`) },
  getTacticalMatchup(id: string) { return apiFetch<unknown>(`${fx(id)}/tactical-matchup`) },
  getDecisionInputs(id: string) { return apiFetch<DecisionInputBundleDto>(`${fx(id)}/decision-inputs`) },
  getAlertPrecheck(id: string) { return apiFetch<AlertPrecheckDto>(`${fx(id)}/alert-precheck`) },
  getPostMatchExplanation(id: string) { return apiFetch<PostMatchExplanationDto>(`${fx(id)}/post-match-explanation`) },
  refreshMatchIntelligence(id: string) { return apiFetch<{ package: MatchIntelligencePackageDto; providerBudget: unknown }>(`${fx(id)}/refresh`, { method: 'POST', body: '{}' }) },
}
