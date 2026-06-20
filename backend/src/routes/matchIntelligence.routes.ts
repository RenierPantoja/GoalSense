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
import { recordAdminAudit } from '../modules/audit/adminAudit.service.js'
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
import { runAlertDecisionPrecheckV2 } from '../modules/footballIntelligence/alertDecisionPrecheck.service.js'
import { buildPostMatchExplanation } from '../modules/footballIntelligence/postMatchExplanationEngine.service.js'
import { buildPostMatchExplanationV2 } from '../modules/footballIntelligence/postMatchExplanationEngine.service.js'
import { buildFundamentalReadinessV2 } from '../modules/footballIntelligence/fundamentalReadinessEngine.service.js'
import { buildProviderStackReport } from '../modules/footballIntelligence/providers/providerRegistry.service.js'
import { planAcquisitionForToday, planAcquisitionForFixture } from '../modules/footballIntelligence/preMatchAcquisitionPlanner.service.js'
import { runAcquisitionForToday, runAcquisitionForFixture, refreshLineupWindow, buildAcquisitionReport } from '../modules/footballIntelligence/preMatchAcquisitionRunner.service.js'
import { getLineupWindowStatus } from '../modules/footballIntelligence/lineupWindowEngine.service.js'
import { buildFixturePlayerImportance } from '../modules/footballIntelligence/playerImportance.service.js'
import { buildMatchIntelligencePackageV2 } from '../modules/footballIntelligence/matchIntelligencePackageV2.service.js'
import { buildProviderIntegrationReadiness } from '../modules/footballIntelligence/providerIntegrationReadiness.service.js'
import { buildPreMatchMergeReport } from '../modules/footballIntelligence/preMatchDataMerge.service.js'
import { buildFundamentalReadinessV3 } from '../modules/footballIntelligence/fundamentalReadinessEngine.service.js'
import { runAlertDecisionPrecheckV3 } from '../modules/footballIntelligence/alertDecisionPrecheck.service.js'
import { runAcquisitionForFixtureV2, runAcquisitionForTodayV2 } from '../modules/footballIntelligence/preMatchAcquisitionRunner.service.js'
import { createManualRecord, updateManualRecord, deleteManualRecord, listManualRecordsForFixture, getManualRecord } from '../modules/footballIntelligence/manualIntelligenceIntake.service.js'
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

  // ── B40: multi-provider pre-match acquisition + lineup window + V2 ──
  app.get(`${BASE}/provider-stack`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(buildProviderStackReport())
  })

  app.get(`${BASE}/acquisition/today`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok({ plans: await planAcquisitionForToday(), generatedAt: new Date().toISOString() })
  })

  app.post(`${BASE}/acquisition/today/run`, op, async (req, reply) => {
    if (!gate(reply)) return
    const run = await runAcquisitionForToday()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'pre_match_acquisition', resourceId: run.id, metadata: { scope: 'today', status: run.status } })
    return ok(run)
  })

  app.get(`${BASE}/fixtures/:fixtureId/acquisition`, async (req, reply) => {
    if (!gate(reply)) return
    const id = fid(req)
    return ok({ plan: await planAcquisitionForFixture(id), report: await buildAcquisitionReport(id) })
  })

  app.post(`${BASE}/fixtures/:fixtureId/acquisition/run`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = fid(req)
    const run = await runAcquisitionForFixture(id)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'pre_match_acquisition', resourceId: run.id, metadata: { scope: 'fixture', fixtureId: id, status: run.status } })
    return ok(run)
  })

  app.get(`${BASE}/fixtures/:fixtureId/lineup-window`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await getLineupWindowStatus(fid(req)))
  })

  app.post(`${BASE}/fixtures/:fixtureId/lineup-window/refresh`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = fid(req)
    const run = await refreshLineupWindow(id)
    const window = await getLineupWindowStatus(id)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'pre_match_acquisition', resourceId: id, metadata: { op: 'lineup_refresh' } })
    return ok({ run, window })
  })

  app.get(`${BASE}/fixtures/:fixtureId/player-importance`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildFixturePlayerImportance(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/readiness-v2`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildFundamentalReadinessV2(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/precheck-v2`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await runAlertDecisionPrecheckV2(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/post-match-explanation-v2`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildPostMatchExplanationV2(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/package-v2`, async (req, reply) => {
    if (!gate(reply)) return
    const pkg = await buildMatchIntelligencePackageV2(fid(req))
    return pkg ? ok(pkg) : reply.status(404).send(badRequest('fixture_not_found'))
  })

  // ── B41: real provider integration + manual intake + V3 ──
  const adminOp = { preHandler: [requirePermission({ permission: 'run:scan', dangerous: true })] }

  app.get(`${BASE}/providers/readiness`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(buildProviderIntegrationReadiness())
  })

  app.get(`${BASE}/fixtures/:fixtureId/manual-records`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await listManualRecordsForFixture(fid(req), 200))
  })

  app.post(`${BASE}/fixtures/:fixtureId/manual-records`, op, async (req, reply) => {
    if (!gate(reply)) return
    const b = (req.body || {}) as any
    if (!b.domain || !b.sourceType) return reply.status(400).send(badRequest('domain e sourceType são obrigatórios'))
    const record = await createManualRecord({
      fixtureId: fid(req), teamId: b.teamId ?? null, side: b.side, domain: b.domain, sourceType: b.sourceType,
      sourceLabel: b.sourceLabel || 'operador', sourceUrl: b.sourceUrl ?? null, reliability: b.reliability,
      payload: b.payload ?? {}, note: b.note ?? '', expiresAt: b.expiresAt ?? null, enteredBy: req.auth?.user?.userId ?? null,
    })
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'manual_intelligence', resourceId: record.id, metadata: { domain: b.domain, sourceType: b.sourceType } })
    return ok(record)
  })

  app.patch(`${BASE}/manual-records/:id`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = String((req.params as any).id)
    const res = await updateManualRecord(id, (req.body || {}) as any, req.auth?.user?.userId ?? null)
    if (res.count === 0) return reply.status(404).send(badRequest('manual_record_not_found'))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'manual_intelligence', resourceId: id, metadata: { op: 'update' } })
    return ok(await getManualRecord(id))
  })

  app.delete(`${BASE}/manual-records/:id`, adminOp, async (req, reply) => {
    if (!gate(reply)) return
    const id = String((req.params as any).id)
    const res = await deleteManualRecord(id)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'manual_intelligence', resourceId: id, metadata: { op: 'delete' } })
    return ok({ deleted: res.count > 0 })
  })

  app.get(`${BASE}/fixtures/:fixtureId/merge-report`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildPreMatchMergeReport(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/readiness-v3`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildFundamentalReadinessV3(fid(req)))
  })

  app.get(`${BASE}/fixtures/:fixtureId/precheck-v3`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await runAlertDecisionPrecheckV3(fid(req)))
  })

  app.post(`${BASE}/fixtures/:fixtureId/acquisition/run-v2`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = fid(req)
    const res = await runAcquisitionForFixtureV2(id)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'pre_match_acquisition', resourceId: res.run.id, metadata: { scope: 'fixture_v2', fixtureId: id } })
    return ok(res)
  })

  app.post(`${BASE}/today/acquisition/run-v2`, op, async (req, reply) => {
    if (!gate(reply)) return
    const res = await runAcquisitionForTodayV2()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'pre_match_acquisition', resourceId: res.run.id, metadata: { scope: 'today_v2' } })
    return ok(res)
  })
}
