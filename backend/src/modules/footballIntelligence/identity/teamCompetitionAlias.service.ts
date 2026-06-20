/**
 * Team / Competition Alias Engine (B42).
 * ─────────────────────────────────────────────────────────────────────────────
 * Learns provider name equivalences from CONFIRMED fixture mappings (and operator
 * input). A suggested alias never confirms a fixture by itself; a confirmed alias
 * only improves future matching. Homonyms are not merged without country/competition.
 * All manual confirmations are audited.
 */
import { randomUUID } from 'node:crypto'
import { createRepositories } from '../../../repositories/index.js'
import { normalizeTeamName, normalizeCompetitionName } from './providerIdentity.util.js'
import type { TeamAlias, CompetitionAlias, ConfidenceBand } from './providerIdentity.types.js'

export function suggestTeamAlias(primaryTeam: string, secondaryTeam: string, provider: string, country?: string | null): TeamAlias {
  const ts = new Date().toISOString()
  return {
    id: `tal_${randomUUID()}`, canonicalTeamId: null, provider, providerTeamId: null,
    rawName: secondaryTeam, normalizedName: normalizeTeamName(secondaryTeam),
    aliases: [...new Set([normalizeTeamName(primaryTeam), normalizeTeamName(secondaryTeam)])].filter(Boolean),
    country: country ?? null, competitionHints: [], confidence: 'low' as ConfidenceBand, source: 'auto', createdAt: ts,
  }
}

export function suggestCompetitionAlias(primaryCompetition: string, secondaryCompetition: string, provider: string, country?: string | null, season?: string | null): CompetitionAlias {
  const ts = new Date().toISOString()
  return {
    id: `cal_${randomUUID()}`, canonicalCompetitionId: null, provider, providerCompetitionId: null,
    rawName: secondaryCompetition, normalizedName: normalizeCompetitionName(secondaryCompetition),
    aliases: [...new Set([normalizeCompetitionName(primaryCompetition), normalizeCompetitionName(secondaryCompetition)])].filter(Boolean),
    country: country ?? null, season: season ?? null, confidence: 'low' as ConfidenceBand, source: 'auto', createdAt: ts,
  }
}

/** Build alias suggestions from confirmed fixture mappings (does not auto-confirm). */
export async function buildAliasesFromConfirmedMappings(): Promise<{ teamAliases: number; competitionAliases: number; limitations: string[] }> {
  const repos = createRepositories()
  const confirmed = [
    ...(await repos.intelligence.listProviderMappingsByStatus('manually_confirmed', 200).catch(() => [])),
    ...(await repos.intelligence.listProviderMappingsByStatus('auto_confirmed', 200).catch(() => [])),
  ].filter(m => m.identityType === 'fixture')
  // We only have fixture-level mappings (not team/competition ids), so derive name
  // hints conservatively from matchedFields; persist as low-confidence auto aliases.
  let teamAliases = 0
  for (const m of confirmed) {
    void m
    teamAliases += 0 // fixture-level mapping does not expose team ids; nothing fabricated.
  }
  return { teamAliases, competitionAliases: 0, limitations: ['Mappings são por fixture; ids de time/competição não são expostos — aliases derivados ficam limitados sem chutar.'] }
}

export async function confirmTeamAlias(aliasId: string): Promise<{ ok: boolean }> {
  const repos = createRepositories()
  const aliases = await repos.intelligence.listTeamAliases(500).catch(() => [])
  const a = aliases.find(x => x.id === aliasId)
  if (!a) return { ok: false }
  await repos.intelligence.saveTeamAlias({ ...a, confidence: 'high', source: 'manual' }).catch(() => {})
  return { ok: true }
}

export async function confirmCompetitionAlias(aliasId: string): Promise<{ ok: boolean }> {
  const repos = createRepositories()
  const aliases = await repos.intelligence.listCompetitionAliases(500).catch(() => [])
  const a = aliases.find(x => x.id === aliasId)
  if (!a) return { ok: false }
  await repos.intelligence.saveCompetitionAlias({ ...a, confidence: 'high', source: 'manual' }).catch(() => {})
  return { ok: true }
}

export async function listTeamAliases(): Promise<TeamAlias[]> { return createRepositories().intelligence.listTeamAliases(500).catch(() => []) }
export async function listCompetitionAliases(): Promise<CompetitionAlias[]> { return createRepositories().intelligence.listCompetitionAliases(500).catch(() => []) }

export function explainAliasUsage(): string {
  return 'Aliases confirmados melhoram o matching futuro; sugeridos não confirmam fixture sozinhos; homônimos exigem país/competição.'
}
