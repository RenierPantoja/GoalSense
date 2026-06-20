/**
 * providerEntityMappingApi (B43) — team/competition mapping + domain unlock client.
 */
import { apiFetch } from './apiClient'
import type {
  ProviderTeamMappingDto, ProviderCompetitionMappingDto, AcquisitionReportV3Dto, DomainUnlockStatusDto, EntityDerivationRunDto,
} from '@/features/matchIntelligence/providerEntityMappingTypes'

const BASE = '/api/match-intelligence'
const ID = `${BASE}/identity/entity-mappings`

export const providerEntityMappingApi = {
  listTeamMappings() { return apiFetch<ProviderTeamMappingDto[]>(`${ID}/teams`) },
  listCompetitionMappings() { return apiFetch<ProviderCompetitionMappingDto[]>(`${ID}/competitions`) },
  deriveEntityMappings() { return apiFetch<EntityDerivationRunDto>(`${ID}/derive`, { method: 'POST', body: '{}' }) },
  confirmTeamMapping(id: string) { return apiFetch<{ ok: boolean }>(`${ID}/teams/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: '{}' }) },
  rejectTeamMapping(id: string) { return apiFetch<{ ok: boolean }>(`${ID}/teams/${encodeURIComponent(id)}/reject`, { method: 'POST', body: '{}' }) },
  confirmCompetitionMapping(id: string) { return apiFetch<{ ok: boolean }>(`${ID}/competitions/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: '{}' }) },
  rejectCompetitionMapping(id: string) { return apiFetch<{ ok: boolean }>(`${ID}/competitions/${encodeURIComponent(id)}/reject`, { method: 'POST', body: '{}' }) },
  getDomainUnlockStatus(fixtureId: string) { return apiFetch<AcquisitionReportV3Dto>(`${BASE}/fixtures/${encodeURIComponent(fixtureId)}/domain-unlock-status`) },
  getDomainUnlockStatusFor(fixtureId: string, domain: string) { return apiFetch<DomainUnlockStatusDto>(`${BASE}/fixtures/${encodeURIComponent(fixtureId)}/domain-unlock-status/${encodeURIComponent(domain)}`) },
  runAcquisitionV3(fixtureId: string) { return apiFetch<{ run: unknown; reportV2: unknown; reportV3: AcquisitionReportV3Dto }>(`${BASE}/fixtures/${encodeURIComponent(fixtureId)}/acquisition/run-v3`, { method: 'POST', body: '{}' }) },
}
