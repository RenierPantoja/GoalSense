/**
 * Live Validation Record Index (Phase B39) — auxiliary session→record links.
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent, non-fatal links from a session to the records it produced. Lets the
 * Lab query by session in one indexed read instead of fanning out per fixture.
 * Never the source of truth; legacy data falls back to fixture/window grouping.
 * `inferred` never pretends to be `exact`.
 */
import { createRepositories } from '../../repositories/index.js'
import { buildRecordLinkId } from './utils/liveValidationIndex.util.js'
import type { LiveValidationRecordLink, LiveValidationRecordType, AttributionStrength } from './liveValidationIndex.types.js'

export { buildRecordLinkId } from './utils/liveValidationIndex.util.js'

export interface LinkRecordInput {
  validationSessionId: string
  sessionName?: string | null
  recordType: LiveValidationRecordType
  recordId: string
  fixtureId?: string | null
  alertId?: string | null
  opportunityId?: string | null
  outcomeId?: string | null
  policyEvaluationId?: string | null
  evidenceReferenceId?: string | null
  snapshotId?: string | null
  source?: string
  attributionStrength?: AttributionStrength
  linkReason?: string
  limitations?: string[]
}

function toLink(i: LinkRecordInput, now: string): LiveValidationRecordLink {
  return {
    id: buildRecordLinkId(i),
    validationSessionId: i.validationSessionId,
    sessionId: i.validationSessionId,
    sessionName: i.sessionName ?? null,
    recordType: i.recordType,
    recordId: i.recordId,
    fixtureId: i.fixtureId ?? null,
    providerFixtureId: null,
    alertId: i.alertId ?? null,
    opportunityId: i.opportunityId ?? null,
    outcomeId: i.outcomeId ?? null,
    policyEvaluationId: i.policyEvaluationId ?? null,
    evidenceReferenceId: i.evidenceReferenceId ?? null,
    snapshotId: i.snapshotId ?? null,
    createdAt: now,
    source: i.source || 'writer',
    attributionStrength: i.attributionStrength || 'exact_session_id',
    linkReason: i.linkReason || 'created during running session',
    limitations: i.limitations ?? [],
  }
}

/** Create one record link (idempotent, non-fatal). */
export async function linkRecordToSession(input: LinkRecordInput): Promise<void> {
  if (!input.validationSessionId || !input.recordId) return
  try {
    const repos = createRepositories()
    await repos.intelligence.createLiveValidationRecordLink(toLink(input, new Date().toISOString()))
  } catch (e: any) {
    console.warn(`[B39] record link failed (non-fatal): ${String(e?.message || e).slice(0, 80)}`)
  }
}

export async function linkRecordsToSessionBatch(inputs: LinkRecordInput[]): Promise<{ created: number }> {
  const valid = inputs.filter(i => i.validationSessionId && i.recordId)
  if (valid.length === 0) return { created: 0 }
  try {
    const now = new Date().toISOString()
    const repos = createRepositories()
    return await repos.intelligence.createLiveValidationRecordLinksBatch(valid.map(i => toLink(i, now)))
  } catch (e: any) {
    console.warn(`[B39] record link batch failed (non-fatal): ${String(e?.message || e).slice(0, 80)}`)
    return { created: 0 }
  }
}

export async function listSessionLinkedRecordsIndexed(validationSessionId: string, limit = 1000): Promise<LiveValidationRecordLink[]> {
  const repos = createRepositories()
  try { return await repos.intelligence.listLiveValidationRecordLinksBySession(validationSessionId, limit) } catch { return [] }
}

export interface RecordLinkCoverage { totalLinks: number; byType: Record<string, number>; exact: number; inferred: number; unknown: number }

export async function getRecordLinkCoverage(validationSessionId: string): Promise<RecordLinkCoverage> {
  const links = await listSessionLinkedRecordsIndexed(validationSessionId, 2000)
  const byType: Record<string, number> = {}
  let exact = 0, inferred = 0, unknown = 0
  for (const l of links) {
    byType[l.recordType] = (byType[l.recordType] || 0) + 1
    if (l.attributionStrength === 'exact_session_id') exact++
    else if (l.attributionStrength === 'inferred_fixture_window') inferred++
    else unknown++
  }
  return { totalLinks: links.length, byType, exact, inferred, unknown }
}
