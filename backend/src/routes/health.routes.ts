import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'goalsense-backend',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      env: process.env.APP_ENV || 'unknown',
    }
  })
}
