/**
 * Provider Entity Mapping Review (B43).
 * ─────────────────────────────────────────────────────────────────────────────
 * Operator confirm/reject for team/competition/season mappings. Confirm unlocks
 * domains; reject is audited and not auto-reused. All actions audited.
 */
import { createRepositories } from '../../../repositories/index.js'
import type { ProviderTeamMapping, ProviderCompetitionMapping } from './providerIdentity.types.js'

function patch(m: ProviderTeamMapping | ProviderCompetitionMapping, status: 'manually_confirmed' | 'rejected', user: string | null) {
  const ts = new Date().toISOString()
  return {
    status, updatedAt: ts,
    ...(status === 'manually_confirmed' ? { confirmedAt: ts, confirmedBy: user, strength: 'manual_confirmed' as const } : {}),
    audit: [...(m.audit || []), { at: ts, by: user, action: status === 'manually_confirmed' ? 'manually_confirmed' as const : 'rejected' as const }],
  }
}

export async function confirmTeamMapping(mappingId: string, user: string | null): Promise<{ ok: boolean }> {
  const repos = createRepositories()
  const m = await repos.intelligence.getProviderTeamMapping(mappingId).catch(() => null)
  if (!m) return { ok: false }
  const res = await repos.intelligence.updateProviderTeamMappingStatus(mappingId, patch(m, 'manually_confirmed', user)).catch(() => ({ count: 0 }))
  return { ok: res.count > 0 }
}
export async function rejectTeamMapping(mappingId: string, user: string | null): Promise<{ ok: boolean }> {
  const repos = createRepositories()
  const m = await repos.intelligence.getProviderTeamMapping(mappingId).catch(() => null)
  if (!m) return { ok: false }
  const res = await repos.intelligence.updateProviderTeamMappingStatus(mappingId, patch(m, 'rejected', user)).catch(() => ({ count: 0 }))
  return { ok: res.count > 0 }
}
export async function confirmCompetitionMapping(mappingId: string, user: string | null): Promise<{ ok: boolean }> {
  const repos = createRepositories()
  const m = await repos.intelligence.getProviderCompetitionMapping(mappingId).catch(() => null)
  if (!m) return { ok: false }
  const res = await repos.intelligence.updateProviderCompetitionMappingStatus(mappingId, patch(m, 'manually_confirmed', user)).catch(() => ({ count: 0 }))
  return { ok: res.count > 0 }
}
export async function rejectCompetitionMapping(mappingId: string, user: string | null): Promise<{ ok: boolean }> {
  const repos = createRepositories()
  const m = await repos.intelligence.getProviderCompetitionMapping(mappingId).catch(() => null)
  if (!m) return { ok: false }
  const res = await repos.intelligence.updateProviderCompetitionMappingStatus(mappingId, patch(m, 'rejected', user)).catch(() => ({ count: 0 }))
  return { ok: res.count > 0 }
}

export async function listMappingsNeedingReview(): Promise<{ teams: ProviderTeamMapping[]; competitions: ProviderCompetitionMapping[] }> {
  const repos = createRepositories()
  const [tA, tC, cA, cC] = await Promise.all([
    repos.intelligence.listProviderTeamMappingsByStatus('ambiguous', 200).catch(() => []),
    repos.intelligence.listProviderTeamMappingsByStatus('candidate', 200).catch(() => []),
    repos.intelligence.listProviderCompetitionMappingsByStatus('ambiguous', 200).catch(() => []),
    repos.intelligence.listProviderCompetitionMappingsByStatus('candidate', 200).catch(() => []),
  ])
  return { teams: [...tA, ...tC], competitions: [...cA, ...cC] }
}

export async function listTeamMappings(): Promise<ProviderTeamMapping[]> { return createRepositories().intelligence.listProviderTeamMappings(500).catch(() => []) }
export async function listCompetitionMappings(): Promise<ProviderCompetitionMapping[]> { return createRepositories().intelligence.listProviderCompetitionMappings(500).catch(() => []) }
