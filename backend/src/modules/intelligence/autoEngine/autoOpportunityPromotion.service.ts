/**
 * Auto Opportunity Promotion (Phase B21) — turn an opportunity into a radar PROPOSAL.
 * ─────────────────────────────────────────────────────────────────────────────
 * `buildPromotionPlan` is PURE (no repo/env) so it is unit-smoke-testable. It only
 * converts REAL evidence into editable suggestions. It NEVER saves a pattern, never
 * activates a radar, never creates an alert, never invents a condition. When the
 * opportunity has no evidence beyond `is_live`, it returns `sufficient: false` with
 * an honest limitation.
 */
import { createRepositories } from '../../../repositories/index.js'
import type { AutoOpportunityPromotionPlan } from './autoEngine.types.js'
import { buildPromotionPlan } from './utils/autoOpportunityPromotion.util.js'

export { buildPromotionPlan }
export async function createPromotionPlanForOpportunity(opportunityId: string): Promise<{ ok: boolean; plan: AutoOpportunityPromotionPlan | null; error?: string }> {
  const repos = createRepositories()
  const opp = await repos.intelligence.getAutoOpportunity(opportunityId)
  if (!opp) return { ok: false, plan: null, error: 'Oportunidade não encontrada.' }
  const plan = buildPromotionPlan(opp)
  try { await repos.intelligence.createAutoOpportunityPromotionPlan(plan) } catch { /* never block — plan is still returned */ }
  return { ok: true, plan }
}

export async function getPromotionPlan(opportunityId: string): Promise<AutoOpportunityPromotionPlan | null> {
  const repos = createRepositories()
  return repos.intelligence.getAutoOpportunityPromotionPlan(opportunityId).catch(() => null)
}
