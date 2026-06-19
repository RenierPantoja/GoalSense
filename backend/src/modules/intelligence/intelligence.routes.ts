/**
 * Intelligence read API (Phase B12).
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only endpoints over the Football Intelligence Memory. Honest emptiness:
 * absence returns null/[] with 200 (never 500). Ordering is newest-first inside
 * the repository; lists are capped.
 */
import type { FastifyInstance } from 'fastify'
import { createRepositories } from '../../repositories/index.js'
import { ok } from '../../utils/apiResponse.js'
import { buildAlertOverview, searchAlerts, type AlertIntelFilters } from './alertIntelligence.service.js'
import { relatedForAlert, relatedForPattern } from './relatedAlerts.service.js'

function clampLimit(raw: string | undefined, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

function parseFilters(q: Record<string, any>): AlertIntelFilters {
  const num = (v: any) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : undefined }
  const bool = (v: any) => v === 'true' || v === '1'
  return {
    dateFrom: q.dateFrom || null,
    dateTo: q.dateTo || null,
    patternId: q.patternId || undefined,
    league: q.league || undefined,
    team: q.team || undefined,
    result: q.result || undefined,
    status: q.status || undefined,
    dataQuality: q.dataQuality || undefined,
    provider: q.provider || undefined,
    minuteWindow: q.minuteWindow || undefined,
    failureReason: q.failureReason || undefined,
    minConfidence: num(q.minConfidence),
    maxConfidence: num(q.maxConfidence),
    hasFailureAnalysis: q.hasFailureAnalysis != null ? bool(q.hasFailureAnalysis) : undefined,
    hasLearningEvent: q.hasLearningEvent != null ? bool(q.hasLearningEvent) : undefined,
    q: q.q || undefined,
  }
}

export async function intelligenceRoutes(app: FastifyInstance) {
  const repos = createRepositories()

  // ── B17: alert intelligence overview (server-side metrics) ──────────────────
  app.get('/intelligence/alerts/overview', async (req) => {
    try { return ok(await buildAlertOverview(parseFilters(req.query as any))) }
    catch (e: any) { app.log.warn(`alert overview failed: ${e?.message || e}`); return ok(null) }
  })

  // ── B17: alert intelligence search (server-side filtered list) ──────────────
  app.get('/intelligence/alerts/search', async (req) => {
    const q = req.query as any
    try {
      return ok(await searchAlerts(parseFilters(q), clampLimit(q.limit, 50, 200), q.cursor ? parseInt(q.cursor, 10) : undefined))
    } catch (e: any) { app.log.warn(`alert search failed: ${e?.message || e}`); return ok({ total: 0, nextCursor: null, items: [] }) }
  })

  app.get('/intelligence/alerts/:alertId/ledger', async (req) => {
    const { alertId } = req.params as { alertId: string }
    try {
      const entry = await repos.intelligence.getSignalLedgerEntryByAlertId(alertId)
      return ok(entry)
    } catch (e: any) {
      app.log.warn(`intelligence ledger read failed: ${e?.message || e}`)
      return ok(null)
    }
  })

  app.get('/intelligence/alerts/:alertId/outcome', async (req) => {
    const { alertId } = req.params as { alertId: string }
    try {
      const outcome = await repos.intelligence.getAlertOutcomeByAlertId(alertId)
      return ok(outcome)
    } catch (e: any) {
      app.log.warn(`intelligence outcome read failed: ${e?.message || e}`)
      return ok(null)
    }
  })

  // ── B17: failure analysis (real, via endpoint — no derivation) ──────────────
  app.get('/intelligence/alerts/:alertId/failure-analysis', async (req) => {
    const { alertId } = req.params as { alertId: string }
    try { return ok(await repos.intelligence.getFailureAnalysisByAlertId(alertId)) }
    catch (e: any) { app.log.warn(`failure-analysis read failed: ${e?.message || e}`); return ok(null) }
  })

  app.get('/intelligence/patterns/:patternId/failure-analyses', async (req) => {
    const { patternId } = req.params as { patternId: string }
    const { limit } = req.query as { limit?: string }
    try { return ok(await repos.intelligence.listFailureAnalysesByPattern(patternId, clampLimit(limit, 100, 500))) }
    catch (e: any) { app.log.warn(`failure-analyses read failed: ${e?.message || e}`); return ok([]) }
  })

  // ── B17: related alerts (explainable relations) ─────────────────────────────
  app.get('/intelligence/alerts/:alertId/related', async (req) => {
    const { alertId } = req.params as { alertId: string }
    const { limit } = req.query as { limit?: string }
    try { return ok(await relatedForAlert(alertId, clampLimit(limit, 20, 100))) }
    catch (e: any) { app.log.warn(`related alerts failed: ${e?.message || e}`); return ok({ anchorAlertId: alertId, found: false, appliedFilters: [], total: 0, relatedAlerts: [] }) }
  })

  app.get('/intelligence/patterns/:patternId/related-alerts', async (req) => {
    const { patternId } = req.params as { patternId: string }
    const { limit } = req.query as { limit?: string }
    try { return ok(await relatedForPattern(patternId, clampLimit(limit, 30, 200))) }
    catch (e: any) { app.log.warn(`pattern related alerts failed: ${e?.message || e}`); return ok({ patternId, total: 0, appliedFilters: [], relatedAlerts: [] }) }
  })

  app.get('/intelligence/patterns/:patternId/ledger', async (req) => {
    const { patternId } = req.params as { patternId: string }
    const { limit } = req.query as { limit?: string }
    try {
      const entries = await repos.intelligence.listSignalLedgerEntries({ patternId, limit: clampLimit(limit, 100, 500) })
      return ok(entries)
    } catch (e: any) {
      app.log.warn(`intelligence pattern ledger read failed: ${e?.message || e}`)
      return ok([])
    }
  })

  app.get('/intelligence/patterns/:patternId/outcomes', async (req) => {
    const { patternId } = req.params as { patternId: string }
    const { limit } = req.query as { limit?: string }
    try {
      const outcomes = await repos.intelligence.listAlertOutcomesByPattern(patternId, clampLimit(limit, 100, 500))
      return ok(outcomes)
    } catch (e: any) {
      app.log.warn(`intelligence pattern outcomes read failed: ${e?.message || e}`)
      return ok([])
    }
  })

  app.get('/intelligence/patterns/:patternId/learning-events', async (req) => {
    const { patternId } = req.params as { patternId: string }
    const { limit } = req.query as { limit?: string }
    try {
      const events = await repos.intelligence.listLearningEventsByPattern(patternId, clampLimit(limit, 100, 500))
      return ok(events)
    } catch (e: any) {
      app.log.warn(`intelligence learning-events read failed: ${e?.message || e}`)
      return ok([])
    }
  })

  app.get('/intelligence/overview', async () => {
    try {
      const overview = await repos.intelligence.getOverview()
      return ok(overview)
    } catch (e: any) {
      app.log.warn(`intelligence overview read failed: ${e?.message || e}`)
      return ok({ ledgerEntries: 0, outcomes: 0, outcomeBreakdown: { pending: 0, confirmed: 0, confirmed_partial: 0, failed: 0, unknown: 0, expired: 0 }, failureAnalyses: 0, learningEvents: 0, missedOpportunities: 0, generatedAt: new Date().toISOString() })
    }
  })
}
