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
import { buildCandidatesForToday, buildCandidatesForFixture, resolveFixtureIdentity, getBestMappingForFixture, confirmMapping, rejectMapping } from '../modules/footballIntelligence/identity/fixtureIdentityResolution.service.js'
import { listTeamAliases, listCompetitionAliases } from '../modules/footballIntelligence/identity/teamCompetitionAlias.service.js'
import { deriveEntityMappings } from '../modules/footballIntelligence/identity/providerEntityMappingDerivation.service.js'
import { confirmTeamMapping, rejectTeamMapping, confirmCompetitionMapping, rejectCompetitionMapping, listTeamMappings, listCompetitionMappings } from '../modules/footballIntelligence/identity/providerEntityMappingReview.service.js'
import { getDomainUnlockStatus } from '../modules/footballIntelligence/identity/providerBridge.service.js'
import { getAllDomainUnlockStatuses, getDomainUnlockStatusV2 } from '../modules/footballIntelligence/identity/providerBridge.service.js'
import { listProviderEndpointCatalog } from '../modules/footballIntelligence/providers/providerEndpointCatalog.service.js'
import { runAcquisitionForFixtureV3, runAcquisitionForTodayV3, buildAcquisitionReportV3, runDomainAcquisition, runCriticalDomainAcquisitionForFixture, runCriticalDomainAcquisitionForToday, buildCriticalDomainAcquisitionReport } from '../modules/footballIntelligence/preMatchAcquisitionRunner.service.js'
import { buildFundamentalReadinessV5 } from '../modules/footballIntelligence/fundamentalReadinessEngine.service.js'
import { runAlertDecisionPrecheckV5 } from '../modules/footballIntelligence/alertDecisionPrecheck.service.js'
import { buildPostMatchExplanationV3 } from '../modules/footballIntelligence/postMatchExplanationEngine.service.js'
import { buildMatchIntelligencePackageV3 } from '../modules/footballIntelligence/matchIntelligencePackageV3.service.js'
import { buildMatchIntelligencePackageV4 } from '../modules/footballIntelligence/matchIntelligencePackageV4.service.js'
import { buildFundamentalReadinessV6 } from '../modules/footballIntelligence/fundamentalReadinessEngine.service.js'
import { runAlertDecisionPrecheckV6 } from '../modules/footballIntelligence/alertDecisionPrecheck.service.js'
import { buildPostMatchExplanationV4 } from '../modules/footballIntelligence/postMatchExplanationEngine.service.js'
import { buildTeamFundamentalMemory } from '../modules/footballIntelligence/memory/teamFundamentalMemory.service.js'
import { buildMatchupMemoryForFixture } from '../modules/footballIntelligence/memory/matchupFundamentalMemory.service.js'
import { getPatternMemoryForFixture } from '../modules/footballIntelligence/memory/contextualPatternMemory.service.js'
import { detectTabooCandidatesForFixture } from '../modules/footballIntelligence/memory/tabooIntelligence.service.js'
import { findSimilarPreMatchScenarios } from '../modules/footballIntelligence/memory/similarScenarioRetrieval.service.js'
import {
  buildMemoryForFixture, buildMemoryForTeam, buildMemoryForToday,
  isHistoricalMemoryBuildEnabled,
} from '../modules/footballIntelligence/memory/historicalMemoryBuildRunner.service.js'
import { createRepositories } from '../repositories/index.js'
import { buildMatchIntelligencePackageV5 } from '../modules/footballIntelligence/matchIntelligencePackageV5.service.js'
import { buildFundamentalReadinessV7 } from '../modules/footballIntelligence/fundamentalReadinessEngine.service.js'
import { runAlertDecisionPrecheckV7 } from '../modules/footballIntelligence/alertDecisionPrecheck.service.js'
import { buildPostMatchExplanationV5 } from '../modules/footballIntelligence/postMatchExplanationEngine.service.js'
import {
  composeInfluence, buildFixtureInfluence, buildPatternInfluence,
  listInfluenceBuildRuns, isInfluenceEngineEnabled,
} from '../modules/footballIntelligence/influence/influenceLedger.service.js'
import {
  evaluateAlertCandidate, isGovernanceEnabled, explainGovernanceDecision,
} from '../modules/footballIntelligence/governance/alertDecisionGovernor.service.js'
import { getGovernanceMode, getDefaultPolicy } from '../modules/footballIntelligence/governance/alertGovernancePolicy.service.js'
import { listActiveHoldsForFixture, resolveHold, expireOldHolds } from '../modules/footballIntelligence/governance/alertGovernanceHold.service.js'
import { handleLiveTrigger } from '../modules/footballIntelligence/governance/liveGovernanceReevaluation.service.js'
import { buildPostMatchExplanationV6 } from '../modules/footballIntelligence/postMatchExplanationEngine.service.js'
import { buildPostMatchExplanationV7 } from '../modules/footballIntelligence/postMatchExplanationEngine.service.js'
import type { AlertGovernanceRecheckTrigger } from '../modules/footballIntelligence/governance/alertDecisionGovernance.types.js'
import {
  runCausalLearningForFixture, runCausalLearningForToday, runCausalLearningForAlert,
  runCausalLearningForGovernanceResult, listCausalLearningRuns, isCausalLearningEnabled,
} from '../modules/footballIntelligence/causal/causalLearningRunner.service.js'
import {
  buildGovernanceCalibrationReport, listGovernanceCalibrationSuggestions, listInfluenceCalibrationSuggestions,
  markSuggestionReviewed, rejectSuggestion, acceptSuggestionForFutureImplementation,
} from '../modules/footballIntelligence/causal/governanceCalibrationReview.service.js'
import { buildTodayValidationPlan, isLocalValidationEnabled } from '../modules/footballIntelligence/validation/localValidationPlan.service.js'
import { runValidationForToday, runValidationForFixture, cancelValidationRun, getValidationRun, listValidationRuns } from '../modules/footballIntelligence/validation/localValidationRunner.service.js'
import { buildProviderCoverageReport } from '../modules/footballIntelligence/validation/providerCoverageReport.service.js'
import { buildBackendHealthReport } from '../modules/footballIntelligence/validation/localBackendHealthReport.service.js'
import { repairLinksForFixture, repairLinksForToday } from '../modules/footballIntelligence/validation/decisionOutcomeLinkRepair.service.js'
import { generateDailyValidationReport, getDailyValidationReport, listDailyValidationReports } from '../modules/footballIntelligence/validation/dailyValidationReport.service.js'
import { createValidationCampaign, listCampaigns, getCampaign, closeCampaign, attachDailyReport } from '../modules/footballIntelligence/validation/validationCampaign.service.js'
import { buildControlledBetaReadiness } from '../modules/footballIntelligence/validation/controlledBetaReadiness.service.js'
import {
  startWorkerRun, stopWorkerRun, resumeWorkerRun, getActiveWorkerStatus,
  buildWorkerRunSummary,
} from '../modules/footballIntelligence/live/espnLiveFirstPersistentWorker.service.js'
import { runRecoverySweep } from '../modules/footballIntelligence/live/espnLiveFirstRecovery.service.js'
import { runPostMatchSweeper } from '../modules/footballIntelligence/live/espnLiveFirstPostMatchSweeper.service.js'

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

  // ── B42: cross-provider identity resolution ──
  app.get(`${BASE}/identity/resolution-runs`, async (_req, reply) => {
    if (!gate(reply)) return
    try { return ok(await createRepositories().intelligence.listFixtureIdentityResolutionRuns(50)) } catch { return ok([]) }
  })
  app.get(`${BASE}/identity/resolution-runs/:id`, async (req, reply) => {
    if (!gate(reply)) return
    try { return ok(await createRepositories().intelligence.getFixtureIdentityResolutionRun(String((req.params as any).id))) } catch { return ok(null) }
  })
  app.post(`${BASE}/identity/resolve/today`, op, async (req, reply) => {
    if (!gate(reply)) return
    const run = await buildCandidatesForToday()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'identity_resolution', resourceId: run.id, metadata: { scope: 'today', status: run.status } })
    return ok(run)
  })
  app.post(`${BASE}/identity/resolve/fixtures/:fixtureId`, op, async (req, reply) => {
    if (!gate(reply)) return
    const res = await resolveFixtureIdentity(fid(req))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'identity_resolution', resourceId: fid(req), metadata: { status: res.status } })
    return ok(res)
  })
  app.get(`${BASE}/identity/fixtures/:fixtureId/candidates`, async (req, reply) => {
    if (!gate(reply)) return
    try { return ok(await buildCandidatesForFixture(fid(req))) } catch { return ok([]) }
  })
  app.get(`${BASE}/identity/fixtures/:fixtureId/mapping`, async (req, reply) => {
    if (!gate(reply)) return
    try { return ok(await getBestMappingForFixture(fid(req))) } catch { return ok(null) }
  })
  app.post(`${BASE}/identity/mappings/:mappingId/confirm`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = String((req.params as any).mappingId)
    const res = await confirmMapping(id, req.auth?.user?.userId ?? null)
    if (!res.ok) return reply.status(404).send(badRequest('mapping_not_found'))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'identity_mapping', resourceId: id, metadata: { op: 'confirm' } })
    return ok(res)
  })
  app.post(`${BASE}/identity/mappings/:mappingId/reject`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = String((req.params as any).mappingId)
    const res = await rejectMapping(id, req.auth?.user?.userId ?? null)
    if (!res.ok) return reply.status(404).send(badRequest('mapping_not_found'))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'identity_mapping', resourceId: id, metadata: { op: 'reject' } })
    return ok(res)
  })
  app.get(`${BASE}/identity/aliases/teams`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(await listTeamAliases())
  })
  app.get(`${BASE}/identity/aliases/competitions`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(await listCompetitionAliases())
  })

  // ── B43: entity mappings (team/competition/season) + domain unlock + acquisition V3 ──
  app.get(`${BASE}/identity/entity-mappings/teams`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(await listTeamMappings())
  })
  app.get(`${BASE}/identity/entity-mappings/competitions`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(await listCompetitionMappings())
  })
  app.get(`${BASE}/identity/entity-mappings/seasons`, async (_req, reply) => {
    if (!gate(reply)) return
    try { return ok(await createRepositories().intelligence.listProviderSeasonMappings(200)) } catch { return ok([]) }
  })
  app.post(`${BASE}/identity/entity-mappings/derive`, op, async (req, reply) => {
    if (!gate(reply)) return
    const run = await deriveEntityMappings('api_football')
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'entity_mapping_derivation', resourceId: run.id, metadata: { status: run.status } })
    return ok(run)
  })
  app.post(`${BASE}/identity/entity-mappings/teams/:mappingId/confirm`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = String((req.params as any).mappingId)
    const res = await confirmTeamMapping(id, req.auth?.user?.userId ?? null)
    if (!res.ok) return reply.status(404).send(badRequest('mapping_not_found'))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'team_mapping', resourceId: id, metadata: { op: 'confirm' } })
    return ok(res)
  })
  app.post(`${BASE}/identity/entity-mappings/teams/:mappingId/reject`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = String((req.params as any).mappingId)
    const res = await rejectTeamMapping(id, req.auth?.user?.userId ?? null)
    if (!res.ok) return reply.status(404).send(badRequest('mapping_not_found'))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'team_mapping', resourceId: id, metadata: { op: 'reject' } })
    return ok(res)
  })
  app.post(`${BASE}/identity/entity-mappings/competitions/:mappingId/confirm`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = String((req.params as any).mappingId)
    const res = await confirmCompetitionMapping(id, req.auth?.user?.userId ?? null)
    if (!res.ok) return reply.status(404).send(badRequest('mapping_not_found'))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'competition_mapping', resourceId: id, metadata: { op: 'confirm' } })
    return ok(res)
  })
  app.post(`${BASE}/identity/entity-mappings/competitions/:mappingId/reject`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = String((req.params as any).mappingId)
    const res = await rejectCompetitionMapping(id, req.auth?.user?.userId ?? null)
    if (!res.ok) return reply.status(404).send(badRequest('mapping_not_found'))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'competition_mapping', resourceId: id, metadata: { op: 'reject' } })
    return ok(res)
  })
  app.get(`${BASE}/fixtures/:fixtureId/domain-unlock-status`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildAcquisitionReportV3(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/domain-unlock-status/:domain`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await getDomainUnlockStatus(fid(req), String((req.params as any).domain), 'api_football'))
  })
  app.post(`${BASE}/fixtures/:fixtureId/acquisition/run-v3`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = fid(req)
    const res = await runAcquisitionForFixtureV3(id)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'pre_match_acquisition', resourceId: res.run.id, metadata: { scope: 'fixture_v3', fixtureId: id } })
    return ok(res)
  })
  app.post(`${BASE}/today/acquisition/run-v3`, op, async (req, reply) => {
    if (!gate(reply)) return
    const res = await runAcquisitionForTodayV3()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'pre_match_acquisition', resourceId: res.run.id, metadata: { scope: 'today_v3' } })
    return ok(res)
  })

  // ── B44 / Bloco 1: critical domain acquisition + endpoint catalog + V5 ──
  app.get(`${BASE}/providers/endpoints`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok(listProviderEndpointCatalog())
  })
  app.get(`${BASE}/fixtures/:fixtureId/domain-unlock-matrix`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await getAllDomainUnlockStatuses(fid(req), 'api_football'))
  })
  app.get(`${BASE}/fixtures/:fixtureId/domains/:domain`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await getDomainUnlockStatusV2(fid(req), String((req.params as any).domain), 'api_football'))
  })
  app.post(`${BASE}/fixtures/:fixtureId/domains/:domain/refresh`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = fid(req)
    const res = await runDomainAcquisition(id, String((req.params as any).domain) as any)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'critical_domain', resourceId: id, metadata: { domain: (req.params as any).domain } })
    return ok(res)
  })
  app.get(`${BASE}/fixtures/:fixtureId/critical-acquisition-report`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildCriticalDomainAcquisitionReport(fid(req)))
  })
  app.post(`${BASE}/fixtures/:fixtureId/acquisition/critical/run`, op, async (req, reply) => {
    if (!gate(reply)) return
    const id = fid(req)
    const report = await runCriticalDomainAcquisitionForFixture(id)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'critical_domain', resourceId: id, metadata: { scope: 'fixture_critical' } })
    return ok(report)
  })
  app.post(`${BASE}/today/acquisition/critical/run`, op, async (req, reply) => {
    if (!gate(reply)) return
    const res = await runCriticalDomainAcquisitionForToday()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'critical_domain', resourceId: 'today', metadata: { scope: 'today_critical', fixtures: res.fixtures } })
    return ok(res)
  })
  app.get(`${BASE}/fixtures/:fixtureId/readiness-v5`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildFundamentalReadinessV5(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/precheck-v5`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await runAlertDecisionPrecheckV5(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/post-match-explanation-v3`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildPostMatchExplanationV3(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/package-v3`, async (req, reply) => {
    if (!gate(reply)) return
    const pkg = await buildMatchIntelligencePackageV3(fid(req))
    return pkg ? ok(pkg) : reply.status(404).send(badRequest('fixture_not_found'))
  })

  // ── B45: historical club memory + contextual pattern intelligence ──
  app.get(`${BASE}/fixtures/:fixtureId/memory`, async (req, reply) => {
    if (!gate(reply)) return
    const repos = createRepositories()
    const fixture = await repos.fixtures.findById(fid(req)).catch(() => null)
    if (!fixture) return reply.status(404).send(badRequest('fixture_not_found'))
    const [home, away, matchup, patternContext, taboos, similar] = await Promise.all([
      fixture.homeName ? buildTeamFundamentalMemory(fixture.homeName).catch(() => null) : Promise.resolve(null),
      fixture.awayName ? buildTeamFundamentalMemory(fixture.awayName).catch(() => null) : Promise.resolve(null),
      buildMatchupMemoryForFixture(fid(req)).catch(() => null),
      getPatternMemoryForFixture(fid(req)).catch(() => []),
      detectTabooCandidatesForFixture(fid(req)).catch(() => []),
      findSimilarPreMatchScenarios(fid(req)).catch(() => null),
    ])
    return ok({ homeMemory: home, awayMemory: away, matchupMemory: matchup, patternContextMemory: patternContext, taboos, similarScenarios: similar })
  })
  app.post(`${BASE}/fixtures/:fixtureId/memory/build`, op, async (req, reply) => {
    if (!gate(reply)) return
    const run = await buildMemoryForFixture(fid(req))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'historical_memory', resourceId: fid(req), metadata: { scope: 'fixture', status: run.status } })
    return ok(run)
  })
  app.get(`${BASE}/teams/:teamId/fundamental-memory`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildTeamFundamentalMemory(String((req.params as any).teamId)))
  })
  app.post(`${BASE}/teams/:teamId/fundamental-memory/build`, op, async (req, reply) => {
    if (!gate(reply)) return
    const run = await buildMemoryForTeam(String((req.params as any).teamId))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'historical_memory', resourceId: String((req.params as any).teamId), metadata: { scope: 'team', status: run.status } })
    return ok(run)
  })
  app.get(`${BASE}/fixtures/:fixtureId/matchup-memory`, async (req, reply) => {
    if (!gate(reply)) return
    const m = await buildMatchupMemoryForFixture(fid(req))
    return m ? ok(m) : reply.status(404).send(badRequest('fixture_not_found'))
  })
  app.get(`${BASE}/fixtures/:fixtureId/taboos`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await detectTabooCandidatesForFixture(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/similar-scenarios`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await findSimilarPreMatchScenarios(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/pattern-memory`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await getPatternMemoryForFixture(fid(req)))
  })
  app.get(`${BASE}/memory/build-runs`, async (_req, reply) => {
    if (!gate(reply)) return
    try { return ok(await createRepositories().intelligence.listMemoryBuildRuns(50)) } catch { return ok([]) }
  })
  app.post(`${BASE}/memory/today/build`, op, async (req, reply) => {
    if (!gate(reply)) return
    const run = await buildMemoryForToday()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'historical_memory', resourceId: 'today', metadata: { scope: 'today', status: run.status } })
    return ok(run)
  })
  app.get(`${BASE}/memory/status`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok({ buildEnabled: isHistoricalMemoryBuildEnabled(), schedulerEnabled: flag(env.ENABLE_HISTORICAL_MEMORY_SCHEDULER) })
  })
  app.get(`${BASE}/fixtures/:fixtureId/package-v4`, async (req, reply) => {
    if (!gate(reply)) return
    const pkg = await buildMatchIntelligencePackageV4(fid(req))
    return pkg ? ok(pkg) : reply.status(404).send(badRequest('fixture_not_found'))
  })
  app.get(`${BASE}/fixtures/:fixtureId/readiness-v6`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildFundamentalReadinessV6(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/precheck-v6`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await runAlertDecisionPrecheckV6(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/post-match-explanation-v4`, async (req, reply) => {
    if (!gate(reply)) return
    return ok(await buildPostMatchExplanationV4(fid(req)))
  })

  // ── B46: variable influence engine ──
  function influenceGate(reply: any): boolean {
    if (!gate(reply)) return false
    if (!isInfluenceEngineEnabled()) {
      reply.status(403).send({ success: false, error: { message: 'Variable Influence Engine desabilitado (ENABLE_VARIABLE_INFLUENCE_ENGINE=false).', reason: 'env_gate_disabled' } })
      return false
    }
    return true
  }
  const pid = (req: any) => String((req.params as any).patternId)

  app.get(`${BASE}/fixtures/:fixtureId/influence`, async (req, reply) => {
    if (!influenceGate(reply)) return
    const c = await composeInfluence(fid(req), null)
    return c ? ok(c) : reply.status(404).send(badRequest('fixture_not_found'))
  })
  app.post(`${BASE}/fixtures/:fixtureId/influence/build`, op, async (req, reply) => {
    if (!influenceGate(reply)) return
    const res = await buildFixtureInfluence(fid(req))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'variable_influence', resourceId: fid(req), metadata: { scope: 'fixture', status: res.run.status } })
    return ok(res)
  })
  app.get(`${BASE}/fixtures/:fixtureId/patterns/:patternId/influence`, async (req, reply) => {
    if (!influenceGate(reply)) return
    const c = await composeInfluence(fid(req), pid(req))
    return c ? ok(c) : reply.status(404).send(badRequest('fixture_not_found'))
  })
  app.post(`${BASE}/fixtures/:fixtureId/patterns/:patternId/influence/build`, op, async (req, reply) => {
    if (!influenceGate(reply)) return
    const res = await buildPatternInfluence(fid(req), pid(req))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'variable_influence', resourceId: `${fid(req)}:${pid(req)}`, metadata: { scope: 'pattern', status: res.run.status } })
    return ok(res)
  })
  app.get(`${BASE}/fixtures/:fixtureId/package-v5`, async (req, reply) => {
    if (!influenceGate(reply)) return
    const pkg = await buildMatchIntelligencePackageV5(fid(req))
    return pkg ? ok(pkg) : reply.status(404).send(badRequest('fixture_not_found'))
  })
  app.get(`${BASE}/fixtures/:fixtureId/readiness-v7`, async (req, reply) => {
    if (!influenceGate(reply)) return
    return ok(await buildFundamentalReadinessV7(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/precheck-v7`, async (req, reply) => {
    if (!influenceGate(reply)) return
    return ok(await runAlertDecisionPrecheckV7(fid(req)))
  })
  app.get(`${BASE}/fixtures/:fixtureId/post-match-explanation-v5`, async (req, reply) => {
    if (!influenceGate(reply)) return
    return ok(await buildPostMatchExplanationV5(fid(req)))
  })
  app.get(`${BASE}/influence/build-runs`, async (_req, reply) => {
    if (!influenceGate(reply)) return
    return ok(await listInfluenceBuildRuns(50))
  })

  // ── B47: alert decision governance ──
  function governanceGate(reply: any): boolean {
    if (!gate(reply)) return false
    if (!isGovernanceEnabled()) {
      reply.status(403).send({ success: false, error: { message: 'Alert Decision Governance desabilitado (ENABLE_ALERT_DECISION_GOVERNANCE=false).', reason: 'env_gate_disabled' } })
      return false
    }
    return true
  }
  const hid = (req: any) => String((req.params as any).holdId)
  const rid = (req: any) => String((req.params as any).resultId)

  app.get(`${BASE}/governance/mode`, async (_req, reply) => {
    if (!gate(reply)) return
    return ok({ mode: getGovernanceMode(), enabled: isGovernanceEnabled(), policy: getDefaultPolicy() })
  })
  app.get(`${BASE}/fixtures/:fixtureId/governance`, async (req, reply) => {
    if (!governanceGate(reply)) return
    const repos = createRepositories()
    const [results, holds] = await Promise.all([
      repos.intelligence.listGovernanceResultsByFixture(fid(req), 50).catch(() => []),
      listActiveHoldsForFixture(fid(req)).catch(() => []),
    ])
    return ok({ mode: getGovernanceMode(), results, holds })
  })
  app.post(`${BASE}/fixtures/:fixtureId/governance/evaluate`, op, async (req, reply) => {
    if (!governanceGate(reply)) return
    const body = (req.body || {}) as any
    const result = await evaluateAlertCandidate({ fixtureId: fid(req), patternId: body.patternId ?? null, source: body.source || 'manual_review', candidateAlertId: body.candidateAlertId ?? null })
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'alert_governance', resourceId: fid(req), metadata: { action: result.action, mode: result.mode } })
    return ok(result)
  })
  app.get(`${BASE}/fixtures/:fixtureId/governance/holds`, async (req, reply) => {
    if (!governanceGate(reply)) return
    return ok(await listActiveHoldsForFixture(fid(req)))
  })
  app.post(`${BASE}/governance/holds/:holdId/recheck`, op, async (req, reply) => {
    if (!governanceGate(reply)) return
    const repos = createRepositories()
    const hold = await repos.intelligence.getAlertGovernanceHold(hid(req)).catch(() => null)
    if (!hold) return reply.status(404).send(badRequest('hold_not_found'))
    const trigger = (((req.body || {}) as any).trigger || 'minute_threshold') as AlertGovernanceRecheckTrigger
    const out = await handleLiveTrigger(hold.fixtureId, trigger)
    return ok(out)
  })
  app.post(`${BASE}/governance/holds/:holdId/resolve`, op, async (req, reply) => {
    if (!governanceGate(reply)) return
    const res = await resolveHold(hid(req), 'operator_resolved')
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'alert_governance_hold', resourceId: hid(req), metadata: { resolved: res.count } })
    return ok(res)
  })
  app.get(`${BASE}/governance/results/:resultId`, async (req, reply) => {
    if (!governanceGate(reply)) return
    const r = await createRepositories().intelligence.getAlertDecisionGovernanceResult(rid(req)).catch(() => null)
    return r ? ok({ result: r, explanation: await explainGovernanceDecision(rid(req)) }) : reply.status(404).send(badRequest('result_not_found'))
  })
  app.get(`${BASE}/governance/runs`, async (_req, reply) => {
    if (!governanceGate(reply)) return
    try { return ok(await createRepositories().intelligence.listAlertGovernanceRuns(50)) } catch { return ok([]) }
  })
  app.post(`${BASE}/fixtures/:fixtureId/governance/live-trigger`, op, async (req, reply) => {
    if (!governanceGate(reply)) return
    const trigger = (((req.body || {}) as any).trigger || 'minute_threshold') as AlertGovernanceRecheckTrigger
    const out = await handleLiveTrigger(fid(req), trigger)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'alert_governance', resourceId: fid(req), metadata: { trigger, results: out.results.length } })
    return ok(out)
  })
  app.post(`${BASE}/governance/holds/expire`, op, async (_req, reply) => {
    if (!governanceGate(reply)) return
    return ok({ expired: await expireOldHolds() })
  })
  app.get(`${BASE}/fixtures/:fixtureId/post-match-explanation-v6`, async (req, reply) => {
    if (!governanceGate(reply)) return
    return ok(await buildPostMatchExplanationV6(fid(req)))
  })

  // ── B48: post-match causal learning ──
  function causalGate(reply: any): boolean {
    if (!gate(reply)) return false
    if (!isCausalLearningEnabled()) {
      reply.status(403).send({ success: false, error: { message: 'Causal Learning desabilitado (ENABLE_CAUSAL_LEARNING=false).', reason: 'env_gate_disabled' } })
      return false
    }
    return true
  }
  const cid = (req: any) => String((req.params as any).caseId)
  const sid = (req: any) => String((req.params as any).suggestionId)
  const aid2 = (req: any) => String((req.params as any).alertId)

  app.get(`${BASE}/causal/cases`, async (_req, reply) => {
    if (!causalGate(reply)) return
    try { return ok(await createRepositories().intelligence.listCausalLearningCases(100)) } catch { return ok([]) }
  })
  app.get(`${BASE}/causal/cases/:caseId`, async (req, reply) => {
    if (!causalGate(reply)) return
    const c = await createRepositories().intelligence.getCausalLearningCase(cid(req)).catch(() => null)
    return c ? ok(c) : reply.status(404).send(badRequest('case_not_found'))
  })
  app.get(`${BASE}/fixtures/:fixtureId/causal/cases`, async (req, reply) => {
    if (!causalGate(reply)) return
    try { return ok(await createRepositories().intelligence.listCausalLearningCasesByFixture(fid(req), 100)) } catch { return ok([]) }
  })
  app.post(`${BASE}/fixtures/:fixtureId/causal/run`, op, async (req, reply) => {
    if (!causalGate(reply)) return
    const run = await runCausalLearningForFixture(fid(req))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'causal_learning', resourceId: fid(req), metadata: { scope: 'fixture', cases: run.casesAnalyzed } })
    return ok(run)
  })
  app.post(`${BASE}/causal/today/run`, op, async (req, reply) => {
    if (!causalGate(reply)) return
    const run = await runCausalLearningForToday()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'causal_learning', resourceId: 'today', metadata: { cases: run.casesAnalyzed } })
    return ok(run)
  })
  app.post(`${BASE}/alerts/:alertId/causal/run`, op, async (req, reply) => {
    if (!causalGate(reply)) return
    return ok(await runCausalLearningForAlert(aid2(req)))
  })
  app.post(`${BASE}/governance/results/:resultId/causal/run`, op, async (req, reply) => {
    if (!causalGate(reply)) return
    return ok(await runCausalLearningForGovernanceResult(rid(req)))
  })
  app.get(`${BASE}/causal/insights`, async (_req, reply) => {
    if (!causalGate(reply)) return
    try { return ok(await createRepositories().intelligence.listCausalLearningInsights(100)) } catch { return ok([]) }
  })
  app.get(`${BASE}/fixtures/:fixtureId/causal/insights`, async (req, reply) => {
    if (!causalGate(reply)) return
    try { return ok(await createRepositories().intelligence.listCausalLearningInsightsByFixture(fid(req), 100)) } catch { return ok([]) }
  })
  app.get(`${BASE}/causal/calibration/governance`, async (_req, reply) => {
    if (!causalGate(reply)) return
    return ok(await listGovernanceCalibrationSuggestions())
  })
  app.get(`${BASE}/causal/calibration/influence`, async (_req, reply) => {
    if (!causalGate(reply)) return
    return ok(await listInfluenceCalibrationSuggestions())
  })
  app.get(`${BASE}/causal/calibration/report`, async (_req, reply) => {
    if (!causalGate(reply)) return
    return ok(await buildGovernanceCalibrationReport())
  })
  app.post(`${BASE}/causal/calibration/:suggestionId/review`, op, async (req, reply) => {
    if (!causalGate(reply)) return
    const r = await markSuggestionReviewed(sid(req), req.auth?.user?.userId ?? null)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'causal_calibration', resourceId: sid(req), metadata: { status: 'reviewed' } })
    return ok(r)
  })
  app.post(`${BASE}/causal/calibration/:suggestionId/reject`, op, async (req, reply) => {
    if (!causalGate(reply)) return
    const r = await rejectSuggestion(sid(req), req.auth?.user?.userId ?? null)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'causal_calibration', resourceId: sid(req), metadata: { status: 'rejected' } })
    return ok(r)
  })
  app.post(`${BASE}/causal/calibration/:suggestionId/accept-for-future`, op, async (req, reply) => {
    if (!causalGate(reply)) return
    const r = await acceptSuggestionForFutureImplementation(sid(req), req.auth?.user?.userId ?? null)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'causal_calibration', resourceId: sid(req), metadata: { status: 'accepted_for_future' } })
    return ok(r)
  })
  app.get(`${BASE}/causal/runs`, async (_req, reply) => {
    if (!causalGate(reply)) return
    return ok(await listCausalLearningRuns(50))
  })
  app.get(`${BASE}/fixtures/:fixtureId/post-match-explanation-v7`, async (req, reply) => {
    if (!causalGate(reply)) return
    return ok(await buildPostMatchExplanationV7(fid(req)))
  })

  // ── B49: local long-run validation ──
  function lvGate(reply: any): boolean {
    if (!gate(reply)) return false
    if (!isLocalValidationEnabled()) {
      reply.status(403).send({ success: false, error: { message: 'Local Long-Run Validation desabilitado (ENABLE_LOCAL_LONG_RUN_VALIDATION=false).', reason: 'env_gate_disabled' } })
      return false
    }
    return true
  }
  const runIdParam = (req: any) => String((req.params as any).runId)
  const repos2 = () => createRepositories()

  app.get(`${BASE}/local-validation/plan/today`, async (_req, reply) => {
    if (!lvGate(reply)) return
    return ok(await buildTodayValidationPlan())
  })
  app.post(`${BASE}/local-validation/run/today`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    const run = await runValidationForToday()
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'local_validation', resourceId: run.id, metadata: { scope: 'today', selected: run.selectedFixtures } })
    return ok(run)
  })
  app.post(`${BASE}/local-validation/run/fixtures/:fixtureId`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    const run = await runValidationForFixture(fid(req))
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'local_validation', resourceId: run.id, metadata: { fixtureId: fid(req) } })
    return ok(run)
  })
  app.get(`${BASE}/local-validation/runs`, async (_req, reply) => {
    if (!lvGate(reply)) return
    return ok(await listValidationRuns(50))
  })
  app.get(`${BASE}/local-validation/runs/:runId`, async (req, reply) => {
    if (!lvGate(reply)) return
    const r = await getValidationRun(runIdParam(req))
    return r ? ok(r) : reply.status(404).send(badRequest('run_not_found'))
  })
  app.post(`${BASE}/local-validation/runs/:runId/cancel`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await cancelValidationRun(runIdParam(req)))
  })
  app.get(`${BASE}/local-validation/runs/:runId/metrics/reliability`, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await repos2().intelligence.getLocalValidationReliabilityMetrics(runIdParam(req)).catch(() => null))
  })
  app.get(`${BASE}/local-validation/runs/:runId/metrics/coverage`, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await repos2().intelligence.getLocalValidationCoverageMetrics(runIdParam(req)).catch(() => null))
  })
  app.get(`${BASE}/local-validation/runs/:runId/metrics/cost`, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await repos2().intelligence.getLocalValidationCostMetrics(runIdParam(req)).catch(() => null))
  })
  app.get(`${BASE}/local-validation/runs/:runId/report/readiness`, async (req, reply) => {
    if (!lvGate(reply)) return
    // Readiness report is derived & not separately persisted; rebuild from summaries.
    const summaries = await repos2().intelligence.listLocalValidationFixtureSummaries(runIdParam(req), 200).catch(() => [])
    return ok({ runId: runIdParam(req), fixtures: summaries.length, providerNotConfiguredDomains: [...new Set(summaries.flatMap((s: any) => s.providerLimitations || []))] })
  })
  app.get(`${BASE}/local-validation/runs/:runId/report/go-no-go`, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await repos2().intelligence.getLocalValidationGoNoGoReport(runIdParam(req)).catch(() => null))
  })
  app.get(`${BASE}/local-validation/provider-coverage`, async (_req, reply) => {
    if (!lvGate(reply)) return
    return ok(buildProviderCoverageReport())
  })
  app.get(`${BASE}/local-validation/backend-health`, async (_req, reply) => {
    if (!lvGate(reply)) return
    return ok(await buildBackendHealthReport())
  })
  app.post(`${BASE}/local-validation/links/repair/today`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await repairLinksForToday())
  })
  app.post(`${BASE}/local-validation/links/repair/fixtures/:fixtureId`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await repairLinksForFixture(fid(req)))
  })

  // ── B50: daily validation report, campaigns, controlled-beta readiness ──
  const campaignIdParam = (req: any) => String((req.params as any).campaignId)

  app.get(`${BASE}/local-validation/daily-report`, async (req, reply) => {
    if (!lvGate(reply)) return
    const date = String((req.query as any)?.date || new Date().toISOString().slice(0, 10))
    const existing = await getDailyValidationReport(date)
    return ok(existing ?? await listDailyValidationReports(1).then(rs => rs[0] ?? null))
  })
  app.post(`${BASE}/local-validation/daily-report/generate`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    const date = String(((req.body || {}) as any).date || new Date().toISOString().slice(0, 10))
    const report = await generateDailyValidationReport(date)
    // Optionally attach to a running campaign if campaignId is provided.
    const campaignId = ((req.body || {}) as any).campaignId
    if (campaignId) await attachDailyReport(String(campaignId), report).catch(() => null)
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'daily_validation_report', resourceId: date, metadata: { fixturesAnalyzed: report.fixturesAnalyzed } })
    return ok(report)
  })
  app.get(`${BASE}/local-validation/campaigns`, async (_req, reply) => {
    if (!lvGate(reply)) return
    return ok(await listCampaigns(50))
  })
  app.post(`${BASE}/local-validation/campaigns`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    const body = (req.body || {}) as any
    const c = await createValidationCampaign(String(body.title || ''), Number(body.targetDays || 14))
    return ok(c)
  })
  app.get(`${BASE}/local-validation/campaigns/:campaignId`, async (req, reply) => {
    if (!lvGate(reply)) return
    const c = await getCampaign(campaignIdParam(req))
    return c ? ok(c) : reply.status(404).send(badRequest('campaign_not_found'))
  })
  app.post(`${BASE}/local-validation/campaigns/:campaignId/close`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    const c = await closeCampaign(campaignIdParam(req))
    return c ? ok(c) : reply.status(404).send(badRequest('campaign_not_found'))
  })
  app.get(`${BASE}/local-validation/controlled-beta-readiness`, async (_req, reply) => {
    if (!lvGate(reply)) return
    return ok(await buildControlledBetaReadiness())
  })

  // B59: persistent ESPN Live-First worker controls.
  app.get(`${BASE}/espn-live-first/worker/status`, async (_req, reply) => {
    if (!lvGate(reply)) return
    const repos = repos2()
    const runs = await repos.intelligence.listEspnLiveFirstWorkerRuns({ limit: 20 }).catch(() => [])
    const sessions = await repos.intelligence.listLiveMonitoringSessions(50).catch(() => [])
    const leases = await repos.intelligence.listEspnLiveFirstFixtureLeases(200).catch(() => [])
    const recoveryReports = await repos.intelligence.listEspnLiveFirstRecoveryReports(10).catch(() => [])
    const outcomes = await repos.intelligence.listLiveFirstPostMatchOutcomes(100).catch(() => [])
    return ok({
      active: getActiveWorkerStatus(),
      runs,
      sessions,
      leases,
      recoveryReports,
      postMatchOutcomes: outcomes,
      sessionsRunning: sessions.filter(s => s.status === 'running').length,
      fixturesActive: leases.filter(l => l.status === 'active').length,
      orphanSessions: recoveryReports[0]?.orphanedSessionsFound ?? 0,
      completedFixtures: outcomes.filter(o => o.evaluable).length,
      postMatchPending: Math.max(0, sessions.filter(s => s.status === 'completed' || s.status === 'completed_with_warnings').reduce((sum, s) => sum + s.fixtureIds.length, 0) - outcomes.length),
      limitations: ['Local-only worker control; no odds, Telegram, auto-bet, stake, or enforce changes.'],
    })
  })
  app.post(`${BASE}/espn-live-first/worker/start`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    const body = (req.body || {}) as any
    return ok(await startWorkerRun({
      mode: body.mode || 'local_manual',
      maxDurationMinutes: Number(body.maxDurationMinutes || env.ESPN_LIVE_FIRST_MAX_SESSION_MINUTES),
      maxFixtures: Number(body.maxFixtures || env.ESPN_LIVE_FIRST_MAX_FIXTURES),
      pollIntervalSeconds: Number(body.pollIntervalSeconds || env.ESPN_LIVE_FIRST_POLL_INTERVAL_SECONDS),
    }))
  })
  app.post(`${BASE}/espn-live-first/worker/:workerRunId/stop`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await stopWorkerRun(String((req.params as any).workerRunId)))
  })
  app.post(`${BASE}/espn-live-first/worker/:workerRunId/resume`, op, async (req, reply) => {
    if (!lvGate(reply)) return
    return ok(await resumeWorkerRun(String((req.params as any).workerRunId)))
  })
  app.get(`${BASE}/espn-live-first/worker/:workerRunId/summary`, async (req, reply) => {
    if (!lvGate(reply)) return
    const summary = await buildWorkerRunSummary(String((req.params as any).workerRunId))
    return summary ? ok(summary) : reply.status(404).send(badRequest('worker_run_not_found'))
  })
  app.post(`${BASE}/espn-live-first/recovery-sweep`, op, async (_req, reply) => {
    if (!lvGate(reply)) return
    return ok(await runRecoverySweep())
  })
  app.post(`${BASE}/espn-live-first/post-match-sweeper`, op, async (_req, reply) => {
    if (!lvGate(reply)) return
    return ok(await runPostMatchSweeper())
  })
}
