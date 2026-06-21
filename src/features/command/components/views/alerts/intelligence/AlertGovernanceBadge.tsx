/**
 * AlertGovernanceBadge (B48 follow-up to B47).
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight, self-contained, read-only badge for the alert drawer/list: shows the
 * governance decision for an alert (allow/monitor/wait/block), `would_block`/`would_wait`
 * in shadow, link strength and (if present) a causal classification. Advisory only;
 * never blocks; never a probability. Fails silently (renders nothing) on env-gate/error.
 */
import { useEffect, useState } from 'react'
import { alertGovernanceApi } from '@/services/alertGovernanceApi'
import { causalLearningApi } from '@/services/causalLearningApi'
import { GOV_ACTION_LABEL } from '@/features/matchIntelligence/alertGovernanceTypes'
import { CAUSAL_CLASSIFICATION_LABEL } from '@/features/matchIntelligence/causalLearningTypes'

function tone(a: string): string {
  return a === 'allow_alert' ? 'border-emerald-400/25 text-emerald-200/85'
    : a === 'block_alert' || a === 'stay_out' ? 'border-rose-400/25 text-rose-200/80'
      : a.startsWith('wait_') ? 'border-amber-400/25 text-amber-100/85'
        : 'border-white/10 text-white/50'
}

export function AlertGovernanceBadge({ alertId, fixtureId }: { alertId: string | null; fixtureId: string | null }) {
  const [action, setAction] = useState<string | null>(null)
  const [mode, setMode] = useState<string>('observe')
  const [wouldBlock, setWouldBlock] = useState(false)
  const [wouldWait, setWouldWait] = useState(false)
  const [causal, setCausal] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (!alertId || !fixtureId) return
    void (async () => {
      const g = await alertGovernanceApi.getFixtureGovernance(fixtureId)
      if (!alive || !g.ok || !g.data) return
      setMode(g.data.mode)
      const match = g.data.results.find(r => r.candidateAlertId === alertId) || g.data.results[0]
      if (match) {
        setAction(match.action)
        setWouldBlock(!!match.wouldHaveBlocked && !match.actuallyBlocked)
        setWouldWait(!!match.action && match.action.startsWith('wait_'))
      }
      const cc = await causalLearningApi.listFixtureCausalCases(fixtureId)
      if (alive && cc.ok && cc.data) {
        const cCase = cc.data.find(c => c.alertId === alertId)
        if (cCase) setCausal(cCase.classification)
      }
    })()
    return () => { alive = false }
  }, [alertId, fixtureId])

  if (!action) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full border ${tone(action)}`}>gov: {GOV_ACTION_LABEL[action] || action}</span>
      {(mode === 'observe' || mode === 'shadow' || mode === 'shadow_block') && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-sky-400/20 text-sky-200/70">{mode} · não bloqueia</span>}
      {wouldBlock && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/45">would_block</span>}
      {wouldWait && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/45">would_wait</span>}
      {causal && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/50">causal: {CAUSAL_CLASSIFICATION_LABEL[causal] || causal}</span>}
    </div>
  )
}
