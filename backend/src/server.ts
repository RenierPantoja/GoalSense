/**
 * GoalSense Backend — Fastify server foundation.
 * Provides API for patterns, alerts, performance, and live monitoring.
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './env.js'
import { healthRoutes } from './routes/health.routes.js'
import { patternRoutes } from './modules/patterns/patterns.routes.js'
import { alertRoutes } from './modules/alerts/alerts.routes.js'
import { performanceRoutes } from './modules/performance/performance.routes.js'
import { liveMonitorRoutes } from './modules/live/liveMonitor.routes.js'
import { commandWorkerRoutes } from './modules/command/commandWorker.routes.js'
import { telegramRoutes } from './modules/telegram/telegram.routes.js'
import { oddsRoutes } from './modules/odds/odds.routes.js'
import { intelligenceRoutes } from './modules/intelligence/intelligence.routes.js'
import { learningRoutes } from './modules/intelligence/learning.routes.js'
import { startLiveMonitorWorker } from './workers/liveMonitor.worker.js'
import { startPatternEvaluationWorker } from './workers/patternEvaluation.worker.js'
import { startAlertResolutionWorker } from './workers/alertResolution.worker.js'

const app = Fastify({ logger: true })

// Private Network Access: allow an HTTPS public site (e.g. the Vercel frontend)
// to reach this local/loopback backend. Chrome sends the request header
// `Access-Control-Request-Private-Network: true` on preflight and requires the
// matching response header. Registered before CORS so the header is present on
// the preflight reply.
app.addHook('onRequest', async (req, reply) => {
  if (req.headers['access-control-request-private-network']) {
    reply.header('Access-Control-Allow-Private-Network', 'true')
  }
})

// CORS
await app.register(cors, {
  origin: env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
})

// Routes
app.register(healthRoutes, { prefix: '/api' })
app.register(patternRoutes, { prefix: '/api' })
app.register(alertRoutes, { prefix: '/api' })
app.register(performanceRoutes, { prefix: '/api' })
app.register(liveMonitorRoutes, { prefix: '/api' })
app.register(commandWorkerRoutes, { prefix: '/api' })
app.register(telegramRoutes, { prefix: '/api' })
app.register(oddsRoutes, { prefix: '/api' })
app.register(intelligenceRoutes, { prefix: '/api' })
app.register(learningRoutes, { prefix: '/api' })

// Start
const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    console.log(`[GoalSense Backend] Running on port ${env.PORT} (${env.APP_ENV})`)
    // Start live monitor worker (only if enabled via env)
    startLiveMonitorWorker()
    // Start pattern evaluation worker (only if enabled via env)
    startPatternEvaluationWorker()
    // Start alert resolution worker (only if enabled via env)
    startAlertResolutionWorker()
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
