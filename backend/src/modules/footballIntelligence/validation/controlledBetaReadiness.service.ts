/**
 * Controlled-Beta Readiness (B50).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest, conservative gate toward a controlled beta. Inviolable: without a real
 * provider configured it cannot pass `internal_alpha`; without accumulated real
 * validation it cannot be `controlled_beta_possible`; without persistent Firebase it
 * cannot be `controlled_beta_possible`; enforce ON without validation → `blocked`;
 * Telegram ON → warning/block. Never a promise of accuracy.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import type { ControlledBetaReadinessReport, ControlledBetaStatus } from './validationCampaign.types.js'

function flag(v: unknown): boolean { return String(v).toLowerCase() === 'true' }

export interface ControlledBetaInputs {
  firebaseConfigured: boolean
  providerConfigured: boolean
  enforceOn: boolean
  telegramOn: boolean
  dailyReports: number
}

/** PURE conservative status classifier — testable without network. */
export function classifyControlledBeta(i: ControlledBetaInputs): ControlledBetaStatus {
  if (i.enforceOn && i.dailyReports < 7) return 'blocked'
  if (!i.firebaseConfigured || !i.providerConfigured) return i.dailyReports > 0 ? 'internal_alpha' : 'not_ready'
  if (i.dailyReports < 7) return 'internal_alpha'
  return 'controlled_beta_possible'
}

export async function buildControlledBetaReadiness(): Promise<ControlledBetaReadinessReport> {
  const repos = createRepositories()
  const firebaseConfigured = String(env.PERSISTENCE_PROVIDER) === 'firebase'
  const providerConfigured = flag(env.ENABLE_PROVIDER_API_FOOTBALL) && !!env.API_FOOTBALL_KEY
  const enforceOn = flag(env.ENABLE_ALERT_GOVERNANCE_ENFORCE) && String(env.ALERT_GOVERNANCE_MODE) === 'enforce'
  const telegramOn = flag(env.TELEGRAM_ENABLED)

  let dailyReports = 0
  try { dailyReports = (await repos.intelligence.listDailyValidationReports(30)).length } catch { /* noop */ }

  const reasons: string[] = []
  const hardBlockers: string[] = []
  const softBlockers: string[] = []
  const providerRequirements: string[] = []
  const validationRequirements: string[] = []
  const operationalRequirements: string[] = []
  const securityRequirements: string[] = []
  const nextActions: string[] = []

  if (!firebaseConfigured) { hardBlockers.push('Firebase não configurado — sem persistência real.'); operationalRequirements.push('Configurar PERSISTENCE_PROVIDER=firebase com credenciais válidas.') }
  if (!providerConfigured) { hardBlockers.push('Provider real não configurado — dados críticos limitados.'); providerRequirements.push('Configurar API_FOOTBALL_KEY + ENABLE_PROVIDER_API_FOOTBALL + mappings confirmados.') }
  if (dailyReports < 7) { softBlockers.push(`Apenas ${dailyReports} relatório(s) diário(s) — validação real insuficiente (mín. 7–14).`); validationRequirements.push('Rodar 7–14 dias reais de validação e acumular daily reports.') }
  if (enforceOn && dailyReports < 7) { hardBlockers.push('Enforce ligado sem validação suficiente.'); securityRequirements.push('Manter ENABLE_ALERT_GOVERNANCE_ENFORCE=false até validação madura.') }
  if (telegramOn) { softBlockers.push('Telegram ligado nesta fase — fora de escopo da validação local.'); securityRequirements.push('Manter TELEGRAM_ENABLED=false durante validação.') }

  // Status decision — conservative (delegates to the pure classifier).
  const status: ControlledBetaStatus = classifyControlledBeta({ firebaseConfigured, providerConfigured, enforceOn, telegramOn, dailyReports })

  if (status !== 'controlled_beta_possible') nextActions.push('Resolver bloqueadores acima antes de qualquer beta.')
  reasons.push('controlled_beta_possible exige provider + Firebase + validação real acumulada; não é garantia comercial.')

  return {
    status, reasons, hardBlockers, softBlockers, providerRequirements, validationRequirements, operationalRequirements, securityRequirements,
    nextActions: nextActions.length ? nextActions : ['Continuar validação diária e revisar sugestões de calibração (sem aplicar).'],
    limitations: ['Readiness é técnico, não garantia comercial; métrica não é promessa de acerto.'],
    generatedAt: new Date().toISOString(),
  }
}
