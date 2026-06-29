import { useCallback, useEffect, useState } from 'react'
import { Gauge, RefreshCw } from 'lucide-react'

interface SignalQualitySummaryDto {
  id: string
  generatedAt: string
  sampleSize: number
  signalsReviewed: number
  reliableObserve: number
  usefulButLimited: number
  noisyMonitorOnly: number
  insufficientData: number
  misleadingCandidate: number
  pendingMoreSample: number
  topUsefulSignals: Array<{ signalKind: string; count: number }>
  topNoisySignals: Array<{ signalKind: string; count: number }>
  momentumNoiseFindings?: string[]
  governanceQualityFeedback?: string[]
  governanceFeedbackSummary?: string[]
  recommendations?: string[]
  recommendedHumanReviewCount?: number
  limitations: string[]
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-white/75">{value}</p>
    </div>
  )
}

export function LiveFirstSignalQualityPanel() {
  const [summary, setSummary] = useState<SignalQualitySummaryDto | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/worker-control-plane/signal-quality', { cache: 'no-store' }).catch(() => null)
    setLoaded(true)
    if (!res?.ok) { setSummary(null); return }
    const body = await res.json().catch(() => null)
    const data = body?.data ?? null
    // Vercel sanitized shape: { signalQualityAvailable, summary, casesPreview }
    // Local backend shape: data IS the review summary.
    if (data && typeof data === 'object' && 'signalQualityAvailable' in data) {
      setSummary(data.summary ?? null)
    } else {
      setSummary(data ?? null)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const buttonClass = 'h-8 px-2 rounded-lg border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1'

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gauge size={14} className="text-[#7FE9DC]" />
        <h4 className="flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Live-First signal quality (observe only)</h4>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-200/80">observe only</span>
        <button type="button" onClick={() => void load()} className={buttonClass} title="Refresh"><RefreshCw size={12} />Refresh</button>
      </div>

      {!summary && loaded && (
        <p className="text-[11px] text-white/50">Nenhuma revisão de qualidade publicada ainda (não é falha). Rode <code>runLiveFirstSignalQualityReview.mjs</code> após uma janela real.</p>
      )}

      {summary && (
        <>
          <p className="mb-2 text-[10px] text-white/35">amostra pequena — apenas observação · gerado {new Date(summary.generatedAt).toLocaleString()}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="sample size" value={summary.sampleSize} />
            <Stat label="reliable observe" value={summary.reliableObserve} />
            <Stat label="useful limited" value={summary.usefulButLimited} />
            <Stat label="noisy monitor" value={summary.noisyMonitorOnly} />
            <Stat label="insufficient" value={summary.insufficientData} />
            <Stat label="misleading" value={summary.misleadingCandidate} />
            <Stat label="pending sample" value={summary.pendingMoreSample} />
            <Stat label="signals" value={summary.signalsReviewed} />
          </div>

          {summary.topUsefulSignals.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">top useful</p>
              <p className="text-[12px] text-white/70">{summary.topUsefulSignals.map(s => `${s.signalKind} (${s.count})`).join(' · ')}</p>
            </div>
          )}
          {summary.topNoisySignals.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">top noisy</p>
              <p className="text-[12px] text-white/70">{summary.topNoisySignals.map(s => `${s.signalKind} (${s.count})`).join(' · ')}</p>
            </div>
          )}
          {(summary.momentumNoiseFindings?.length ?? 0) > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">momentum noise</p>
              <ul className="text-[11px] text-white/55">{(summary.momentumNoiseFindings ?? []).slice(0, 5).map((f, i) => <li key={i}>• {f}</li>)}</ul>
            </div>
          )}
          {((summary.governanceFeedbackSummary ?? summary.governanceQualityFeedback)?.length ?? 0) > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">governance feedback (observe)</p>
              <ul className="text-[11px] text-white/55">{(summary.governanceFeedbackSummary ?? summary.governanceQualityFeedback ?? []).slice(0, 5).map((f, i) => <li key={i}>• {f}</li>)}</ul>
            </div>
          )}
          {((summary.recommendations?.length ?? 0) > 0 || (summary.recommendedHumanReviewCount ?? 0) > 0) && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">recommendations (human review)</p>
              {summary.recommendations
                ? <ul className="text-[11px] text-amber-200/70">{summary.recommendations.map((r, i) => <li key={i}>• {r}</li>)}</ul>
                : <p className="text-[11px] text-amber-200/70">{summary.recommendedHumanReviewCount} item(s) recomendado(s) para revisão humana.</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
