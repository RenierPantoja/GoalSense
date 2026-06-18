/**
 * ReplayViewer — wide modal showing a fixture replayed minute-by-minute.
 * Read-only: fetches the replay timeline; creates no alerts, sends no Telegram.
 */
import { useEffect, useState } from 'react'
import { X, PlayCircle, Flag } from 'lucide-react'
import { backtestApi } from '@/services/backtestApi'
import type { ReplayRun } from '../../../backtest/backtestTypes'
import { OUTCOME_LABEL, OUTCOME_TONE } from '../../../backtest/backtestTypes'

interface Props {
  patternId: string
  fixtureId: string
  onClose: () => void
}

export function ReplayViewer({ patternId, fixtureId, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [disabled, setDisabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<ReplayRun | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null); setDisabled(false)
    backtestApi.getReplayForPatternFixture(patternId, fixtureId).then(res => {
      if (!alive) return
      if (res.disabled) { setDisabled(true); setLoading(false); return }
      if (!res.ok) { setError(res.error || 'Falha ao carregar replay'); setLoading(false); return }
      setRun(res.data); setLoading(false)
    })
    return () => { alive = false }
  }, [patternId, fixtureId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const outcomeTone = run ? OUTCOME_TONE[run.estimatedOutcome] : null

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-8" role="dialog" aria-label="Replay">
      <div className="absolute inset-0 bg-[#05080d]/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[920px] max-h-[86vh] rounded-[20px] border border-white/[0.1] bg-[#0b0f16] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-3 shrink-0">
          <div className="h-9 w-9 rounded-xl grid place-items-center bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22"><PlayCircle size={16} className="text-[#5EEAD4]" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-white/95 truncate">{run?.fixtureLabel || 'Replay'}</h3>
            <p className="text-[11px] text-white/45 truncate">{run ? `${run.patternName} · ${run.leagueName}` : 'Carregando replay…'}</p>
          </div>
          <button onClick={onClose} type="button" aria-label="Fechar" className="h-8 w-8 rounded-full grid place-items-center text-white/50 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-6 py-5 min-h-0">
          {loading && <div className="py-16 text-center text-[13px] text-white/40">Carregando replay…</div>}

          {!loading && disabled && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-6 text-center">
              <p className="text-[13px] text-amber-100/85 font-medium">Replay desabilitado neste ambiente</p>
              <p className="text-[11.5px] text-white/55 mt-1.5">Habilite <code className="text-amber-200/80">ENABLE_BACKTEST_API=true</code> no backend para usar o replay.</p>
            </div>
          )}

          {!loading && !disabled && error && (
            <div className="rounded-xl border border-rose-400/15 bg-rose-500/[0.05] px-4 py-6 text-center text-[12.5px] text-rose-200/80">{error}</div>
          )}

          {!loading && !disabled && run && (
            <>
              {run.notes.length > 0 && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 mb-4">
                  {run.notes.map((n, i) => <p key={i} className="text-[12px] text-white/60">{n}</p>)}
                </div>
              )}

              {run.timeline.length > 0 && (
                <>
                  {/* Outcome banner */}
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <span className={`inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-lg border ${run.wouldTrigger ? 'bg-[#13B8A6]/[0.08] border-[#2DD4BF]/20 text-[#7FE9DC]' : 'bg-white/[0.03] border-white/[0.08] text-white/55'}`}>
                      <Flag size={13} />{run.wouldTrigger ? `Dispararia aos ${run.firstTriggerMinute ?? '?'}'` : 'Não dispararia'}
                    </span>
                    {run.wouldTrigger && outcomeTone && (
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border ${outcomeTone.bg} ${outcomeTone.border} ${outcomeTone.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${outcomeTone.dot}`} />Resultado: {OUTCOME_LABEL[run.estimatedOutcome]}
                      </span>
                    )}
                    <span className="text-[11px] text-white/40">{run.snapshotsEvaluated} snapshots</span>
                  </div>
                  {run.outcomeReason && <p className="text-[11.5px] text-white/55 mb-4 leading-relaxed">{run.outcomeReason}</p>}

                  {/* Timeline */}
                  <div className="relative pl-5">
                    <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/[0.08]" />
                    <div className="space-y-2">
                      {run.timeline.map((p, i) => (
                        <div key={i} className="relative">
                          <span className={`absolute -left-[14px] top-2 h-2.5 w-2.5 rounded-full border-2 border-[#0b0f16] ${p.wouldTrigger ? 'bg-[#2DD4BF]' : p.blockers.length > 0 ? 'bg-amber-400/60' : 'bg-white/25'}`} />
                          <div className={`rounded-lg border px-3 py-2 ${p.wouldTrigger ? 'border-[#2DD4BF]/25 bg-[#13B8A6]/[0.05]' : 'border-white/[0.06] bg-white/[0.012]'}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] font-semibold tabular-nums text-white/85 w-10 shrink-0">{p.minute == null ? "?'" : `${p.minute}'`}</span>
                              <span className="text-[11px] text-white/45 tabular-nums">{p.score.home}–{p.score.away}</span>
                              <span className="text-[10px] text-white/30">{p.status}</span>
                              <span className="text-[10px] text-white/30">conf {p.confidence}</span>
                              <span className="text-[10px] text-white/30">dados {p.dataQuality}</span>
                            </div>
                            <p className="text-[11.5px] text-white/65 mt-1 leading-snug">{p.explanation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/[0.07] shrink-0 flex items-center justify-between">
          <span className="text-[10.5px] text-white/35">Replay é somente leitura — não cria alertas nem envia Telegram.</span>
          <button onClick={onClose} type="button" className="px-4 py-2 rounded-lg text-[12px] font-medium text-white/70 hover:text-white/95 border border-white/[0.08] hover:border-white/[0.14] transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  )
}
