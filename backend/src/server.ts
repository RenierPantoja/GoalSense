/**
 * GoalSense Backend — Fastify server foundation.
 * Provides API for patterns, alerts, performance, and live monitoring.
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './env.js'
import { healthRoutes } from './routes/health.routes.js'

const app = Fastify({ logger: true })

// CORS
await app.register(cors, {
  origin: env.CORS_ORIGIN.split(',').map(s => s.trim()),
})

// Routes
app.register(healthRoutes, { prefix: '/api' })

// Start
const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    console.log(`[GoalSense Backend] Running on port ${env.PORT} (${env.APP_ENV})`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
