/**
 * Provider / Domain Coverage Report (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Tells the operator what is missing to improve data: domains covered, blocked by env,
 * blocked by mapping, blocked by missing docs, filled manually, stale, or
 * provider_not_supported. Read-only; no provider calls. Honest about limitations.
 */
import { buildProviderStackReport } from '../providers/providerRegistry.service.js'
import { listProviderEndpointCatalog } from '../providers/providerEndpointCatalog.service.js'

export interface ProviderCoverageReport {
  configuredProviders: string[]
  unconfiguredProviders: string[]
  domainsCovered: string[]
  domainsBlockedByEnv: string[]
  domainsBlockedByDocs: string[]
  domainsProviderNotSupported: string[]
  limitations: string[]
  generatedAt: string
}

export function buildProviderCoverageReport(): ProviderCoverageReport {
  const stack = buildProviderStackReport()
  const catalog = listProviderEndpointCatalog()

  const domainsCovered: string[] = []
  const domainsBlockedByEnv: string[] = []
  for (const [domain, info] of Object.entries(stack.domainCoverage || {})) {
    if ((info as any)?.bestProvider) domainsCovered.push(domain)
    else domainsBlockedByEnv.push(domain)
  }
  const domainsBlockedByDocs = [...new Set(catalog.filter(c => c.safetyStatus === 'blocked_not_documented').map(c => c.domain))]
  const domainsProviderNotSupported = [...new Set(catalog.filter(c => c.safetyStatus === 'not_implemented').map(c => c.domain))]

  return {
    configuredProviders: stack.configured ?? [],
    unconfiguredProviders: stack.unconfigured ?? [],
    domainsCovered, domainsBlockedByEnv, domainsBlockedByDocs, domainsProviderNotSupported,
    limitations: [
      'Cobertura reflete configuração/documentação; não chama provider.',
      'Bloqueado por env/mapping/docs ≠ falha — é limitação operacional/capacidade/identidade.',
    ],
    generatedAt: new Date().toISOString(),
  }
}
