/**
 * System routes (Phase B28) — readiness + admin diagnostics.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /ready: liveness + env/persistence/critical-dependency readiness (503 when
 * a critical dependency is degraded). GET /api/system/diagnostics: admin-only,
 * non-secret operational snapshot. NEVER exposes secrets/tokens/keys.
 */
import type { FastifyInstance } from 'fastify'
import { env } from '../env.js'
import { getFirebaseDiagnostics, getFirebaseReadiness } from '../firebase/admin.js'
import { requirePermission } from '../middleware/requirePermission.middleware.js'
import { getLiveMonitorStatus } from '../workers/liveMonitor.worker.js'
import { getPatternWorkerStatus } from '../workers/patternEvaluation.worker.js'
import { getResolutionWorkerStatus } from '../workers/alertResolution.worker.js'
import { getSchedulerState } from '../modules/intelligence/learning/learningAggregationScheduler.service.js'
import { getAutoEngineSchedulerState } from '../modules/intelligence/autoEngine/autoEngineScheduler.service.js'
import { getAutoEngineLearningSchedulerState } from '../modules/intelligence/autoEngine/autoEngineLearningScheduler.service.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function buildVersion(): string {
  return env.BUILD_VERSION || process.env.GIT_COMMIT || '0.1.0'
}

function featureFlags() {
  return {
    auth: flag(env.ENABLE_AUTH),
    rateLimit: flag(env.ENABLE_RATE_LIMIT),
    backtestApi: flag(env.ENABLE_BACKTEST_API),
    alertExport: flag(env.ENABLE_ALERT_EXPORT),
    autoEngine: flag(env.ENABLE_AUTO_ENGINE),
    autoEngineWrite: flag(env.ENABLE_AUTO_ENGINE_WRITE),
    autoAlertPolicy: flag(env.ENABLE_AUTO_ALERT_POLICY),
    autoAlertCreate: flag(env.ENABLE_AUTO_ALERT_CREATE),
    autoEngineToAlerts: flag(env.ENABLE_AUTO_ENGINE_TO_ALERTS),
    manualPromotion: flag(env.ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION),
    promotedAlertManualResolve: flag(env.ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE),
    telegram: flag(env.TELEGRAM_ENABLED),
    odds: flag(env.ODDS_ENABLED),
  }
}

function workersSnapshot() {
  return {
    liveMonitor: safe(getLiveMonitorStatus),
    patternEvaluation: safe(getPatternWorkerStatus),
    alertResolution: safe(getResolutionWorkerStatus),
    learningScheduler: safe(getSchedulerState),
    autoEngineScheduler: safe(getAutoEngineSchedulerState),
    autoEngineLearningScheduler: safe(getAutoEngineLearningSchedulerState),
  }
}
function safe<T>(fn: () => T): T | { error: string } {
  try { return fn() } catch (e: any) { return { error: String(e?.message || e).slice(0, 80) } }
}

export async function systemRoutes(app: FastifyInstance) {
  // Liveness + readiness (public; no secrets).
  app.get('/ready', async (_req, reply) => {
    const fb = await getFirebaseReadiness()
    const persistence = env.PERSISTENCE_PROVIDER
    const criticalOk = persistence === 'firebase' ? (fb.configured && fb.initialized) : true
    const ready = criticalOk
    const body = {
      ready,
      appEnv: env.APP_ENV,
      persistenceProvider: persistence,
      firebase: { configured: fb.configured, initialized: fb.initialized, error: fb.error },
      authEnabled: flag(env.ENABLE_AUTH),
      criticalFlags: {
        autoAlertCreate: flag(env.ENABLE_AUTO_ALERT_CREATE),
        autoEngineWrite: flag(env.ENABLE_AUTO_ENGINE_WRITE),
        telegram: flag(env.TELEGRAM_ENABLED),
      },
      timestamp: new Date().toISOString(),
    }
    return reply.status(ready ? 200 : 503).send(body)
  })

  // Admin-only operational snapshot (no secrets). Dangerous → admin/owner required.
  app.get('/system/diagnostics', { preHandler: [requirePermission({ permission: 'flags:manage', dangerous: true })] }, async () => {
    const fb = getFirebaseDiagnostics()
    return {
      success: true,
      data: {
        appEnv: env.APP_ENV,
        nodeEnv: process.env.NODE_ENV || 'unknown',
        buildVersion: buildVersion(),
        persistenceProvider: env.PERSISTENCE_PROVIDER,
        firebase: { configured: fb.configured, projectId: fb.projectId }, // projectId masked
        publicBackendUrl: env.PUBLIC_BACKEND_URL || null,
        corsOrigins: (env.CORS_ALLOWED_ORIGINS || env.CORS_ORIGIN).split(',').map(s => s.trim()).filter(Boolean),
        featureFlags: featureFlags(),
        workers: workersSnapshot(),
        uptimeSeconds: Math.round(process.uptime()),
        generatedAt: new Date().toISOString(),
      },
    }
  })
}
