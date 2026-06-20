/**
 * Evidence Lineage API (Phase B33).
 * ─────────────────────────────────────────────────────────────────────────────
 * GET endpoints are read-only; the backfill POST is env-gated + admin/owner.
 * No secrets. Honest empty bundles when there is nothing linked.
 */
import type { FastifyInstance } from 'fastify'
import { ok, badRequest } from '../../../utils/apiResponse.js'
import { requirePermission } from '../../../middleware/requirePermission.middleware.js'
import { env } from '../../../env.js'
import { recordAdminAudit } from '../../audit/adminAudit.service.js'
import {
  buildSnapshotLineage, buildFixtureLineageBundle, buildAlertEvidenceLineage,
  buildOpportunityEvidenceLineage, searchEvidenceLineage,
} from './evidenceLineage.service.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export async function evidenceLineageRoutes(app: FastifyInstance) {
  const BASE = '/intelligence/evidence-lineage'

  app.get(`${BASE}/snapshots/:snapshotId`, async (req, reply) => {
    const { snapshotId } = req.params as { snapshotId: string }
    try { return ok(await buildSnapshotLineage(snapshotId)) }
    catch (e: any) { app.log.warn(`evidence snapshot lineage failed: ${e?.message || e}`); return ok(null) }
  })

  app.get(`${BASE}/fixtures/:fixtureId`, async (req, reply) => {
    const { fixtureId } = req.params as { fixtureId: string }
    try { return ok(await buildFixtureLineageBundle(fixtureId)) }
    catch (e: any) { app.log.warn(`evidence fixture lineage failed: ${e?.message || e}`); return ok(null) }
  })

  app.get(`${BASE}/alerts/:alertId`, async (req, reply) => {
    const { alertId } = req.params as { alertId: string }
    try { return ok(await buildAlertEvidenceLineage(alertId)) }
    catch (e: any) { app.log.warn(`evidence alert lineage failed: ${e?.message || e}`); return ok(null) }
  })

  app.get(`${BASE}/opportunities/:opportunityId`, async (req, reply) => {
    const { opportunityId } = req.params as { opportunityId: string }
    try { return ok(await buildOpportunityEvidenceLineage(opportunityId)) }
    catch (e: any) { app.log.warn(`evidence opportunity lineage failed: ${e?.message || e}`); return ok(null) }
  })

  app.get(`${BASE}/search`, async (req, reply) => {
    const q = req.query as Record<string, string>
    const limit = q.limit ? Math.min(500, parseInt(q.limit) || 100) : 100
    try {
      return ok(await searchEvidenceLineage({
        snapshotId: q.snapshotId, fixtureId: q.fixtureId, alertId: q.alertId,
        opportunityId: q.opportunityId, source: q.source, sourceId: q.sourceId, limit,
      }))
    } catch (e: any) { app.log.warn(`evidence search failed: ${e?.message || e}`); return ok([]) }
  })

  // Backfill — env-gated + admin/owner. The script is the primary path; this route
  // exists for operators. It never deletes and never invents links.
  app.post(`${BASE}/backfill`, { preHandler: [requirePermission({ permission: 'run:scan' })] }, async (req, reply) => {
    if (!flag(env.ENABLE_EVIDENCE_LINEAGE_BACKFILL)) {
      return reply.status(403).send(badRequest('Backfill desabilitado. Defina ENABLE_EVIDENCE_LINEAGE_BACKFILL=true.', { reason: 'backfill_disabled' }))
    }
    if (!(req.auth?.user?.role === 'admin' || req.auth?.user?.role === 'owner')) {
      return reply.status(403).send(badRequest('Backfill requer admin/owner.', { reason: 'admin_required' }))
    }
    // The heavy backfill is intentionally run via scripts/backfillEvidenceLineage.mjs.
    void recordAdminAudit({ auth: req.auth, action: 'opportunity_action', route: req.url, method: req.method, result: 'success', resourceType: 'evidence_lineage', resourceId: 'backfill', metadata: { note: 'use scripts/backfillEvidenceLineage.mjs --persist' } })
    return ok({ accepted: true, note: 'Use scripts/backfillEvidenceLineage.mjs --persist para o backfill completo (dry-run por padrão).' })
  })
}
