/**
 * evidenceLineageApi (Phase B33) — read-only lineage queries + admin backfill.
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses the token-aware apiClient. Reads return honest empty bundles when nothing
 * is linked. Backfill is admin/owner + env-gated on the backend.
 */
import { apiFetch } from './apiClient'
import type {
  EvidenceLineageBundleDto, EvidenceSnapshotReferenceDto, EvidenceLineageSearchParams,
} from '@/features/command/intelligence/evidenceLineageTypes'

const BASE = '/api/intelligence/evidence-lineage'

export const evidenceLineageApi = {
  getSnapshotLineage(snapshotId: string) { return apiFetch<EvidenceLineageBundleDto>(`${BASE}/snapshots/${encodeURIComponent(snapshotId)}`) },
  getFixtureLineage(fixtureId: string) { return apiFetch<EvidenceLineageBundleDto>(`${BASE}/fixtures/${encodeURIComponent(fixtureId)}`) },
  getAlertLineage(alertId: string) { return apiFetch<EvidenceLineageBundleDto>(`${BASE}/alerts/${encodeURIComponent(alertId)}`) },
  getOpportunityLineage(opportunityId: string) { return apiFetch<EvidenceLineageBundleDto>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}`) },
  searchEvidenceLineage(params: EvidenceLineageSearchParams) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v != null) q.set(k, String(v)) })
    return apiFetch<EvidenceSnapshotReferenceDto[]>(`${BASE}/search?${q.toString()}`)
  },
  runEvidenceBackfill() { return apiFetch<{ accepted: boolean; note: string }>(`${BASE}/backfill`, { method: 'POST', body: '{}' }) },
}
