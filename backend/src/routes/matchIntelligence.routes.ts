/**
 * Match Intelligence API (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only GET endpoints (open/honest) + operator-gated POST refresh that respects
 * the provider budget guard. Env-gated by ENABLE_MATCH_INTELLIGENCE. No odds, no
 * Telegram, no auto-bet. Always returns limitations.
 */
import type { FastifyInstance } from 'fastify'
import { env } from '../env.js'
import { ok, badRequest } from '../utils/apiResponse.js'
import { requirePermission } from '../middleware/requirePermission.middleware.js'
import { guardProviderCall } from '../modules/localops/livePipelineGuard.service.js'
import { getProviderCapabilities, buildProviderReliabilityReport } from '../modules/footballIntelligence/providerCapability.service.js'
import { buildTodayMatchScope } from '../modules/footballIntelligence/matchDayScope.service.js'
import { buildMatchIntelligencePackage } from '../modules/footballIntelligence/matchIntelligencePackage.service.js'
import { buildFundamentalReadiness } from '../modules/footballIntelligence/fundamentalReadinessEngine.service.js'
import { buildMatchContext } from '../modules/footballIntelligence/matchContextEngine.service.js'
import { buildTeamMemory } from '../modules/footballIntelligence/teamMemoryEngine.service.js'
import { buildHeadToHead } from '../modules/footballIntelligence/headToHeadIntelligence.service.js'
import { buildSquadAvailability } from '../modules/footballIntelligence/squadAvailabilityEngine.service.js'
import { buildTacticalMatchup } from '../modules/footballIntelligence/tacticalMatchupEngine.service.js'
import { buildDecisionInputs } from '../modules/footballIntelligence/decisionInputLedger.service.js'
import { runAlertDecisionPrecheck } from '../modules/footballIntelligence/alertDecisionPrecheck.service.js'
import { buildPostMatchExplanation } from '../modules/footballIntelligence/postMatchExplanationEngine.service.js'
import { createRepositories } from '../repositories/index.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export async function matchIntelligenceRoutes(app: FastifyInstance) {
  const BASE = '/match-intelligence'
  const op = { preHandler: [requirePermission({ permission: 'run:scan' })] }

  function gate(reply: any): boolean {
    if (!flag(env.ENABLE_MATCH_INTELLIGENCE)) {
      reply.status(403).send({ success: false, error: { message: 'Match Intelligence desabilitado (ENABLE_MATCH_INTELLIGENCE=false).', reason: 'env_gate_disabled' } })
      return false
    }
    return true
  }
  const fid = (req: any) => String((req.params as any).fixtureId)

  app.get(`${BASE}/provider-capabilities`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok({ capabilities: getProviderCapabilities('espn'), reliability: buildProviderReliabilityReport() })
  })

  app.get(`${BASE}/today`, async (req, reply) => {
    if (!gate(reply)) return
    const q = (req.query || {}) as any
    const filters = { onlyLive: flag(q.onlyLive), competitions: q.competitions ? String(q.competitions).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined }
    return ok(await buildTodayMatchScope(new Date(), filters))
  })

  app.get(`${BASE}/fixtures/:fixtureId/package`, async (req, reply) => {
    if (!gate(reply)) return
    const pkg = await buildMatchIntelligencePackage(fid(req))
    return pkg ? ok(pkg) : reply.status(404).send(badRequest('fixture_not_found'))
  })

  app.get(`${BASE}/fixtures/:fixtureId/readiness`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildFundamentalReadiness(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/context`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildMatchContext(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/team-memory`, async (req, reply) => {
    if (!gate(reply)) return
    const repos = createRepositories()
    const fixture = await repos.fixtures.findById(fid(req)).catch(() => null)
    if (!fixture) return reply.status(404).send(badRequest('fixture_not_found'))
    const [home, away] = await Promise.all([buildTeamMemory(fixture.homeName || ''), buildTeamMemory(fixture.awayName || '')])
    return ok({ home, away })
  })

  app.get(`${BASE}/fixtures/:fixtureId/h2h`, async (req, reply) => {
    if (!gate(reply)) return
    const repos = createRepositories()
    const fixture = await repos.fixtures.findById(fid(req)).catch(() => null)
    if (!fixture) return reply.status(404).send(badRequest('fixture_not_found'))
    return ok(await buildHeadToHead(fixture.homeName || '', fixture.awayName || ''))
  })

  app.get(`${BASE}/fixtures/:fixtureId/squad-availability`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildSquadAvailability(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/tactical-matchup`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildTacticalMatchup(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/decision-inputs`, async (req, reply) => {
    if (!gate(reply)) return
    const pkg = await buildMatchIntelligencePackage(fid(req))
    if (!pkg) return reply.status(404).send(badRequest('fixture_not_found'))
    return ok(pkg.decisionInputs)
  })

  app.get(`${BASE}/fixtures/:fixtureId/alert-precheck`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await runAlertDecisionPrecheck(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/post-match-explanation`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildPostMatchExplanation(fid(req)))
  })

  // ── POST refresh (operator+) — respects provider budget; no provider call here
  //    beyond consulting the budget, since ingestion is owned by the live worker. ──
  app.post(`${BASE}/fixtures/:fixtureId/refresh`, op, async (req, reply) => {
    if (!gate(reply)) return
    const budget = guardProviderCall('espn', 'fixture_detail')
    const pkg = await buildMatchIntelligencePackage(fid(req))
    if (!pkg) return reply.status(404).send(badRequest('fixture_not_found'))
    return ok({ package: pkg, providerBudget: { allowed: budget.allowed, blocked: budget.blockedByProviderBudget, reason: budget.reason } })
  })

  app.post(`${BASE}/today/refresh`, op, async (_req, reply) => {
    if (!gate(reply)) return
    const budget = guardProviderCall('espn', 'live_fixtures')
    const scope = await buildTodayMatchScope(new Date())
    return ok({ scope, providerBudget: { allowed: budget.allowed, blocked: budget.blockedByProviderBudget, reason: budget.reason } })
  })
}
