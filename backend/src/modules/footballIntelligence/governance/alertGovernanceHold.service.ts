/**
 * Alert Governance Hold / Watchlist (B47 / Bloco 4).
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores signals that should NOT alert now but must be re-evaluated when new info
 * arrives (lineup, critical domain, mapping, manual review, live confirmation). A
 * hold is not an alert, never sends Telegram, never a bet, always has a TTL and a
 * nextRecommendedCheckAt. Non-fatal; persists only under Firebase.
 */
import { createRepositories } from '../../../repositories/index.js'
import { holdsEnabled, holdTtlMinutes, shouldCreateHold } from './alertGovernancePolicy.service.js'
import type {
  AlertDecisionGovernanceResult, AlertGovernanceHold, AlertGovernanceHoldReason, AlertGovernanceRecheckTrigger,
} from './alertDecisionGovernance.types.js'

let seq = 0
function holdId(fixtureId: string, patternId: string | null, reason: AlertGovernanceHoldReason): string {
  return `agh_${fixtureId}__${patternId ?? 'fixture'}__${reason}`
}
function nextCheckAt(reason: AlertGovernanceHoldReason): string {
  // Conservative re-check cadence by reason.
  const minutes = reason === 'live_confirmation_pending' ? 5 : reason === 'lineup_pending' ? 15 : 30
  return new Date(Date.now() + minutes * 60000).toISOString()
}

export async function createHoldFromDecision(result: AlertDecisionGovernanceResult): Promise<AlertGovernanceHold | null> {
  if (!holdsEnabled()) return null
  const reason = shouldCreateHold(result.action)
  if (!reason) return null
  const now = Date.now()
  const hold: AlertGovernanceHold = {
    id: holdId(result.fixtureId, result.patternId, reason),
    fixtureId: result.fixtureId, patternId: result.patternId, source: result.source, reason,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + holdTtlMinutes() * 60000).toISOString(),
    status: 'active', lastEvaluationId: result.id, nextRecommendedCheckAt: nextCheckAt(reason),
    evidenceRefs: result.evidenceRefs, limitations: ['Hold é "esperar e reavaliar" — não é alerta, não envia Telegram, não é aposta; expira.'],
  }
  try { await createRepositories().intelligence.saveAlertGovernanceHold(hold) } catch { /* noop */ }
  return hold
}

export async function listActiveHoldsForFixture(fixtureId: string): Promise<AlertGovernanceHold[]> {
  try {
    const holds = await createRepositories().intelligence.listAlertGovernanceHolds({ fixtureId, limit: 100 })
    return holds.filter(h => h.status === 'active')
  } catch { return [] }
}

export async function resolveHold(holdId: string, reason = 'resolved'): Promise<{ count: number }> {
  try { return await createRepositories().intelligence.updateAlertGovernanceHold(holdId, { status: 'resolved', limitations: [`Resolvido: ${reason}`] }) } catch { return { count: 0 } }
}

export async function cancelHold(holdId: string, reason = 'cancelled'): Promise<{ count: number }> {
  try { return await createRepositories().intelligence.updateAlertGovernanceHold(holdId, { status: 'cancelled', limitations: [`Cancelado: ${reason}`] }) } catch { return { count: 0 } }
}

export async function expireOldHolds(): Promise<number> {
  const repos = createRepositories()
  let expired = 0
  try {
    const holds = await repos.intelligence.listAlertGovernanceHolds({ status: 'active', limit: 500 })
    const now = Date.now()
    for (const h of holds) {
      if (new Date(h.expiresAt).getTime() < now) {
        await repos.intelligence.updateAlertGovernanceHold(h.id, { status: 'expired' }).catch(() => null)
        expired++
      }
    }
  } catch { /* noop */ }
  return expired
}

/** A trigger that "satisfies" a hold reason → the hold can be re-checked/resolved. */
export function triggerResolvesReason(trigger: AlertGovernanceRecheckTrigger, reason: AlertGovernanceHoldReason): boolean {
  switch (reason) {
    case 'lineup_pending': return trigger === 'lineup_confirmed' || trigger === 'lineup_changed'
    case 'domain_pending': return trigger === 'domain_refreshed'
    case 'mapping_pending': return trigger === 'mapping_confirmed'
    case 'manual_review_pending': return trigger === 'manual_record_created'
    case 'live_confirmation_pending': return trigger === 'goal' || trigger === 'red_card' || trigger === 'substitution' || trigger === 'minute_threshold' || trigger === 'half_time'
    case 'conflict_pending': return trigger === 'manual_record_created' || trigger === 'mapping_confirmed'
    default: return false
  }
}

export async function explainHold(holdId: string): Promise<string> {
  const h = await createRepositories().intelligence.getAlertGovernanceHold(holdId).catch(() => null)
  if (!h) return 'Hold não encontrado.'
  return `Hold ${h.reason} (${h.status}) — próxima checagem ${h.nextRecommendedCheckAt ?? 'n/d'}, expira ${h.expiresAt}.`
}
