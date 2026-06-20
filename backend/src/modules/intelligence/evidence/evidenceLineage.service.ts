/**
 * Evidence Lineage Service (Phase B33).
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralizes creation and querying of snapshot↔decision evidence links. All
 * writes are idempotent (deterministic ids) and NON-FATAL for callers. Inferred
 * links never pretend to be exact; `unknown` never authorizes a delete.
 */
import { createRepositories } from '../../../repositories/index.js'
import {
  buildReference, strongerLink, isExactLink, linkProtects, sourceToProtectionReason,
} from './evidenceLineage.util.js'
import type {
  LinkSnapshotInput, EvidenceSnapshotReference, EvidenceLineageBundle, EvidenceTimelineEntry,
} from './evidenceLineage.types.js'

// ── Link creation ────────────────────────────────────────────────────────────

/** Create one evidence link. Returns the reference (idempotent). Never throws. */
export async function linkSnapshotToSource(input: LinkSnapshotInput): Promise<EvidenceSnapshotReference | null> {
  try {
    const ref = buildReference(input, new Date().toISOString())
    const repos = createRepositories()
    await repos.intelligence.createEvidenceSnapshotReference(ref)
    return ref
  } catch (e: any) {
    console.warn(`[B33] evidence link failed (non-fatal): ${String(e?.message || e).slice(0, 80)}`)
    return null
  }
}

/** Create many evidence links in a batch. Never throws. */
export async function linkSnapshotsToSource(inputs: LinkSnapshotInput[]): Promise<{ created: number }> {
  if (inputs.length === 0) return { created: 0 }
  try {
    const now = new Date().toISOString()
    const refs = inputs.map(i => buildReference(i, now))
    const repos = createRepositories()
    return await repos.intelligence.createEvidenceSnapshotReferencesBatch(refs)
  } catch (e: any) {
    console.warn(`[B33] evidence batch link failed (non-fatal): ${String(e?.message || e).slice(0, 80)}`)
    return { created: 0 }
  }
}

// ── Bundle building ──────────────────────────────────────────────────────────

function toTimeline(refs: EvidenceSnapshotReference[]): EvidenceTimelineEntry[] {
  return [...refs]
    .map(r => ({ snapshotId: r.snapshotId, capturedAt: r.capturedAt, minute: r.minute, linkStrength: r.linkStrength, source: r.source, evidenceKind: r.evidenceKind }))
    .sort((a, b) => {
      const ca = a.capturedAt || ''; const cb = b.capturedAt || ''
      if (ca !== cb) return ca.localeCompare(cb)
      return (a.minute ?? -1) - (b.minute ?? -1)
    })
}

function bundleFrom(fixtureId: string, refs: EvidenceSnapshotReference[]): EvidenceLineageBundle {
  const exactLinks = refs.filter(r => isExactLink(r))
  const unknownLinks = refs.filter(r => r.linkStrength === 'unknown')
  const inferredLinks = refs.filter(r => !isExactLink(r) && r.linkStrength !== 'unknown')
  const snapshotIds = [...new Set(refs.map(r => r.snapshotId).filter((s): s is string => !!s))]
  const sources = [...new Set(refs.map(r => r.source))]
  const protectionReasons = [...new Set(refs.filter(r => linkProtects(r)).map(r => sourceToProtectionReason(r.source)))]
  const limitations: string[] = []
  if (exactLinks.length === 0 && refs.length > 0) limitations.push('Nenhum vínculo exato — proteção/linhagem é inferida (fixture/janela).')
  if (refs.length === 0) limitations.push('Sem vínculos de evidência registrados para este alvo.')
  if (unknownLinks.length > 0) limitations.push('Há vínculos unknown — não autorizam exclusão por si só.')
  return { fixtureId, snapshotIds, exactLinks, inferredLinks, unknownLinks, sources, timeline: toTimeline(refs), protectionReasons, limitations }
}

export async function buildFixtureLineageBundle(fixtureId: string): Promise<EvidenceLineageBundle> {
  const repos = createRepositories()
  let refs: EvidenceSnapshotReference[] = []
  try { refs = await repos.intelligence.listEvidenceSnapshotReferencesByFixture(fixtureId, 500) } catch { /* honest empty */ }
  return bundleFrom(fixtureId, refs)
}

export async function buildSnapshotLineage(snapshotId: string): Promise<EvidenceLineageBundle> {
  const repos = createRepositories()
  let refs: EvidenceSnapshotReference[] = []
  try { refs = await repos.intelligence.listEvidenceSnapshotReferencesBySnapshot(snapshotId, 200) } catch { /* honest empty */ }
  const fixtureId = refs[0]?.fixtureId || ''
  return bundleFrom(fixtureId, refs)
}

export async function buildAlertEvidenceLineage(alertId: string): Promise<EvidenceLineageBundle> {
  const repos = createRepositories()
  let refs: EvidenceSnapshotReference[] = []
  try { refs = await repos.intelligence.listEvidenceSnapshotReferencesByAlert(alertId, 200) } catch { /* honest empty */ }
  const fixtureId = refs[0]?.fixtureId || ''
  const bundle = bundleFrom(fixtureId, refs)
  if (refs.length === 0) bundle.limitations = ['Este alerta foi criado antes do índice de evidências ou não possui snapshot vinculado.']
  return bundle
}

export async function buildOpportunityEvidenceLineage(opportunityId: string): Promise<EvidenceLineageBundle> {
  const repos = createRepositories()
  let refs: EvidenceSnapshotReference[] = []
  try { refs = await repos.intelligence.listEvidenceSnapshotReferencesByOpportunity(opportunityId, 200) } catch { /* honest empty */ }
  const fixtureId = refs[0]?.fixtureId || ''
  return bundleFrom(fixtureId, refs)
}

/** Protection summary for a snapshot: precise reasons from exact/inferred links. */
export interface SnapshotEvidenceProtection {
  hasExactLink: boolean
  hasInferredLink: boolean
  protectionReasons: string[]
  strongestStrength: string
}

export async function findProtectedSnapshotsForSource(snapshotId: string): Promise<SnapshotEvidenceProtection> {
  const repos = createRepositories()
  let refs: EvidenceSnapshotReference[] = []
  try { refs = await repos.intelligence.listEvidenceSnapshotReferencesBySnapshot(snapshotId, 200) } catch { /* honest empty */ }
  let strongest: any = 'unknown'
  const reasons = new Set<string>()
  let hasExact = false, hasInferred = false
  for (const r of refs) {
    strongest = strongerLink(strongest, r.linkStrength)
    if (isExactLink(r)) hasExact = true
    else if (r.linkStrength !== 'unknown') hasInferred = true
    if (linkProtects(r)) reasons.add(sourceToProtectionReason(r.source))
  }
  return { hasExactLink: hasExact, hasInferredLink: hasInferred, protectionReasons: [...reasons], strongestStrength: strongest }
}

export async function searchEvidenceLineage(params: { snapshotId?: string; fixtureId?: string; alertId?: string; opportunityId?: string; source?: string; sourceId?: string; limit?: number }): Promise<EvidenceSnapshotReference[]> {
  const repos = createRepositories()
  try {
    if (params.snapshotId) return await repos.intelligence.listEvidenceSnapshotReferencesBySnapshot(params.snapshotId, params.limit)
    if (params.alertId) return await repos.intelligence.listEvidenceSnapshotReferencesByAlert(params.alertId, params.limit)
    if (params.opportunityId) return await repos.intelligence.listEvidenceSnapshotReferencesByOpportunity(params.opportunityId, params.limit)
    if (params.source && params.sourceId) return await repos.intelligence.listEvidenceSnapshotReferencesBySource(params.source, params.sourceId, params.limit)
    if (params.fixtureId) return await repos.intelligence.listEvidenceSnapshotReferencesByFixture(params.fixtureId, params.limit)
    return await repos.intelligence.listEvidenceSnapshotReferences(params.limit)
  } catch { return [] }
}
