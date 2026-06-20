/**
 * criticalDomainApi (B44) — critical pre-match domain operations client.
 */
import { apiFetch } from './apiClient'
import type {
  ProviderEndpointCatalogEntryDto, DomainUnlockMatrixEntryDto, CriticalDomainAcquisitionReportDto, ReadinessV5Dto, PrecheckV5Dto,
} from '@/features/matchIntelligence/criticalDomainTypes'

const BASE = '/api/match-intelligence'
const fx = (id: string) => `${BASE}/fixtures/${encodeURIComponent(id)}`

export const criticalDomainApi = {
  getProviderEndpointCatalog() { return apiFetch<ProviderEndpointCatalogEntryDto[]>(`${BASE}/providers/endpoints`) },
  getDomainUnlockMatrix(id: string) { return apiFetch<DomainUnlockMatrixEntryDto[]>(`${fx(id)}/domain-unlock-matrix`) },
  getCriticalDomainSnapshot(id: string, domain: string) { return apiFetch<DomainUnlockMatrixEntryDto>(`${fx(id)}/domains/${encodeURIComponent(domain)}`) },
  refreshCriticalDomain(id: string, domain: string) { return apiFetch<unknown>(`${fx(id)}/domains/${encodeURIComponent(domain)}/refresh`, { method: 'POST', body: '{}' }) },
  getCriticalAcquisitionReport(id: string) { return apiFetch<CriticalDomainAcquisitionReportDto>(`${fx(id)}/critical-acquisition-report`) },
  runCriticalDomainAcquisition(id: string) { return apiFetch<CriticalDomainAcquisitionReportDto>(`${fx(id)}/acquisition/critical/run`, { method: 'POST', body: '{}' }) },
  runTodayCriticalDomainAcquisition() { return apiFetch<{ fixtures: number; reports: unknown[] }>(`${BASE}/today/acquisition/critical/run`, { method: 'POST', body: '{}' }) },
  getReadinessV5(id: string) { return apiFetch<ReadinessV5Dto>(`${fx(id)}/readiness-v5`) },
  getPrecheckV5(id: string) { return apiFetch<PrecheckV5Dto>(`${fx(id)}/precheck-v5`) },
  getPostMatchExplanationV3(id: string) { return apiFetch<unknown>(`${fx(id)}/post-match-explanation-v3`) },
}
