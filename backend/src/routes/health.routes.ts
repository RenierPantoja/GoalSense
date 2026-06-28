import type { FastifyInstance } from 'fastify'
import { env } from '../env.js'
import { getFirebaseDiagnostics } from '../firebase/admin.js'
import {
  detectRuntimeEnvironment,
  explainRuntimeGuardDecision,
  isPersistentWorkerAllowed,
  isReadOnlyControlPlane,
} from '../modules/runtime/runtimeEnvironmentGuard.service.js'
import {
  getControlPlaneDashboardSummary,
  getControlPlaneReadiness,
} from '../modules/runtime/workerControlPlaneReadModel.service.js'
import { buildFirebaseEnvSafeSummary } from '../modules/runtime/firebaseControlPlaneEnv.service.js'
import { buildControlPlaneFirebaseReadReport } from '../modules/runtime/firebaseControlPlaneReadDiagnostic.service.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const fb = getFirebaseDiagnostics()
    return {
      status: 'ok',
      service: 'goalsense-backend',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      env: process.env.APP_ENV || 'unknown',
      // Persistence diagnostics (no secrets exposed)
      persistenceProvider: env.PERSISTENCE_PROVIDER,
      databaseUrlConfigured: !!env.DATABASE_URL,
      firebaseConfigured: fb.configured,
      firebaseProjectId: fb.projectId, // masked, e.g. "goal***892"
    }
  })

  app.get('/runtime', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0')
    const environment = detectRuntimeEnvironment()
    return {
      ok: true,
      environment,
      isPersistentWorkerAllowed: isPersistentWorkerAllowed(),
      isReadOnlyControlPlane: isReadOnlyControlPlane(),
      decisions: {
        startWorker: explainRuntimeGuardDecision('start_worker'),
        readStatus: explainRuntimeGuardDecision('read_status'),
      },
      firebaseEnv: buildFirebaseEnvSafeSummary(),
      limitations: isReadOnlyControlPlane()
        ? ['This runtime is a read-only control plane for persistent worker operations.']
        : ['Persistent worker commands require local_worker runtime and safety flags.'],
      timestamp: new Date().toISOString(),
    }
  })

  app.get('/worker-control-plane/status', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0')
    return getControlPlaneDashboardSummary()
  })

  app.get('/worker-control-plane/readiness', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0')
    return getControlPlaneReadiness()
  })

  app.get('/worker-control-plane/firebase-env', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0')
    return {
      ok: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      data: buildFirebaseEnvSafeSummary(),
    }
  })

  app.get('/worker-control-plane/firebase-read-diagnostic', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0')
    return {
      ok: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      data: await buildControlPlaneFirebaseReadReport(),
    }
  })
}
