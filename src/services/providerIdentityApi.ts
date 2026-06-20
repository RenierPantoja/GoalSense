/**
 * providerIdentityApi (B42) — cross-provider identity resolution client.
 * ─────────────────────────────────────────────────────────────────────────────
 * Token-aware. GET reads open; resolve/confirm/reject operator+. No odds, no secrets.
 */
import { apiFetch } from './apiClient'
import type {
  FixtureIdentityCandidateDto, ProviderEntityMappingDto, FixtureIdentityResolutionRunDto, TeamAliasDto, CompetitionAliasDto,
} from '@/features/matchIntelligence/providerIdentityTypes'

const BASE = '/api/match-intelligence/identity'

export const providerIdentityApi = {
  listResolutionRuns() { return apiFetch<FixtureIdentityResolutionRunDto[]>(`${BASE}/resolution-runs`) },
  getResolutionRun(id: string) { return apiFetch<FixtureIdentityResolutionRunDto>(`${BASE}/resolution-runs/${encodeURIComponent(id)}`) },
  runTodayIdentityResolution() { return apiFetch<FixtureIdentityResolutionRunDto>(`${BASE}/resolve/today`, { method: 'POST', body: '{}' }) },
  runFixtureIdentityResolution(fixtureId: string) { return apiFetch<{ mapping: ProviderEntityMappingDto | null; candidates: FixtureIdentityCandidateDto[]; status: string }>(`${BASE}/resolve/fixtures/${encodeURIComponent(fixtureId)}`, { method: 'POST', body: '{}' }) },
  getFixtureCandidates(fixtureId: string) { return apiFetch<FixtureIdentityCandidateDto[]>(`${BASE}/fixtures/${encodeURIComponent(fixtureId)}/candidates`) },
  getFixtureMapping(fixtureId: string) { return apiFetch<ProviderEntityMappingDto | null>(`${BASE}/fixtures/${encodeURIComponent(fixtureId)}/mapping`) },
  confirmProviderMapping(mappingId: string) { return apiFetch<{ ok: boolean }>(`${BASE}/mappings/${encodeURIComponent(mappingId)}/confirm`, { method: 'POST', body: '{}' }) },
  rejectProviderMapping(mappingId: string) { return apiFetch<{ ok: boolean }>(`${BASE}/mappings/${encodeURIComponent(mappingId)}/reject`, { method: 'POST', body: '{}' }) },
  listTeamAliases() { return apiFetch<TeamAliasDto[]>(`${BASE}/aliases/teams`) },
  listCompetitionAliases() { return apiFetch<CompetitionAliasDto[]>(`${BASE}/aliases/competitions`) },
}
