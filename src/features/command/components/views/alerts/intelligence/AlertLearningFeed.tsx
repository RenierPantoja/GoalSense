/**
 * AlertLearningFeed — what the engine is observing (B13 learning + recommendations).
 * Observations only: never auto-applies, never alters radars, never fakes strength.
 */
import { useEffect, useState } from 'react'
import { GraduationCap, Lightbulb } from 'lucide-react'
import { alertIntelligenceApi, isAlertIntelligenceConfigured } from '@/services/alertIntelligenceApi'
import type { LearningRecommendation, LearningOverview } from '../../../../intelligence/alertIntelligenceTypes'
import { SAMPLE_QUALITY_LABEL } from '../../../../intelligence/alertIntelligenceTypes'
import { LearningEventDrawer } from './LearningEventDrawer'
import type { AlertIntelFilters } from '../../../../intelligence/alertIntelligenceTypes'

const STRENGTH_TONE: Record<string, string> = {
  high: 'text-emerald-200/85 bg-emerald-500/[0.08] border-emerald-400/20',
  medium: 'text-[#7FE9DC]/85 bg-[#13B8A6]/[0.08] border-[#2DD4BF]/20',
  low: 'text-white/55 bg-white/[0.03] border-white/[0.08]',
}

export function AlertLearningFeed({ onGoToBacktest, onOpenFilteredList }: { onGoToBacktest?: () => void; onOpenFilteredList?: (filters: AlertIntelFilters) => void }) {
  const configured = isAlertIntelligenceConfigured()
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<LearningOverview | null>(null)
  const [recs, setRecs] = useState<LearningRecommendation[]>([])
  const [openEventId, setOpenEventId] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) { setLoading(false); return }
    let alive = true
    Promise.all([alertIntelligenceApi.getLearningOverview(), alertIntelligenceApi.getLearningRecommendations()]).then(([o, r]) => {
      if (!alive) return
      setOverview(o); setRecs(r || []); setLoading(false)
    })
    return () => { alive = false }
  }, [configured])

  if (!configured) return <Empty title="Conecte um backend" body="Os aprendizados do motor vêm da memória de inteligência (B13)." />
  if (loading) return <div className="py-16 text-center text-[13px] text-white/40">Carregando aprendizados…</div>

  const hasContent = (overview && (overview.recentLearningEvents.length > 0 || overview.totalAlertsTracked > 0)) || recs.length > 0
  if (!hasContent) return <Empty title="Ainda não há aprendizado suficiente" body="Conforme os alertas são resolvidos, o motor passa a registrar observações e recomendações conservadoras aqui." />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-[#13B8A6]/[0.1] border border-[#2DD4BF]/20"><GraduationCap size={15} className="text-[#5EEAD4]" /></div>
        <div>
          <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Aprendizados do motor</h3>
          <p className="text-[11px] text-white/50 mt-0.5">Observações conservadoras — nada é aplicado automaticamente.</p>
        </div>
      </div>

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
          <Stat k="Rastreados" v={overview.totalAlertsTracked} />
          <Stat k="Úteis" v={overview.usefulSignals} tone="text-emerald-200/85" />
          <Stat k="Falhas" v={overview.failedSignals} tone="text-rose-200/80" />
          <Stat k="Sem dados" v={overview.unknownSignals} tone="text-amber-100/75" />
        </div>
      )}

      {recs.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2.5 flex items-center gap-1.5"><Lightbulb size={12} />Recomendações conservadoras</h4>
          <div className="space-y-2">
            {recs.map(r => (
              <div key={r.id} className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{r.type.replace(/_/g, ' ')}</span>
                  <span className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded border ${STRENGTH_TONE[r.strength] || STRENGTH_TONE.low}`}>{r.strength}</span>
                </div>
                <p className="text-[12px] text-white/75 leading-relaxed">{r.message}</p>
                <p className="text-[10px] text-white/35 mt-1 tabular-nums">amostra {r.evidence?.sampleSize ?? 0} · {SAMPLE_QUALITY_LABEL[r.evidence?.sampleQuality || 'insufficient']}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {overview && overview.recentLearningEvents.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2.5">Eventos recentes</h4>
          <div className="space-y-1.5">
            {overview.recentLearningEvents.map(e => (
              <button key={e.id} onClick={() => setOpenEventId(e.id)} type="button" className="w-full text-left flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-lg border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                <span className="text-[9.5px] uppercase tracking-wider text-white/35 font-semibold shrink-0 mt-0.5 w-[110px] truncate">{e.type.replace(/_/g, ' ')}</span>
                <span className="text-[11.5px] text-white/65 leading-snug flex-1">{e.message}</span>
                <span className="text-[10px] text-[#5EEAD4]/70 shrink-0">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {overview && overview.mostCommonFailureReasons.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2.5">Motivos de falha mais comuns</h4>
          <div className="flex flex-wrap gap-1.5">
            {overview.mostCommonFailureReasons.map((r, i) => <span key={i} className="text-[10.5px] px-2 py-0.5 rounded border bg-white/[0.04] border-white/[0.07] text-white/65">{r.reason} <span className="text-white/35 tabular-nums">· {r.count}</span></span>)}
          </div>
        </div>
      )}

      {openEventId && <LearningEventDrawer eventId={openEventId} onClose={() => setOpenEventId(null)} onGoToBacktest={onGoToBacktest} onOpenFilteredList={onOpenFilteredList} />}
    </div>
  )
}

function Stat({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return <div className="px-3 py-2.5 text-center bg-[#080d16]"><span className={`text-[18px] font-bold tabular-nums block leading-none ${tone || 'text-white/85'}`}>{v}</span><span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">{k}</span></div>
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-10 text-center">
      <p className="text-[15px] text-white/90 font-semibold">{title}</p>
      <p className="text-[12.5px] text-white/55 mt-1.5 max-w-[460px] mx-auto leading-relaxed">{body}</p>
    </div>
  )
}
