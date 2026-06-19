/**
 * LearningEventDrawer — drill-down of one learning event (B17).
 * Shows the event, related pattern, recommendations and related alerts.
 * Observations only: never applies a recommendation, never alters a pattern.
 */
import { useEffect, useState } from 'react'
import { X, GraduationCap, FlaskConical } from 'lucide-react'
import { alertIntelligenceApi } from '@/services/alertIntelligenceApi'
import { RelatedAlertsPanel } from './RelatedAlertsPanel'
import type { LearningEventDetail, AlertIntelFilters } from '../../../../intelligence/alertIntelligenceTypes'
import { SAMPLE_QUALITY_LABEL, pct } from '../../../../intelligence/alertIntelligenceTypes'

interface Props {
  eventId: string
  onClose: () => void
  onGoToBacktest?: () => void
  onOpenFilteredList?: (filters: AlertIntelFilters) => void
}

export function LearningEventDrawer({ eventId, onClose, onGoToBacktest, onOpenFilteredList }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LearningEventDetail | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    alertIntelligenceApi.getLearningEventDetail(eventId).then(d => { if (!alive) return; setData(d); setLoading(false) })
    return () => { alive = false }
  }, [eventId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const event = data?.event
  const profile = data?.relatedPattern

  return (
    <div className="fixed inset-0 z-[130] flex justify-end" role="dialog" aria-label="Aprendizado">
      <div className="absolute inset-0 bg-[#05080d]/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[600px] h-full bg-[#0b0f16] border-l border-white/[0.1] shadow-2xl flex flex-col animate-fadeIn">
        <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-3 shrink-0">
          <div className="h-9 w-9 rounded-xl grid place-items-center bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22"><GraduationCap size={16} className="text-[#5EEAD4]" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold text-white/95 truncate">Aprendizado do motor</h3>
            <p className="text-[11px] text-white/45 truncate">{event ? event.type.replace(/_/g, ' ') : 'Carregando…'}</p>
          </div>
          <button onClick={onClose} type="button" aria-label="Fechar" className="h-8 w-8 rounded-full grid place-items-center text-white/50 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-6 py-5 min-h-0 space-y-3">
          {loading && <div className="py-16 text-center text-[13px] text-white/40">Carregando…</div>}

          {!loading && (!data || !data.found || !event) && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-6 text-center">
              <p className="text-[13px] text-white/75 font-medium">Evento não encontrado</p>
              <p className="text-[11.5px] text-white/50 mt-1.5">Este aprendizado pode ter sido recalculado pela agregação (B13).</p>
            </div>
          )}

          {!loading && event && (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
                <p className="text-[13px] text-white/85 leading-relaxed">{event.message}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px] text-white/40">
                  <span className="px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.07]">{event.contextKey}</span>
                  <span>confiança {event.confidence}</span>
                  <span>· {new Date(event.createdAt).toLocaleString('pt-BR')}</span>
                </div>
              </div>

              {profile && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-medium text-white/85">{profile.radarName}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{SAMPLE_QUALITY_LABEL[profile.sampleQuality]}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-white/55 flex-wrap">
                    <span>Útil <span className="text-emerald-200/80">{pct(profile.usefulRate)}</span></span>
                    <span>· Falha <span className="text-rose-200/75">{pct(profile.failedRate)}</span></span>
                    <span>· Sem dados <span className="text-amber-100/70">{pct(profile.unknownRate)}</span></span>
                    <span className="text-white/35 tabular-nums">· {profile.resolvedCount} resolvidos</span>
                  </div>
                </div>
              )}

              {data!.relatedRecommendations.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Recomendações relacionadas</h4>
                  {data!.relatedRecommendations.map(r => (
                    <div key={r.id} className="py-1.5 border-b border-white/[0.04] last:border-0">
                      <p className="text-[11.5px] text-white/70 leading-snug">{r.message}</p>
                      <span className="text-[9.5px] text-white/35">{r.type.replace(/_/g, ' ')} · {r.strength}</span>
                    </div>
                  ))}
                </div>
              )}

              <RelatedAlertsPanel source={{ kind: 'event', eventId }} onOpenInList={onOpenFilteredList && data!.relatedAlertsLinkParams?.patternId ? () => onOpenFilteredList({ patternId: data!.relatedAlertsLinkParams!.patternId }) : undefined} />

              {onGoToBacktest && data!.relatedAlertsLinkParams?.patternId && (
                <button onClick={onGoToBacktest} type="button" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5EEAD4] hover:text-[#7FE9DC] transition-colors"><FlaskConical size={14} />Rodar backtest do radar relacionado</button>
              )}
              <p className="text-[10px] text-white/30">Observação do motor — nada é aplicado automaticamente ao radar.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
