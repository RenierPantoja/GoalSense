/**
 * Governance Calibration Review (B48 / Bloco 5).
 * ─────────────────────────────────────────────────────────────────────────────
 * Controlled human review of calibration suggestions. "Accept" NEVER applies a change
 * automatically — it only marks the suggestion for FUTURE implementation. Every review
 * is audited (caller records admin audit). Nothing here changes runtime/score/patterns/
 * enforce.
 */
import { createRepositories } from '../../../repositories/index.js'
import type {
  GovernanceCalibrationSuggestion, VariableInfluenceCalibrationSuggestion, CalibrationReviewStatus,
} from './causalLearning.types.js'

export interface GovernanceCalibrationReport {
  governanceSuggestions: GovernanceCalibrationSuggestion[]
  influenceSuggestions: VariableInfluenceCalibrationSuggestion[]
  pendingCount: number
  acceptedForFutureCount: number
  limitations: string[]
}

export async function buildGovernanceCalibrationReport(): Promise<GovernanceCalibrationReport> {
  const repos = createRepositories()
  const [gov, inf] = await Promise.all([
    repos.intelligence.listGovernanceCalibrationSuggestions(200).catch(() => []),
    repos.intelligence.listVariableInfluenceCalibrationSuggestions(200).catch(() => []),
  ])
  const all = [...gov, ...inf]
  return {
    governanceSuggestions: gov, influenceSuggestions: inf,
    pendingCount: all.filter(s => s.reviewStatus === 'pending').length,
    acceptedForFutureCount: all.filter(s => s.reviewStatus === 'accepted_for_future').length,
    limitations: ['Aceitar não aplica mudança — apenas marca para implementação futura; tudo exige revisão humana.'],
  }
}

export async function listGovernanceCalibrationSuggestions(): Promise<GovernanceCalibrationSuggestion[]> {
  try { return await createRepositories().intelligence.listGovernanceCalibrationSuggestions(200) } catch { return [] }
}
export async function listInfluenceCalibrationSuggestions(): Promise<VariableInfluenceCalibrationSuggestion[]> {
  try { return await createRepositories().intelligence.listVariableInfluenceCalibrationSuggestions(200) } catch { return [] }
}

async function updateStatus(suggestionId: string, status: CalibrationReviewStatus, reviewedBy: string | null): Promise<{ count: number; kind: 'governance' | 'influence' | 'none' }> {
  const repos = createRepositories()
  const patch = { reviewStatus: status, reviewedAt: new Date().toISOString(), reviewedBy }
  const gov = await repos.intelligence.getGovernanceCalibrationSuggestion(suggestionId).catch(() => null)
  if (gov) { const r = await repos.intelligence.updateGovernanceCalibrationSuggestion(suggestionId, patch as any).catch(() => ({ count: 0 })); return { ...r, kind: 'governance' } }
  const inf = await repos.intelligence.getVariableInfluenceCalibrationSuggestion(suggestionId).catch(() => null)
  if (inf) { const r = await repos.intelligence.updateVariableInfluenceCalibrationSuggestion(suggestionId, patch as any).catch(() => ({ count: 0 })); return { ...r, kind: 'influence' } }
  return { count: 0, kind: 'none' }
}

export async function markSuggestionReviewed(suggestionId: string, reviewedBy: string | null = null): Promise<{ count: number; kind: string }> {
  return updateStatus(suggestionId, 'reviewed', reviewedBy)
}
export async function rejectSuggestion(suggestionId: string, reviewedBy: string | null = null): Promise<{ count: number; kind: string }> {
  return updateStatus(suggestionId, 'rejected', reviewedBy)
}
/** Marks for FUTURE implementation only — never applies a runtime change. */
export async function acceptSuggestionForFutureImplementation(suggestionId: string, reviewedBy: string | null = null): Promise<{ count: number; kind: string }> {
  return updateStatus(suggestionId, 'accepted_for_future', reviewedBy)
}
