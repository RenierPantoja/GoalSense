/**
 * Pre-Match Data Merge (B41) — consolidate provider + manual WITHOUT lying.
 * ─────────────────────────────────────────────────────────────────────────────
 * Precedence: reliable provider > high-reliability official manual > partial provider >
 * medium manual > low/unknown manual (caution only) > unknown/unavailable. Conflicts
 * are NEVER resolved silently — they become a conflict record flagged
 * requires_operator_review. Manual data keeps its `manual_operator`/source tag.
 */
import { listPreMatchDomainSnapshots, effectiveFreshness } from './preMatchDataStore.service.js'
import { listManualRecordsForFixture } from './manualIntelligenceIntake.service.js'
import type { AcquisitionDomain } from './providers/provider.types.js'
import type { ManualDomain, ManualIntelligenceRecord } from './manualIntelligence.types.js'

const MANUAL_TO_ACQ: Record<ManualDomain, AcquisitionDomain | null> = {
  lineup: 'confirmed_lineups', injury: 'injuries', suspension: 'suspensions', squad: 'squads',
  context: 'competition_context', referee: null, venue: null, competition_stage: 'competition_context', note: null,
}

export type MergeChosenSource = 'provider' | 'manual' | 'none'

export interface DomainMerge {
  domain: AcquisitionDomain
  chosenSource: MergeChosenSource
  chosenSourceLabel: string
  chosenReliability: string
  providerAvailability: string | null
  manualCount: number
  conflict: boolean
  requiresOperatorReview: boolean
  trustedSources: string[]
  weakSources: string[]
  limitations: string[]
}

export interface PreMatchMergeResult {
  fixtureId: string
  domains: DomainMerge[]
  conflicts: Array<{ domain: string; detail: string }>
  trustedSources: string[]
  weakSources: string[]
  requiresReview: boolean
  limitations: string[]
  generatedAt: string
}

const PROVIDER_USABLE = new Set(['available', 'available_empty_confirmed', 'partial'])
const HIGH_MANUAL = new Set(['official_club', 'official_competition'])

export function mergeDomain(domain: AcquisitionDomain, providerSnap: any | null, manual: ManualIntelligenceRecord[]): DomainMerge {
  const trustedSources: string[] = []
  const weakSources: string[] = []
  const limitations: string[] = []
  const providerUsable = providerSnap && PROVIDER_USABLE.has(providerSnap.availability)
  const providerAvailability = providerSnap?.availability ?? null

  const highManual = manual.filter(m => m.reliability === 'high' && HIGH_MANUAL.has(m.sourceType))
  const mediumManual = manual.filter(m => m.reliability === 'medium')
  const lowManual = manual.filter(m => m.reliability === 'low' || m.reliability === 'unknown')

  if (providerUsable) trustedSources.push(`provider:${providerSnap.provider}`)
  for (const m of highManual) trustedSources.push(`manual:${m.sourceType}`)
  for (const m of mediumManual) weakSources.push(`manual:${m.sourceType}`)
  for (const m of lowManual) weakSources.push(`manual:${m.sourceType}(low)`)

  // Conflict: a usable provider AND a high-reliability manual both assert this domain →
  // do not silently choose; require operator review.
  const conflict = providerUsable && highManual.length > 0
  let chosenSource: MergeChosenSource = 'none'
  let chosenSourceLabel = 'nenhuma'
  let chosenReliability = 'unknown'

  if (conflict) {
    chosenSource = 'provider'; chosenSourceLabel = `provider:${providerSnap.provider} (conflito c/ manual)`; chosenReliability = 'requires_review'
    limitations.push('Conflito provider × manual — requer revisão do operador (não resolvido em silêncio).')
  } else if (providerUsable) {
    chosenSource = 'provider'; chosenSourceLabel = `provider:${providerSnap.provider}`; chosenReliability = providerSnap.dataQuality || 'partial'
  } else if (highManual.length > 0) {
    chosenSource = 'manual'; chosenSourceLabel = `manual:${highManual[0].sourceType}`; chosenReliability = 'high'
  } else if (mediumManual.length > 0) {
    chosenSource = 'manual'; chosenSourceLabel = `manual:${mediumManual[0].sourceType}`; chosenReliability = 'medium'
  } else if (lowManual.length > 0) {
    chosenSource = 'manual'; chosenSourceLabel = `manual:${lowManual[0].sourceType} (cautela)`; chosenReliability = 'low'
    limitations.push('Apenas dado manual de baixa confiabilidade — usar como cautela/nota, não conclusão.')
  } else {
    limitations.push(`Sem dado utilizável para ${domain} (provider: ${providerAvailability ?? 'n/d'}).`)
  }

  return {
    domain, chosenSource, chosenSourceLabel, chosenReliability, providerAvailability,
    manualCount: manual.length, conflict, requiresOperatorReview: conflict,
    trustedSources, weakSources, limitations,
  }
}

const MERGE_DOMAINS: AcquisitionDomain[] = ['confirmed_lineups', 'probable_lineups', 'injuries', 'suspensions', 'squads', 'standings', 'head_to_head', 'competition_context']

export async function buildPreMatchMergeReport(fixtureId: string): Promise<PreMatchMergeResult> {
  const [snapshots, manual] = await Promise.all([
    listPreMatchDomainSnapshots(fixtureId, 200).catch(() => []),
    listManualRecordsForFixture(fixtureId, 200).catch(() => [] as ManualIntelligenceRecord[]),
  ])
  const snapByDomain = new Map<string, any>()
  for (const s of snapshots) if (!snapByDomain.has(s.domain) || (s.fetchedAt > snapByDomain.get(s.domain).fetchedAt)) snapByDomain.set(s.domain, s)

  const manualByAcqDomain = new Map<AcquisitionDomain, ManualIntelligenceRecord[]>()
  for (const m of manual) {
    const acq = MANUAL_TO_ACQ[m.domain]
    if (!acq) continue
    const arr = manualByAcqDomain.get(acq) || []
    arr.push(m); manualByAcqDomain.set(acq, arr)
  }

  const domains = MERGE_DOMAINS.map(d => mergeDomain(d, snapByDomain.get(d) ?? null, manualByAcqDomain.get(d) ?? []))
  const conflicts = domains.filter(d => d.conflict).map(d => ({ domain: d.domain, detail: 'provider × manual divergem; revisar.' }))
  const trustedSources = [...new Set(domains.flatMap(d => d.trustedSources))]
  const weakSources = [...new Set(domains.flatMap(d => d.weakSources))]

  return {
    fixtureId, domains, conflicts, trustedSources, weakSources,
    requiresReview: conflicts.length > 0,
    limitations: ['Merge não escolhe silenciosamente em conflito; dado manual mantém sua tag de fonte.'],
    generatedAt: new Date().toISOString(),
  }
}
