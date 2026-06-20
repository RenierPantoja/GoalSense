/**
 * Manual Intelligence Intake (B41).
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets the operator enter real pre-match data while providers are not configured.
 * Manual data is ALWAYS tagged (sourceType + reliability + audit) and NEVER pretends
 * to be a provider. Non-fatal; under Noop nothing persists. Writes are gated at the
 * route layer (operator+); delete at admin+.
 */
import { randomUUID } from 'node:crypto'
import { createRepositories } from '../../repositories/index.js'
import type { ManualIntelligenceRecord, CreateManualRecordInput, ManualReliability } from './manualIntelligence.types.js'

function nowIso(): string { return new Date().toISOString() }

export function buildManualRecord(input: CreateManualRecordInput): ManualIntelligenceRecord {
  const ts = nowIso()
  const reliability: ManualReliability = input.reliability ?? (input.sourceType === 'official_club' || input.sourceType === 'official_competition' ? 'high' : input.sourceType === 'journalist_report' || input.sourceType === 'broadcast' ? 'medium' : 'unknown')
  return {
    id: `mir_${randomUUID()}`,
    fixtureId: input.fixtureId,
    teamId: input.teamId ?? null,
    side: input.side ?? 'unknown',
    domain: input.domain,
    sourceType: input.sourceType,
    sourceLabel: (input.sourceLabel || 'operador').slice(0, 160),
    sourceUrl: input.sourceUrl ?? null,
    reliability,
    enteredBy: input.enteredBy ?? null,
    enteredAt: ts,
    updatedAt: null,
    expiresAt: input.expiresAt ?? null,
    payload: input.payload ?? {},
    note: (input.note || '').slice(0, 600),
    limitations: ['Dado manual inserido pelo operador — marcado como manual, não provider.'],
    audit: [{ enteredBy: input.enteredBy ?? null, enteredAt: ts, action: 'created' }],
  }
}

export async function createManualRecord(input: CreateManualRecordInput): Promise<ManualIntelligenceRecord> {
  const record = buildManualRecord(input)
  try { await createRepositories().intelligence.saveManualIntelligenceRecord(record) } catch (e: any) { console.warn(`[B41] manual save failed (non-fatal): ${String(e?.message || e).slice(0, 60)}`) }
  return record
}

export async function updateManualRecord(id: string, patch: Partial<ManualIntelligenceRecord>, updatedBy: string | null): Promise<{ count: number }> {
  const repos = createRepositories()
  const existing = await repos.intelligence.getManualIntelligenceRecord(id).catch(() => null)
  if (!existing) return { count: 0 }
  const safe: Partial<ManualIntelligenceRecord> = {
    payload: patch.payload ?? existing.payload,
    note: patch.note !== undefined ? String(patch.note).slice(0, 600) : existing.note,
    reliability: patch.reliability ?? existing.reliability,
    sourceType: patch.sourceType ?? existing.sourceType,
    sourceLabel: patch.sourceLabel ?? existing.sourceLabel,
    sourceUrl: patch.sourceUrl ?? existing.sourceUrl,
    expiresAt: patch.expiresAt ?? existing.expiresAt,
    updatedAt: nowIso(),
    audit: [...(existing.audit || []), { enteredBy: existing.enteredBy, enteredAt: existing.enteredAt, updatedBy, updatedAt: nowIso(), action: 'updated' }],
  }
  return repos.intelligence.updateManualIntelligenceRecord(id, safe).catch(() => ({ count: 0 }))
}

export async function deleteManualRecord(id: string): Promise<{ count: number }> {
  return createRepositories().intelligence.deleteManualIntelligenceRecord(id).catch(() => ({ count: 0 }))
}

export async function listManualRecordsForFixture(fixtureId: string, limit = 100): Promise<ManualIntelligenceRecord[]> {
  try { return await createRepositories().intelligence.listManualIntelligenceRecords({ fixtureId, limit }) } catch { return [] }
}
export async function listManualRecordsForTeam(teamId: string, limit = 100): Promise<ManualIntelligenceRecord[]> {
  try { return await createRepositories().intelligence.listManualIntelligenceRecords({ teamId, limit }) } catch { return [] }
}
export async function getManualRecord(id: string): Promise<ManualIntelligenceRecord | null> {
  try { return await createRepositories().intelligence.getManualIntelligenceRecord(id) } catch { return null }
}

export function explainManualRecordUsage(record: ManualIntelligenceRecord): string {
  return `Manual (${record.sourceType}, confiabilidade ${record.reliability}) para ${record.domain} — complementa o provider, não o substitui.`
}
