/**
 * Auto Engine API (Phase B19).
 * ─────────────────────────────────────────────────────────────────────────────
 * Read endpoints are open (honest null/[]). POST /scan is gated by
 * ENABLE_AUTO_ENGINE (403 when off) and NEVER creates alerts/Telegram. No auth
 * layer yet — documented as a future phase.
 */
import type { FastifyInstance } from 'fastify'
import { createRepositories } from '../../repositories/index.js'
import { ok, badRequest, notFound } from '../../utils/apiResponse.js'
import { runAutoEngineScan, getAutoEngineOverview, isAutoEngineEnabled } from './autoEngine/autoEngine.service.js'
import {
  createOpportunityAction, recordFeedback, addNote, getActionSummary, listActions,
  searchAutoOpportunities, getFixtureContext, type CreateActionInput, type OpportunitySearchFilters,
} from './autoEngine/autoOpportunityActions.service.js'
import { createPromotionPlanForOpportunity, getPromotionPlan } from './autoEngine/autoOpportunityPromotion.service.js'
import {
  createManualAlertPromotionPreview, promoteOpportunityToManualAlert, getPromotedAlertLink, isManualPromotionEnabled,
} from './autoEngine/autoOpportunityAlertPromotion.service.js'
import {
  getOpportunityOutcomeSummary, getPromotedAlertOutcomeLink, listPromotedAlertsWithOutcome,
  isPromotedAlertManualResolveEnabled,
} from './autoEngine/promotedAlertResolution.service.js'
import { resolveSinglePromotedAlertNow } from '../command/alertResolution.service.js'
import { rebuildAutoEngineLearningProfiles, isAutoEngineLearningRebuildEnabled } from './autoEngine/autoEngineLearningAggregator.service.js'
import {
  getLatestAutoEngineLearningProfile, getAutoOpportunityTypeProfile,
  listAutoEngineLearningRecommendations, getAutoEngineCalibrationOverview,
} from './autoEngine/autoEngineCalibration.service.js'
import type { AutoOpportunityActionType, AutoOpportunityFeedbackType, ManualAlertPromotionRequest } from './autoEngine/autoEngine.types.js'

const VALID_ACTIONS: AutoOpportunityActionType[] = [
  'saved', 'unsaved', 'dismissed', 'restored', 'marked_useful', 'marked_not_useful',
  'feedback_recorded', 'note_added', 'note_removed', 'radar_proposal_created',
  'opened_in_backtest', 'opened_related_alerts', 'opened_fixture', 'ignored_for_now',
]
const VALID_FEEDBACK: AutoOpportunityFeedbackType[] = [
  'useful', 'not_useful', 'too_early', 'too_late', 'data_poor', 'context_wrong',
  'already_seen', 'interesting_but_weak', 'strong_signal', 'irrelevant', 'unknown',
]

function clampLimit(raw: string | undefined, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

export async function autoEngineRoutes(app: FastifyInstance) {
  const repos = createRepositories()

  app.get('/intelligence/auto-engine/status', async () => {
    try { return ok(await getAutoEngineOverview()) }
    catch (e: any) { app.log.warn(`auto-engine status failed: ${e?.message || e}`); return ok(null) }
  })

  app.post('/intelligence/auto-engine/scan', async (req, reply) => {
    if (!isAutoEngineEnabled()) {
      return reply.status(403).send({ success: false, error: { message: 'Motor automático desabilitado. Defina ENABLE_AUTO_ENGINE=true no backend.' } })
    }
    const body = (req.body || {}) as { dryRun?: boolean; limit?: number; persist?: boolean }
    try {
      const run = await runAutoEngineScan({ dryRun: !!body.dryRun, limit: body.limit, persist: body.persist === true })
      return ok(run)
    } catch (e: any) {
      app.log.error(`auto-engine scan failed: ${e?.message || e}`)
      return reply.status(400).send(badRequest('Scan failed', e?.message))
    }
  })

  app.get('/intelligence/auto-engine/runs', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listAutoEngineRuns(clampLimit(limit, 50, 200))) }
    catch (e: any) { app.log.warn(`auto-engine runs failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/auto-engine/runs/:runId', async (req) => {
    const { runId } = req.params as { runId: string }
    try { return ok(await repos.intelligence.getAutoEngineRun(runId)) }
    catch (e: any) { app.log.warn(`auto-engine run failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/opportunities', async (req) => {
    const { status, type, limit } = req.query as { status?: string; type?: string; limit?: string }
    try { return ok(await repos.intelligence.listAutoOpportunities({ status, type, limit: clampLimit(limit, 100, 300) })) }
    catch (e: any) { app.log.warn(`auto-engine opportunities failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/auto-engine/opportunities/:id', async (req) => {
    const { id } = req.params as { id: string }
    try { return ok(await repos.intelligence.getAutoOpportunity(id)) }
    catch (e: any) { app.log.warn(`auto-engine opportunity failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/fixtures/:fixtureId/opportunities', async (req) => {
    const { fixtureId } = req.params as { fixtureId: string }
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listAutoOpportunitiesByFixture(fixtureId, clampLimit(limit, 50, 100))) }
    catch (e: any) { app.log.warn(`auto-engine fixture opportunities failed: ${e?.message || e}`); return ok([]) }
  })

  // ── B21: server-side search (richer filters; back-compat /opportunities kept) ──
  app.get('/intelligence/auto-engine/opportunities/search', async (req) => {
    const q = req.query as Record<string, string>
    const filters: OpportunitySearchFilters = {
      status: q.status, type: q.type, league: q.league, team: q.team,
      minScore: q.minScore ? Number(q.minScore) : undefined,
      confidenceBand: q.confidenceBand, dataQuality: q.dataQuality, blockReason: q.blockReason,
      q: q.q, saved: q.saved === 'true', dismissed: q.dismissed === 'true', feedbackType: q.feedbackType,
      limit: q.limit ? Number(q.limit) : undefined, cursor: q.cursor,
    }
    try { return ok(await searchAutoOpportunities(filters)) }
    catch (e: any) { app.log.warn(`auto-engine search failed: ${e?.message || e}`); return ok({ items: [], total: 0, appliedFilters: [], unsupportedFilters: [], userStates: {} }) }
  })

  // ── B21: read-only fixture context (resolves the B20 "open match" limitation) ──
  app.get('/intelligence/auto-engine/fixtures/:fixtureId/context', async (req) => {
    const { fixtureId } = req.params as { fixtureId: string }
    try { return ok(await getFixtureContext(fixtureId)) }
    catch (e: any) { app.log.warn(`auto-engine fixture context failed: ${e?.message || e}`); return ok(null) }
  })

  // ── B21: opportunity actions / feedback / notes ──────────────────────────────
  // These never create an alert, never send Telegram, never alter a pattern/score.
  app.post('/intelligence/auto-engine/opportunities/:id/actions', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body || {}) as Partial<CreateActionInput>
    if (!body.actionType || !VALID_ACTIONS.includes(body.actionType)) {
      return reply.status(400).send(badRequest('actionType inválido', { allowed: VALID_ACTIONS }))
    }
    if (body.feedbackType && !VALID_FEEDBACK.includes(body.feedbackType)) {
      return reply.status(400).send(badRequest('feedbackType inválido', { allowed: VALID_FEEDBACK }))
    }
    const res = await createOpportunityAction(id, {
      actionType: body.actionType, feedbackType: body.feedbackType ?? null,
      note: typeof body.note === 'string' ? body.note : null,
      reason: typeof body.reason === 'string' ? body.reason : null,
      metadata: body.metadata ?? null,
    })
    if (!res.ok) return reply.status(404).send(notFound(res.error || 'Oportunidade não encontrada.'))
    return ok({ action: res.action, summary: res.summary, userState: res.userState })
  })

  app.get('/intelligence/auto-engine/opportunities/:id/actions', async (req) => {
    const { id } = req.params as { id: string }
    const { limit } = req.query as { limit?: string }
    try { return ok(await listActions(id, clampLimit(limit, 100, 300))) }
    catch (e: any) { app.log.warn(`auto-engine actions failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/auto-engine/opportunities/:id/action-summary', async (req) => {
    const { id } = req.params as { id: string }
    try { return ok(await getActionSummary(id)) }
    catch (e: any) { app.log.warn(`auto-engine action-summary failed: ${e?.message || e}`); return ok(null) }
  })

  app.post('/intelligence/auto-engine/opportunities/:id/feedback', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body || {}) as { feedbackType?: AutoOpportunityFeedbackType; note?: string }
    if (!body.feedbackType || !VALID_FEEDBACK.includes(body.feedbackType)) {
      return reply.status(400).send(badRequest('feedbackType inválido', { allowed: VALID_FEEDBACK }))
    }
    const res = await recordFeedback(id, body.feedbackType, typeof body.note === 'string' ? body.note : undefined)
    if (!res.ok) return reply.status(404).send(notFound(res.error || 'Oportunidade não encontrada.'))
    return ok({ action: res.action, summary: res.summary, userState: res.userState })
  })

  app.post('/intelligence/auto-engine/opportunities/:id/notes', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body || {}) as { note?: string }
    if (!body.note || !body.note.trim()) return reply.status(400).send(badRequest('Nota vazia.'))
    const res = await addNote(id, body.note)
    if (!res.ok) return reply.status(404).send(notFound(res.error || 'Oportunidade não encontrada.'))
    return ok({ action: res.action, summary: res.summary, userState: res.userState })
  })

  // ── B21: promotion plan (proposal only — never saves/activates a radar) ──────
  app.post('/intelligence/auto-engine/opportunities/:id/promotion-plan', async (req, reply) => {
    const { id } = req.params as { id: string }
    const res = await createPromotionPlanForOpportunity(id)
    if (!res.ok) return reply.status(404).send(notFound(res.error || 'Oportunidade não encontrada.'))
    return ok(res.plan)
  })

  app.get('/intelligence/auto-engine/opportunities/:id/promotion-plan', async (req) => {
    const { id } = req.params as { id: string }
    try { return ok(await getPromotionPlan(id)) }
    catch (e: any) { app.log.warn(`auto-engine promotion-plan failed: ${e?.message || e}`); return ok(null) }
  })

  // ── B22: manual opportunity → monitored alert (human-confirmed only) ─────────
  app.get('/intelligence/auto-engine/opportunities/:id/alert-preview', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const preview = await createManualAlertPromotionPreview(id)
      if (!preview) return reply.status(404).send(notFound('Oportunidade não encontrada.'))
      return ok(preview)
    } catch (e: any) { app.log.warn(`auto-engine alert-preview failed: ${e?.message || e}`); return ok(null) }
  })

  app.post('/intelligence/auto-engine/opportunities/:id/promote-to-alert', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!isManualPromotionEnabled()) {
      return reply.status(403).send({ success: false, error: { message: 'Promoção manual para alerta desabilitada. Defina ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION=true no backend.' } })
    }
    const body = (req.body || {}) as Partial<ManualAlertPromotionRequest>
    if (body.userConfirmed !== true || !body.acknowledgeNoTelegram || !body.acknowledgeNoOdds || !body.acknowledgeNotGuaranteed) {
      return reply.status(400).send(badRequest('Confirmação humana explícita obrigatória (userConfirmed + acknowledgements).'))
    }
    const result = await promoteOpportunityToManualAlert({
      opportunityId: id,
      userConfirmed: true,
      confirmationMode: body.confirmationMode === 'typed_confirmation' ? 'typed_confirmation' : 'explicit_click',
      note: typeof body.note === 'string' ? body.note : null,
      acknowledgeNoTelegram: true, acknowledgeNoOdds: true, acknowledgeNotGuaranteed: true,
    })
    if (!result.success) {
      if (result.reason === 'opportunity_not_found') return reply.status(404).send(notFound('Oportunidade não encontrada.'))
      return reply.status(400).send(badRequest('Não foi possível promover a oportunidade.', { reason: result.reason }))
    }
    return ok(result)
  })

  app.get('/intelligence/auto-engine/opportunities/:id/promoted-alert', async (req) => {
    const { id } = req.params as { id: string }
    try { return ok(await getPromotedAlertLink(id)) }
    catch (e: any) { app.log.warn(`auto-engine promoted-alert failed: ${e?.message || e}`); return ok(null) }
  })

  // ── B23: promoted alert resolution + opportunity outcome loop ────────────────
  app.get('/intelligence/auto-engine/opportunities/:id/outcome-summary', async (req) => {
    const { id } = req.params as { id: string }
    try { return ok(await getOpportunityOutcomeSummary(id)) }
    catch (e: any) { app.log.warn(`auto-engine outcome-summary failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/promoted-alerts/:alertId/outcome-link', async (req) => {
    const { alertId } = req.params as { alertId: string }
    try { return ok(await getPromotedAlertOutcomeLink(alertId)) }
    catch (e: any) { app.log.warn(`auto-engine outcome-link failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/promoted-alerts', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await listPromotedAlertsWithOutcome(clampLimit(limit, 100, 300))) }
    catch (e: any) { app.log.warn(`auto-engine promoted-alerts list failed: ${e?.message || e}`); return ok([]) }
  })

  app.post('/intelligence/auto-engine/promoted-alerts/:alertId/resolve-now', async (req, reply) => {
    const { alertId } = req.params as { alertId: string }
    if (!isPromotedAlertManualResolveEnabled()) {
      return reply.status(403).send({ success: false, error: { message: 'Resolução manual de alerta promovido desabilitada. Defina ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE=true no backend.' } })
    }
    try {
      const res = await resolveSinglePromotedAlertNow(alertId)
      if (!res.ok) {
        if (res.reason === 'alert_not_found') return reply.status(404).send(notFound('Alerta não encontrado.'))
        return reply.status(400).send(badRequest('Não foi possível resolver agora.', { reason: res.reason }))
      }
      return ok(res.result)
    } catch (e: any) { app.log.error(`auto-engine resolve-now failed: ${e?.message || e}`); return reply.status(400).send(badRequest('Resolução falhou', e?.message)) }
  })

  // ── B24: Auto Engine learning & calibration (observational; never auto-tunes) ──
  app.post('/intelligence/auto-engine/learning/rebuild', async (req, reply) => {
    if (!isAutoEngineLearningRebuildEnabled()) {
      return reply.status(403).send({ success: false, error: { message: 'Recálculo de calibração desabilitado. Defina ENABLE_AUTO_ENGINE_LEARNING_REBUILD=true no backend.' } })
    }
    const body = (req.body || {}) as { dryRun?: boolean; from?: string; to?: string }
    try {
      const res = await rebuildAutoEngineLearningProfiles({ dryRun: body.dryRun === true, from: body.from, to: body.to })
      return ok(res)
    } catch (e: any) { app.log.error(`auto-engine learning rebuild failed: ${e?.message || e}`); return reply.status(400).send(badRequest('Rebuild falhou', e?.message)) }
  })

  app.get('/intelligence/auto-engine/learning/profile', async (req) => {
    try { return ok(await getLatestAutoEngineLearningProfile()) }
    catch (e: any) { app.log.warn(`auto-engine learning profile failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/learning/runs', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listAutoEngineLearningRuns(clampLimit(limit, 50, 200))) }
    catch (e: any) { app.log.warn(`auto-engine learning runs failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/auto-engine/learning/runs/:runId', async (req) => {
    const { runId } = req.params as { runId: string }
    try { return ok(await repos.intelligence.getAutoEngineLearningRun(runId)) }
    catch (e: any) { app.log.warn(`auto-engine learning run failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/learning/opportunity-types/:type', async (req) => {
    const { type } = req.params as { type: string }
    try { return ok(await getAutoOpportunityTypeProfile(type)) }
    catch (e: any) { app.log.warn(`auto-engine type profile failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/auto-engine/learning/recommendations', async (req) => {
    const { limit } = req.query as { limit?: string }
    try { return ok(await listAutoEngineLearningRecommendations(clampLimit(limit, 50, 200))) }
    catch (e: any) { app.log.warn(`auto-engine recommendations failed: ${e?.message || e}`); return ok([]) }
  })

  app.get('/intelligence/auto-engine/calibration/overview', async () => {
    try { return ok(await getAutoEngineCalibrationOverview()) }
    catch (e: any) { app.log.warn(`auto-engine calibration overview failed: ${e?.message || e}`); return ok(null) }
  })
}
