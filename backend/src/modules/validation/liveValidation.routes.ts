/**
 * Live Validation Sessions API (Phase B37).
 * ─────────────────────────────────────────────────────────────────────────────
 * Env-gated by ENABLE_LIVE_VALIDATION_SESSIONS. GET reads are open/honest;
 * mutating endpoints require operator+. Sessions are observational — they never
 * start workers, change guard mode/env, or alter results.
 */
import type { FastifyInstance } from 'fastify'
import { ok, badRequest } from '../../utils/apiResponse.js'
import { requirePermission } from '../../middleware/requirePermission.middleware.js'
import { recordAdminAudit } from '../audit/adminAudit.service.js'
import { createRepositories } from '../../repositories/index.js'
import {
  isSessionsEnabled, listSessions, getSession, createSession, updateSession,
  startSession, pauseSession, resumeSession, completeSession, cancelSession,
  buildSessionSummary, buildSessionReport,
} from './liveValidation.service.js'

function gate(reply: any): boolean {
  if (!isSessionsEnabled()) {
    reply.status(403).send({ success: false, error: { message: 'Sessões de validação desabilitadas. Defina ENABLE_LIVE_VALIDATION_SESSIONS=true.', reason: 'env_gate_disabled' } })
    return false
  }
  return true
}

export async function liveValidationRoutes(app: FastifyInstance) {
  const BASE = '/validation/live-sessions'
  const repos = createRepositories()
  const op = { preHandler: [requirePermission({ permission: 'run:scan' })] }

  app.get(BASE, async (_req, reply) => { if (!gate(reply)) return; return ok(await listSessions(50)) })

  app.post(BASE, op, async (req, reply) => {
    if (!gate(reply)) return
    const b = (req.body || {}) as any
    if (!b.name || typeof b.name !== 'string') return reply.status(400).send(badRequest('name é obrigatório'))
    const session = await createSession({ name: b.name, description: b.description ?? null, fixtureScope: b.fixtureScope, goals: b.goals, createdBy: req.auth?.user?.userId ?? null })
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'live_validation_session', resourceId: session.id, metadata: { op: 'create' } })
    return ok(session)
  })

  app.get(`${BASE}/:id`, async (req, reply) => { if (!gate(reply)) return; return ok(await getSession((req.params as any).id)) })

  app.patch(`${BASE}/:id`, op, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await updateSession((req.params as any).id, (req.body || {}) as any))
  })

  const lifecycle = (action: string, fn: (id: string) => Promise<any>) =>
    app.post(`${BASE}/:id/${action}`, op, async (req, reply) => {
      if (!gate(reply)) return
      const id = (req.params as any).id
      const res = await fn(id)
      void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'live_validation_session', resourceId: id, metadata: { op: action } })
      return ok(res)
    })

  lifecycle('start', startSession)
  lifecycle('pause', pauseSession)
  lifecycle('resume', resumeSession)
  lifecycle('complete', completeSession)
  lifecycle('cancel', cancelSession)

  app.get(`${BASE}/:id/fixtures`, async (req, reply) => {
    if (!gate(reply)) return
    try { return ok(await repos.intelligence.listLiveValidationSessionFixtures((req.params as any).id, 500)) }
    catch { return ok([]) }
  })

  app.get(`${BASE}/:id/events`, async (req, reply) => {
    if (!gate(reply)) return
    try { return ok(await repos.intelligence.listLiveValidationSessionEvents((req.params as any).id, 1000)) }
    catch { return ok([]) }
  })

  app.get(`${BASE}/:id/summary`, async (req, reply) => {
    if (!gate(reply)) return
    const session = await getSession((req.params as any).id)
    if (!session) return ok(null)
    try { return ok(await buildSessionSummary(session)) }
    catch (e: any) { app.log.warn(`session summary failed: ${e?.message || e}`); return ok(null) }
  })

  app.post(`${BASE}/:id/report`, op, async (req, reply) => {
    if (!gate(reply)) return
    const session = await getSession((req.params as any).id)
    if (!session) return reply.status(404).send(badRequest('session_not_found'))
    const report = await buildSessionReport(session)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'live_validation_report', resourceId: report.id, metadata: { sessionId: session.id, goNoGo: report.goNoGo } })
    return ok(report)
  })

  app.get(`${BASE}/:id/report`, async (req, reply) => {
    if (!gate(reply)) return
    try { return ok(await repos.intelligence.getLiveValidationSessionReport((req.params as any).id)) }
    catch { return ok(null) }
  })
}
