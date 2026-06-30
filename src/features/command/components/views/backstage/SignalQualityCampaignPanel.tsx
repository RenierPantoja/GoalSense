import { useCallback, useEffect, useState } from 'react'
import { FlaskConical, RefreshCw } from 'lucide-react'

interface CampaignSummaryDto {
  available?: boolean
  campaignId?: string
  name?: string
  status?: string
  sampleSize?: number
  windowsCompleted?: number
  targetWindows?: number
  thresholdStudyReadiness?: string
  topUsefulSignals?: Array<{ signalKind: string; count: number }>
  topNoisySignals?: Array<{ signalKind: string; count: number }>
  humanReviewQueueSize?: number
  insufficientDataRatio?: number
  notEvaluableRatio?: number
  observeOnly?: boolean
  limitations?: string[]
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-white/75">{value}</p>
    </div>
  )
}

export function SignalQualityCampaignPanel() {
  const [c, setC] = useState<CampaignSummaryDto | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/worker-control-plane/signal-quality', { cache: 'no-store' }).catch(() => null)
    setLoaded(true)
    if (!res?.ok) { setC(null); return }
    const body = await res.json().catch(() => null)
    // Campaign summary is published alongside signal quality in the public model.
    const data = body?.data ?? null
    setC(data?.campaign ?? data?.campaignSummary ?? null)
  }, [])

  useEffect(() => { void load() }, [load])

  const buttonClass = 'h-8 px-2 rounded-lg border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1'

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical size={14} className="text-[#7FE9DC]" />
        <h4 className="flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Signal quality campaign (multi-window)</h4>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-200/80">observe only</span>
        <button type="button" onClick={() => void load()} className={buttonClass}><RefreshCw size={12} />Refresh</button>
      </div>

      {(!c || c.available === false) && loaded && (
        <p className="text-[11px] text-white/50">Nenhuma campanha publicada ainda (não é falha). Rode <code>createSignalQualityCampaign.mjs</code> + <code>runSignalQualityCampaignWindow.mjs</code>.</p>
      )}

      {c && c.available !== false && (
        <>
          <p className="mb-2 text-[10px] text-white/35">{c.name} · status {c.status} · amostra pequena — observação</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="sample size" value={c.sampleSize ?? 0} />
            <Stat label="windows" value={`${c.windowsCompleted ?? 0}/${c.targetWindows ?? 0}`} />
            <Stat label="human review" value={c.humanReviewQueueSize ?? 0} />
            <Stat label="readiness" value={c.thresholdStudyReadiness ?? 'n/a'} />
            <Stat label="insufficient ratio" value={c.insufficientDataRatio ?? 0} />
            <Stat label="not-evaluable ratio" value={c.notEvaluableRatio ?? 0} />
          </div>
          {(c.topUsefulSignals?.length ?? 0) > 0 && (
            <div className="mt-3"><p className="text-[10px] uppercase tracking-[0.12em] text-white/30">top useful</p>
              <p className="text-[12px] text-white/70">{c.topUsefulSignals!.map(s => `${s.signalKind} (${s.count})`).join(' · ')}</p></div>
          )}
          {(c.topNoisySignals?.length ?? 0) > 0 && (
            <div className="mt-2"><p className="text-[10px] uppercase tracking-[0.12em] text-white/30">top noisy</p>
              <p className="text-[12px] text-white/70">{c.topNoisySignals!.map(s => `${s.signalKind} (${s.count})`).join(' · ')}</p></div>
          )}
          <p className="mt-3 text-[10px] text-amber-200/60">Readiness é observacional e não altera runtime. Sem odds, sem probabilidade, sem promessa de acerto.</p>
        </>
      )}
    </div>
  )
}
