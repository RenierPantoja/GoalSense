/**
 * Final Backend Health Report (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest technical closing assessment of the local backend. Commercial readiness is
 * NOT a sales guarantee: it cannot be `beta_candidate` without provider configured,
 * Firebase configured AND a real long validation history. Never invents readiness.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { buildProviderCoverageReport } from './providerCoverageReport.service.js'
import type { BackendHealthReport, BackendHealth, LocalRunReadiness, CommercialReadiness } from './localValidation.types.js'

function flag(v: unknown): boolean { return String(v).toLowerCase() === 'true' }

export async function buildBackendHealthReport(): Promise<BackendHealthReport> {
  const repos = createRepositories()
  const firebaseConfigured = String(env.PERSISTENCE_PROVIDER) === 'firebase'
  const providerConfigured = flag(env.ENABLE_PROVIDER_API_FOOTBALL) && !!env.API_FOOTBALL_KEY
  const enforceEnabled = flag(env.ENABLE_ALERT_GOVERNANCE_ENFORCE) && String(env.ALERT_GOVERNANCE_MODE) === 'enforce'
  const coverage = buildProviderCoverageReport()

  let validationRunsObserved = 0
  try { validationRunsObserved = (await repos.intelligence.listLocalValidationRuns(50)).length } catch { /* noop */ }

  const criticalBlockers: string[] = []
  const recommendedFixes: string[] = []
  const warnings: string[] = []

  if (!firebaseConfigured) { warnings.push('PERSISTENCE_PROVIDER≠firebase — memória/governança/causal/validação não persistem (Noop).'); recommendedFixes.push('Configurar Firebase para persistência real.') }
  if (!providerConfigured) { warnings.push('Provider crítico não configurado — dados pré-jogo limitados.'); recommendedFixes.push('Configurar API_FOOTBALL_KEY + ENABLE_PROVIDER_API_FOOTBALL + mappings.') }
  if (coverage.domainsCovered.length === 0) warnings.push('Nenhum domínio crítico coberto por provider (apenas ESPN ao vivo + manual).')

  // Backend health.
  let backendHealth: BackendHealth
  if (criticalBlockers.length > 0) backendHealth = 'blocked'
  else if (!firebaseConfigured && !providerConfigured) backendHealth = 'warning'
  else if (warnings.length > 0) backendHealth = 'good'
  else backendHealth = 'excellent'

  // Local run readiness.
  let localRunReadiness: LocalRunReadiness
  if (criticalBlockers.length > 0) localRunReadiness = 'not_ready'
  else if (warnings.length > 0) localRunReadiness = 'ready_with_warnings'
  else localRunReadiness = 'ready'

  // Commercial readiness — conservative gate.
  let commercialReadiness: CommercialReadiness
  if (!firebaseConfigured || !providerConfigured) commercialReadiness = validationRunsObserved > 0 ? 'internal_alpha' : 'not_ready'
  else if (validationRunsObserved < 5) commercialReadiness = 'internal_alpha'
  else commercialReadiness = 'controlled_beta'
  // beta_candidate is intentionally NOT reachable automatically here.

  return {
    id: `bhr_${Date.now().toString(36)}`,
    backendHealth, localRunReadiness, commercialReadiness,
    firebaseConfigured, providerConfigured, governanceMode: String(env.ALERT_GOVERNANCE_MODE), enforceEnabled,
    validationRunsObserved, criticalBlockers, recommendedFixes, warnings,
    limitations: [
      'Saúde de backend é técnica; commercial readiness não é garantia de venda.',
      'beta_candidate exige provider+Firebase+histórico longo real; não é atingido automaticamente.',
    ],
    generatedAt: new Date().toISOString(),
  }
}

export async function listCriticalBackendBlockers(): Promise<string[]> {
  return (await buildBackendHealthReport()).criticalBlockers
}
export async function listRecommendedFixes(): Promise<string[]> {
  return (await buildBackendHealthReport()).recommendedFixes
}
export async function buildOperationalReadinessReport(): Promise<{ localRunReadiness: LocalRunReadiness; warnings: string[] }> {
  const r = await buildBackendHealthReport()
  return { localRunReadiness: r.localRunReadiness, warnings: r.warnings }
}
export async function buildCommercialReadinessReport(): Promise<{ commercialReadiness: CommercialReadiness; limitations: string[] }> {
  const r = await buildBackendHealthReport()
  return { commercialReadiness: r.commercialReadiness, limitations: r.limitations }
}
