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

function clampLimit(raw: string | undefined, def: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n <= 0) return def
  return Math.min(n, max)
}

export async function intelligenceRoutes(app: FastifyInstance) {
  const repos = createRepositories()

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
