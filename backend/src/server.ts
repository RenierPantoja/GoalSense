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
import { backtestRoutes } from './modules/intelligence/backtest.routes.js'
import { autoEngineRoutes } from './modules/intelligence/autoEngine.routes.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { systemRoutes } from './routes/system.routes.js'
import { localOperationsRoutes } from './modules/localops/localOperations.routes.js'
import { registerAuthMiddleware } from './middleware/auth.middleware.js'
import { startLiveMonitorWorker } from './workers/liveMonitor.worker.js'
import { startPatternEvaluationWorker } from './workers/patternEvaluation.worker.js'
import { startAlertResolutionWorker } from './workers/alertResolution.worker.js'
import { startLearningAggregationScheduler } from './modules/intelligence/learning/learningAggregationScheduler.service.js'
import { startAutoEngineScheduler } from './modules/intelligence/autoEngine/autoEngineScheduler.service.js'
import { startAutoEngineLearningScheduler } from './modules/intelligence/autoEngine/autoEngineLearningScheduler.service.js'

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

// CORS — allow the configured frontend origins to call this backend WITH the
// Authorization header (required for B27 Bearer-token auth). Prefer the explicit
// CORS_ALLOWED_ORIGINS list, falling back to the legacy CORS_ORIGIN. No wildcard.
const corsOrigins = (env.CORS_ALLOWED_ORIGINS || env.CORS_ORIGIN)
  .split(',').map(s => s.trim()).filter(Boolean)
await app.register(cors, {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

// Auth: attach request.auth to every request (anonymous/local-dev/real). Must run
// after CORS so preflight is unaffected, before route handlers/guards.
registerAuthMiddleware(app)

// Routes
app.register(healthRoutes, { prefix: '/api' })
app.register(authRoutes, { prefix: '/api' })
app.register(patternRoutes, { prefix: '/api' })
app.register(alertRoutes, { prefix: '/api' })
app.register(performanceRoutes, { prefix: '/api' })
app.register(liveMonitorRoutes, { prefix: '/api' })
app.register(commandWorkerRoutes, { prefix: '/api' })
app.register(telegramRoutes, { prefix: '/api' })
app.register(oddsRoutes, { prefix: '/api' })
app.register(intelligenceRoutes, { prefix: '/api' })
app.register(learningRoutes, { prefix: '/api' })
app.register(backtestRoutes, { prefix: '/api' })
app.register(autoEngineRoutes, { prefix: '/api' })
app.register(systemRoutes, { prefix: '/api' })
app.register(localOperationsRoutes, { prefix: '/api' })

// Root-level liveness/readiness aliases for cloud platform probes (no secrets).
app.get('/health', async () => ({ status: 'ok', service: 'goalsense-backend', appEnv: env.APP_ENV, uptime: process.uptime(), timestamp: new Date().toISOString() }))
app.get('/ready', async (_req, reply) => reply.redirect('/api/ready'))

// Start
const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    console.log(`[GoalSense Backend] Running on port ${env.PORT} (${env.APP_ENV})`)
    // Startup flag summary (no secrets) — helps verify a safe cloud deploy.
    const onOff = (v: unknown) => (String(v).toLowerCase() === 'true' ? 'ON' : 'off')
    console.log('[GoalSense Backend] flags:'
      + ` auth=${onOff(env.ENABLE_AUTH)} rateLimit=${onOff(env.ENABLE_RATE_LIMIT)}`
      + ` autoEngine=${onOff(env.ENABLE_AUTO_ENGINE)} autoEngineWrite=${onOff(env.ENABLE_AUTO_ENGINE_WRITE)}`
      + ` autoAlertPolicy=${onOff(env.ENABLE_AUTO_ALERT_POLICY)} autoAlertCreate=${onOff(env.ENABLE_AUTO_ALERT_CREATE)}`
      + ` backtestApi=${onOff(env.ENABLE_BACKTEST_API)} alertExport=${onOff(env.ENABLE_ALERT_EXPORT)}`
      + ` telegram=${onOff(env.TELEGRAM_ENABLED)} persistence=${env.PERSISTENCE_PROVIDER}`)
    // Workers/schedulers — each respects its own env flag and never breaks startup.
    startLiveMonitorWorker()
    startPatternEvaluationWorker()
    startAlertResolutionWorker()
    startLearningAggregationScheduler()
    startAutoEngineScheduler()
    startAutoEngineLearningScheduler()
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

// Graceful shutdown for containers/cloud (SIGTERM/SIGINT). Closes the server so
// in-flight requests can finish; never throws on the way out.
let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[GoalSense Backend] ${signal} received — shutting down gracefully…`)
  try { await app.close() } catch (e) { app.log.error(e) }
  process.exit(0)
}
process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })

start()
