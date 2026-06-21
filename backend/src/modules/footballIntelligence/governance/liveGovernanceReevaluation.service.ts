/**
 * Live Governance Re-evaluation (B47 / Bloco 4).
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-evaluates governance decisions and active holds when the game changes (lineup,
 * red card, goal, substitution, half-time, minute thresholds, domain/manual updates).
 * It NEVER sends a real alert and NEVER changes alert results — it only re-evaluates,
 * records, and (when a held signal would now alert) marks `would_now_alert`. Gated by
 * ENABLE_ALERT_GOVERNANCE_LIVE_RECHECK.
 */
import { createRepositories } from '../../../repositories/index.js'
import { liveRecheckEnabled } from './alertGovernancePolicy.service.js'
import { evaluateAlertCandidate } from './alertDecisionGovernor.service.js'
import { listActiveHoldsForFixture, resolveHold, triggerResolvesReason } from './alertGovernanceHold.service.js'
import { detectAssumptionInvalidation } from './assumptionInvalidation.service.js'
import type {
  AlertGovernanceRecheckTrigger, AlertGovernanceRun, AssumptionInvalidation, AlertDecisionGovernanceResult,
} from './alertDecisionGovernance.types.js'

let seq = 0
function runId(): string { seq = (seq + 1) % 1e9; return `agrun_${Date.now().toString(36)}_${seq.toString(36)}` }

export interface LiveReevaluationOutcome {
  run: AlertGovernanceRun
  results: AlertDecisionGovernanceResult[]
  resolvedHolds: string[]
  invalidations: AssumptionInvalidation[]
  wouldNowAlert: string[]
}

export async function handleLiveTrigger(fixtureId: string, trigger: AlertGovernanceRecheckTrigger): Promise<LiveReevaluationOutcome> {
  const repos = createRepositories()
  const run: AlertGovernanceRun = {
    id: runId(), scope: 'live_trigger', fixtureId, trigger, status: 'running', startedAt: new Date().toISOString(), finishedAt: null,
    resultsCreated: 0, holdsCreated: 0, holdsResolved: 0, invalidationsCreated: 0, notes: [], error: null,
  }
  const out: LiveReevaluationOutcome = { run, results: [], resolvedHolds: [], invalidations: [], wouldNowAlert: [] }

  if (!liveRecheckEnabled()) {
    out.run = { ...run, status: 'skipped', finishedAt: new Date().toISOString(), notes: ['Live recheck desligado (ENABLE_ALERT_GOVERNANCE_LIVE_RECHECK=false).'] }
    return out
  }
  try { await repos.intelligence.createAlertGovernanceRun(run) } catch { /* noop */ }

  // 1) Assumption invalidation for the trigger.
  const inv = await detectAssumptionInvalidation(fixtureId, trigger).catch(() => null)
  if (inv) out.invalidations.push(inv)

  // 2) Re-evaluate active holds; resolve those the trigger satisfies, then re-run governance.
  const holds = await listActiveHoldsForFixture(fixtureId).catch(() => [])
  for (const h of holds) {
    if (triggerResolvesReason(trigger, h.reason)) {
      await resolveHold(h.id, `trigger:${trigger}`).catch(() => null)
      out.resolvedHolds.push(h.id)
      const r = await evaluateAlertCandidate({ fixtureId, patternId: h.patternId, source: 'live_recheck', metadata: { trigger, fromHold: h.id } }).catch(() => null)
      if (r) {
        out.results.push(r)
        if (r.action === 'allow_alert') out.wouldNowAlert.push(r.id)
      }
    }
  }

  // 3) Also re-evaluate fixture-level governance for the new state (records would_now_alert).
  const fresh = await evaluateAlertCandidate({ fixtureId, patternId: null, source: 'live_recheck', metadata: { trigger } }).catch(() => null)
  if (fresh) {
    out.results.push(fresh)
    if (fresh.action === 'allow_alert') out.wouldNowAlert.push(fresh.id)
  }

  const finished: AlertGovernanceRun = {
    ...run, status: 'completed', finishedAt: new Date().toISOString(),
    resultsCreated: out.results.length, holdsResolved: out.resolvedHolds.length, invalidationsCreated: out.invalidations.length,
    notes: [`Trigger ${trigger}: ${out.results.length} reavaliações, ${out.resolvedHolds.length} holds resolvidos, ${out.wouldNowAlert.length} would_now_alert.`],
  }
  out.run = finished
  try { await repos.intelligence.updateAlertGovernanceRun(run.id, finished) } catch { /* noop */ }
  return out
}

export async function reEvaluateActiveHolds(fixtureId: string, trigger: AlertGovernanceRecheckTrigger): Promise<AlertDecisionGovernanceResult[]> {
  return (await handleLiveTrigger(fixtureId, trigger)).results
}
