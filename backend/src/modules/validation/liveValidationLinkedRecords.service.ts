/**
 * Live Validation Linked Records (Phase B38) — exact vs inferred grouping.
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists records related to a session by reading existing by-fixture queries for
 * the session's fixtures, classifying each as `exact_session_id` (record carries
 * validationSessionId === sessionId) or `inferred_fixture_window`. Read-only,
 * honest; legacy records without sessionId are `inferred`.
 */
import { createRepositories } from '../../repositories/index.js'
import { listSessionLinkedRecordsIndexed } from './liveValidationRecordIndex.service.js'

export type AttributionStrength = 'exact_session_id' | 'inferred_fixture_window' | 'unknown'
export type LinkedRecordSource = 'index' | 'direct_record' | 'fixture_window_fallback'

export interface LinkedRecord {
  id: string
  fixtureId: string
  label: string
  attributionStrength: AttributionStrength
  detail: string
  source?: LinkedRecordSource
}

function strengthOf(record: any, sessionId: string): AttributionStrength {
  return record?.validationSessionId === sessionId ? 'exact_session_id' : 'inferred_fixture_window'
}

async function fixtureIds(sessionId: string): Promise<{ fixtureId: string; label: string }[]> {
  const repos = createRepositories()
  const fixtures = await repos.intelligence.listLiveValidationSessionFixtures(sessionId, 500).catch(() => [])
  return (fixtures as any[]).map(f => ({ fixtureId: f.fixtureId, label: `${f.homeTeam} vs ${f.awayTeam}` }))
}

export async function listSessionAlerts(sessionId: string, limit = 200): Promise<LinkedRecord[]> {
  const repos = createRepositories()
  const out: LinkedRecord[] = []
  for (const fx of await fixtureIds(sessionId)) {
    const alerts = await repos.alerts.findByFixtureIds(fx.fixtureId).catch(() => [])
    for (const a of (alerts as any[])) {
      out.push({ id: a.id, fixtureId: fx.fixtureId, label: fx.label, attributionStrength: strengthOf(a, sessionId), detail: `${a.status ?? ''} conf ${a.confidence ?? '—'}` })
      if (out.length >= limit) return out
    }
  }
  return out
}

export async function listSessionOpportunities(sessionId: string, limit = 200): Promise<LinkedRecord[]> {
  const repos = createRepositories()
  const out: LinkedRecord[] = []
  for (const fx of await fixtureIds(sessionId)) {
    const opps = await repos.intelligence.listAutoOpportunitiesByFixture(fx.fixtureId, 50).catch(() => [])
    for (const o of (opps as any[])) {
      out.push({ id: o.id, fixtureId: fx.fixtureId, label: fx.label, attributionStrength: strengthOf(o, sessionId), detail: `${o.opportunityType} ${o.status} score ${o.score}` })
      if (out.length >= limit) return out
    }
  }
  return out
}

export async function listSessionEvidence(sessionId: string, limit = 200): Promise<LinkedRecord[]> {
  const repos = createRepositories()
  const out: LinkedRecord[] = []
  for (const fx of await fixtureIds(sessionId)) {
    const refs = await repos.intelligence.listEvidenceSnapshotReferencesByFixture(fx.fixtureId, 100).catch(() => [])
    for (const r of (refs as any[])) {
      out.push({ id: r.id, fixtureId: fx.fixtureId, label: fx.label, attributionStrength: strengthOf(r, sessionId), detail: `${r.source}/${r.evidenceKind} ${r.linkStrength}` })
      if (out.length >= limit) return out
    }
  }
  return out
}

export interface SessionOutcome extends LinkedRecord { result: string }

export async function listSessionOutcomes(sessionId: string, limit = 200): Promise<{ items: SessionOutcome[]; breakdown: Record<string, number> }> {
  const repos = createRepositories()
  const items: SessionOutcome[] = []
  const breakdown: Record<string, number> = { confirmed: 0, confirmed_partial: 0, failed: 0, unknown: 0, expired: 0, not_evaluable: 0, pending: 0 }
  for (const fx of await fixtureIds(sessionId)) {
    const alerts = await repos.alerts.findByFixtureIds(fx.fixtureId).catch(() => [])
    for (const a of (alerts as any[])) {
      const o = await repos.intelligence.getAlertOutcomeByAlertId(a.id).catch(() => null)
      const result = (o?.result as string) || 'pending'
      if (result in breakdown) breakdown[result]++; else breakdown.pending++
      items.push({ id: a.id, fixtureId: fx.fixtureId, label: fx.label, attributionStrength: o ? strengthOf(o, sessionId) : 'unknown', detail: o?.outcomeReason || 'pendente', result })
      if (items.length >= limit) return { items, breakdown }
    }
  }
  return { items, breakdown }
}

export async function listLinkedRecords(sessionId: string): Promise<{ alerts: LinkedRecord[]; opportunities: LinkedRecord[]; evidence: LinkedRecord[]; outcomes: SessionOutcome[]; outcomeBreakdown: Record<string, number>; recordLinkCoverage: { totalIndexedRecords: number; indexedRecordIds: number; source: 'index_first' | 'fixture_window_only' } }> {
  const [alerts, opportunities, evidence, outcomes, indexLinks] = await Promise.all([
    listSessionAlerts(sessionId, 100), listSessionOpportunities(sessionId, 100), listSessionEvidence(sessionId, 100), listSessionOutcomes(sessionId, 100),
    listSessionLinkedRecordsIndexed(sessionId, 2000).catch(() => []),
  ])
  // Index-first tagging: records present in the index (exact) are tagged `index`;
  // exact-by-record (validationSessionId match) but not indexed are `direct_record`;
  // everything else falls back to `fixture_window_fallback`.
  const indexedIds = new Set(indexLinks.map(l => l.recordId))
  const tag = (r: LinkedRecord): LinkedRecord => {
    if (indexedIds.has(r.id)) r.source = 'index'
    else if (r.attributionStrength === 'exact_session_id') r.source = 'direct_record'
    else r.source = 'fixture_window_fallback'
    return r
  }
  alerts.forEach(tag); opportunities.forEach(tag); evidence.forEach(tag); outcomes.items.forEach(tag)
  return {
    alerts, opportunities, evidence, outcomes: outcomes.items, outcomeBreakdown: outcomes.breakdown,
    recordLinkCoverage: { totalIndexedRecords: indexLinks.length, indexedRecordIds: indexedIds.size, source: indexLinks.length > 0 ? 'index_first' : 'fixture_window_only' },
  }
}
