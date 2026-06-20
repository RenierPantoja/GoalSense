/**
 * Local Operations status (Phase B30) — profile + flags + estimate + warnings.
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregates the guardrail state for the operations panel. No secrets. Operational
 * warnings only (never Telegram, never betting alerts).
 */
import { env } from '../../env.js'
import { profileRecommendation, flagMismatches, estimateVolume, type LocalRuntimeProfile, type RiskLevel } from './utils/localOps.util.js'
import { getProviderUsage } from './providerUsageGuard.service.js'
import { getSnapshotGuardStatus } from './snapshotWriteGuard.service.js'
import { listWorkers } from './workerRegistry.service.js'
import { getGuardMetrics } from './livePipelineGuard.service.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function isLocalOperationsPanelEnabled(): boolean { return flag(env.ENABLE_LOCAL_OPERATIONS_PANEL) }

function dangerousFlagState(): Record<string, boolean> {
  return {
    ENABLE_AUTO_ALERT_CREATE: flag(env.ENABLE_AUTO_ALERT_CREATE),
    ENABLE_AUTO_ENGINE_TO_ALERTS: flag(env.ENABLE_AUTO_ENGINE_TO_ALERTS),
    ENABLE_AUTO_ENGINE_WRITE: flag(env.ENABLE_AUTO_ENGINE_WRITE),
    TELEGRAM_ENABLED: flag(env.TELEGRAM_ENABLED),
    ODDS_ENABLED: flag(env.ODDS_ENABLED),
    ENABLE_ALERT_EXPORT: flag(env.ENABLE_ALERT_EXPORT),
    LIVE_WORKER_ENABLED: flag(env.LIVE_WORKER_ENABLED),
    PATTERN_WORKER_ENABLED: flag(env.PATTERN_WORKER_ENABLED),
    RESOLUTION_WORKER_ENABLED: flag(env.RESOLUTION_WORKER_ENABLED),
  }
}

export interface OperationalWarning { code: string; severity: 'info' | 'warning' | 'critical'; message: string }

function buildWarnings(actualFlags: Record<string, boolean>): OperationalWarning[] {
  const w: OperationalWarning[] = []
  const usage = getProviderUsage()
  if (usage.nearLimit) w.push({ code: 'provider_budget_near_limit', severity: 'warning', message: 'Uso de provider próximo do limite por hora.' })
  if (actualFlags.ENABLE_AUTO_ALERT_CREATE) w.push({ code: 'auto_create_on', severity: 'critical', message: 'ENABLE_AUTO_ALERT_CREATE está ON — auto-criação de alertas habilitada.' })
  if (actualFlags.ENABLE_AUTO_ENGINE_TO_ALERTS) w.push({ code: 'auto_to_alerts_on', severity: 'critical', message: 'ENABLE_AUTO_ENGINE_TO_ALERTS está ON.' })
  if (actualFlags.TELEGRAM_ENABLED) w.push({ code: 'telegram_on', severity: 'critical', message: 'TELEGRAM_ENABLED está ON.' })
  if (actualFlags.ENABLE_ALERT_EXPORT && !flag(env.ENABLE_AUTH)) w.push({ code: 'export_without_auth', severity: 'warning', message: 'Export habilitado com auth desligada — proteja antes de expor.' })
  if (actualFlags.ODDS_ENABLED) w.push({ code: 'odds_on', severity: 'warning', message: 'ODDS_ENABLED está ON (fora de escopo desta fase).' })
  // B31: live pipeline guard advisories.
  const gm = getGuardMetrics()
  if (gm.guardMode === 'observe' && (gm.providerGuardEnabled || gm.snapshotGuardEnabled)) {
    w.push({ code: 'guard_observe_only', severity: 'info', message: 'Guards em modo observe: decisões são calculadas e medidas, mas nada é bloqueado.' })
  }
  if (gm.guardMode === 'enforce' && !gm.providerGuardEnabled && !gm.snapshotGuardEnabled) {
    w.push({ code: 'guard_off', severity: 'info', message: 'Modo enforce sem guards habilitados — nenhuma chamada/escrita será bloqueada.' })
  }
  if (gm.recommendedAction) w.push({ code: 'guard_recommendation', severity: 'info', message: gm.recommendedAction })
  if (gm.retentionEnabled && !gm.retentionDryRun) {
    w.push({ code: 'retention_real_mode', severity: 'warning', message: 'Retenção fora de dry-run (mesmo assim não há backend de exclusão; deleted=0).' })
  }
  return w
}

export interface LocalOperationsStatus {
  profile: LocalRuntimeProfile
  profileRecommendation: ReturnType<typeof profileRecommendation>
  flags: Record<string, boolean>
  flagMismatches: string[]
  estimate: ReturnType<typeof estimateVolume>
  riskLevel: RiskLevel
  warnings: OperationalWarning[]
  panelEnabled: boolean
  generatedAt: string
}

export function getLocalOperationsStatus(liveFixtures = 0): LocalOperationsStatus {
  const profile = env.LOCAL_RUNTIME_PROFILE as LocalRuntimeProfile
  const flags = dangerousFlagState()
  const snap = getSnapshotGuardStatus()
  const estimate = estimateVolume({
    liveFixtures: Math.min(liveFixtures, env.LOCAL_MAX_LIVE_FIXTURES),
    intervalSeconds: Math.round(env.LIVE_WORKER_INTERVAL_MS / 1000),
    snapshotsPerFixturePerMatch: snap.limits.maxPerFixturePerMatch,
    providerCallsPerRun: 1 + (flag(env.SUMMARY_ENRICHMENT_ENABLED) ? env.SUMMARY_ENRICHMENT_MAX_FIXTURES : 0),
    writeBudgetPerHour: env.LOCAL_WRITE_BUDGET_PER_HOUR,
    readBudgetPerHour: env.LOCAL_READ_BUDGET_PER_HOUR,
  })
  return {
    profile,
    profileRecommendation: profileRecommendation(profile),
    flags,
    flagMismatches: flagMismatches(profile, flags),
    estimate,
    riskLevel: estimate.riskLevel,
    warnings: buildWarnings(flags),
    panelEnabled: isLocalOperationsPanelEnabled(),
    generatedAt: new Date().toISOString(),
  }
}

export { listWorkers }
