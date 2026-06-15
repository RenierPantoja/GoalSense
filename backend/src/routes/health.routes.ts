import type { FastifyInstance } from 'fastify'
import { env } from '../env.js'
import { getFirebaseDiagnostics } from '../firebase/admin.js'

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
}
