/**
 * Local Live Re-evaluation Bridge (B49 / Bloco 6) — safe, flag-gated.
 * ─────────────────────────────────────────────────────────────────────────────
 * Connects the live monitor to governance re-evaluation SAFELY: OFF by default
 * (ENABLE_LOCAL_LIVE_RECHECK_BRIDGE=false), rate-limited per fixture, observe-only. It
 * NEVER sends an alert and NEVER blocks one — it only re-evaluates governance/holds via
 * the B47 live re-evaluation engine. Non-fatal.
 */
import { env } from '../../../env.js'
import { handleLiveTrigger } from '../governance/liveGovernanceReevaluation.service.js'
import type { AlertGovernanceRecheckTrigger } from '../governance/alertDecisionGovernance.types.js'

export function isBridgeEnabled(): boolean { return String(env.ENABLE_LOCAL_LIVE_RECHECK_BRIDGE).toLowerCase() === 'true' }
function minIntervalMs(): number { return Number(env.LOCAL_LIVE_RECHECK_MIN_INTERVAL_SECONDS ?? 60) * 1000 }

const lastRecheckAt = new Map<string, number>()
const queue: Array<{ fixtureId: string; trigger: AlertGovernanceRecheckTrigger }> = []

/** PURE: derive relevant governance triggers from a snapshot transition. */
export function detectRelevantLiveTriggers(snapshot: any, previousSnapshot: any | null): AlertGovernanceRecheckTrigger[] {
  const triggers: AlertGovernanceRecheckTrigger[] = []
  if (!snapshot) return triggers
  const prevStatus = previousSnapshot?.status
  const status = snapshot.status
  if (status && prevStatus && status !== prevStatus) triggers.push('match_status_changed')
  if (status === 'HT' && prevStatus !== 'HT') triggers.push('half_time')
  if ((status === 'FT' || status === 'AET' || status === 'PEN') && prevStatus !== status) triggers.push('post_match_completed')
  const prevGoals = (previousSnapshot?.scoreHome ?? 0) + (previousSnapshot?.scoreAway ?? 0)
  const goals = (snapshot.scoreHome ?? 0) + (snapshot.scoreAway ?? 0)
  if (goals > prevGoals) triggers.push('goal')
  // Red card detection from event deltas, when available.
  try {
    const evs = snapshot.eventsJson ? JSON.parse(snapshot.eventsJson) : []
    if (Array.isArray(evs) && evs.some((e: any) => e?.type === 'red_card')) {
      const prevEvs = previousSnapshot?.eventsJson ? JSON.parse(previousSnapshot.eventsJson) : []
      const prevReds = Array.isArray(prevEvs) ? prevEvs.filter((e: any) => e?.type === 'red_card').length : 0
      const reds = evs.filter((e: any) => e?.type === 'red_card').length
      if (reds > prevReds) triggers.push('red_card')
    }
  } catch { /* ignore parse */ }
  return triggers
}

export function enqueueGovernanceRecheck(fixtureId: string, trigger: AlertGovernanceRecheckTrigger): boolean {
  if (!isBridgeEnabled()) return false
  const now = Date.now()
  const last = lastRecheckAt.get(fixtureId) ?? 0
  if (now - last < minIntervalMs()) return false // rate-limited per fixture
  lastRecheckAt.set(fixtureId, now)
  queue.push({ fixtureId, trigger })
  return true
}

export async function onLiveSnapshotCaptured(snapshot: any, previousSnapshot: any | null = null): Promise<{ enqueued: AlertGovernanceRecheckTrigger[] }> {
  if (!isBridgeEnabled() || !snapshot?.fixtureId) return { enqueued: [] }
  const triggers = detectRelevantLiveTriggers(snapshot, previousSnapshot)
  const enqueued: AlertGovernanceRecheckTrigger[] = []
  for (const t of triggers) { if (enqueueGovernanceRecheck(snapshot.fixtureId, t)) enqueued.push(t) }
  return { enqueued }
}

export async function processRecheckQueue(max = 20): Promise<number> {
  if (!isBridgeEnabled()) return 0
  let processed = 0
  while (queue.length > 0 && processed < max) {
    const item = queue.shift()!
    await handleLiveTrigger(item.fixtureId, item.trigger).catch(() => null)
    processed++
  }
  return processed
}

export function explainLiveRecheckBridgeStatus(): { enabled: boolean; mode: string; minIntervalSeconds: number; queued: number } {
  return { enabled: isBridgeEnabled(), mode: String(env.LOCAL_LIVE_RECHECK_BRIDGE_MODE), minIntervalSeconds: Number(env.LOCAL_LIVE_RECHECK_MIN_INTERVAL_SECONDS ?? 60), queued: queue.length }
}
