/**
 * Match Intelligence Package V3 (B44).
 * ─────────────────────────────────────────────────────────────────────────────
 * Composes the V2 package with the critical-domain matrix, readiness V5, precheck V5,
 * the provider endpoint catalog and the next best data action. Read-only; never
 * fetches a provider; nothing invented.
 */
import { buildMatchIntelligencePackageV2, type MatchIntelligencePackageV2 } from './matchIntelligencePackageV2.service.js'
import { getAllDomainUnlockStatuses } from './identity/providerBridge.service.js'
import { buildFundamentalReadinessV5, type FundamentalReadinessV5 } from './fundamentalReadinessEngine.service.js'
import { runAlertDecisionPrecheckV5, type AlertDecisionPrecheckV5Result } from './alertDecisionPrecheck.service.js'
import { listProviderEndpointCatalog } from './providers/providerEndpointCatalog.service.js'
import type { DomainUnlockStatus } from './identity/providerIdentity.types.js'

export interface MatchIntelligencePackageV3 {
  base: MatchIntelligencePackageV2 | null
  criticalDomainMatrix: DomainUnlockStatus[]
  readinessV5: FundamentalReadinessV5 | null
  precheckV5: AlertDecisionPrecheckV5Result | null
  providerEndpointCatalogSummary: { provider: string; domain: string; safetyStatus: string }[]
  realProviderDataAvailable: boolean
  manualDataUsed: boolean
  domainsNeedingOperatorAction: string[]
  nextBestDataAction: string
  limitations: string[]
}

export async function buildMatchIntelligencePackageV3(fixtureId: string): Promise<MatchIntelligencePackageV3 | null> {
  const [base, matrix, readinessV5, precheckV5] = await Promise.all([
    buildMatchIntelligencePackageV2(fixtureId).catch(() => null),
    getAllDomainUnlockStatuses(fixtureId, 'api_football').catch(() => [] as DomainUnlockStatus[]),
    buildFundamentalReadinessV5(fixtureId).catch(() => null),
    runAlertDecisionPrecheckV5(fixtureId).catch(() => null),
  ])
  if (!base && matrix.length === 0) return null

  const realProviderDataAvailable = (readinessV5?.fetchedCriticalDomains.length ?? 0) > 0
  const manualDataUsed = (readinessV5?.manualCriticalDomains.length ?? 0) > 0
  const domainsNeedingOperatorAction = matrix.filter(m => m.recommendedNextAction && !['ready_to_fetch', 'stay_out'].includes(m.recommendedNextAction)).map(m => `${m.domain}: ${m.recommendedNextAction}`)

  // Pick the single most impactful next action across the matrix.
  const priority = ['configure_provider', 'run_fixture_mapping', 'run_entity_mapping', 'confirm_mapping', 'use_manual_intake', 'provide_endpoint_docs']
  let nextBestDataAction = 'none'
  for (const p of priority) { if (matrix.some(m => m.recommendedNextAction === p)) { nextBestDataAction = p; break } }

  return {
    base, criticalDomainMatrix: matrix, readinessV5, precheckV5,
    providerEndpointCatalogSummary: listProviderEndpointCatalog().map(c => ({ provider: c.provider, domain: c.domain, safetyStatus: c.safetyStatus })),
    realProviderDataAvailable, manualDataUsed, domainsNeedingOperatorAction, nextBestDataAction,
    limitations: ['Pacote V3: visão consolidada de domínios críticos; read-only; sem fetch; nada inventado.'],
  }
}
