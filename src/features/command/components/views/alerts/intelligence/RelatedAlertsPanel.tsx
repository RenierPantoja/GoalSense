/**
 * RelatedAlertsPanel — alerts with a similar, explained context (B17).
 * Never calls a relation "proof"; honest language + strength flag.
 */
import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { alertIntelligenceApi } from '@/services/alertIntelligenceApi'
import type { RelatedAlertsResponse, RelatedAlertItem } from '../../../../intelligence/alertIntelligenceTypes'
import { RESULT_LABEL, RESULT_TONE, RELATION_STRENGTH_LABEL } from '../../../../intelligence/alertIntelligenceTypes'

type Source = { kind: 'alert'; alertId: string } | { kind: 'pattern'; patternId: string } | { kind: 'event'; eventId: string }

interface Props {
  source: Source
  onOpenAlert?: (item: RelatedAlertItem) => void
  onOpenInList?: () => void
}

export function RelatedAlertsPanel({ source, onOpenAlert, onOpenInList }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RelatedAlertsResponse | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const p = source.kind === 'alert' ? alertIntelligenceApi.getRelatedAlerts(source.alertId)
      : source.kind === 'pattern' ? alertIntelligenceApi.getRelatedAlertsForPattern(source.patternId)
      : alertIntelligenceApi.getRelatedAlertsForLearningEvent(source.eventId)
    p.then(res => { if (!alive) return; setData(res); setLoading(false) })
    return () => { alive = false }
  }, [source])

  if (loading) return <div className="text-[12px] text-white/40 py-4 text-center">Carregando alertas relacionados…</div>
  if (!data || data.relatedAlerts.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] px-4 py-5 text-center">
        <p className="text-[12.5px] text-white/65 font-medium">Sem alertas relacionados</p>
        <p className="text-[11px] text-white/45 mt-1">Ainda não há sinais com contexto parecido o suficiente para relacionar.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Link2 size={13} className="text-white/45" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Alertas com contexto parecido</h4>
        <span className="text-[10px] text-white/35 tabular-nums">{data.total}</span>
        {onOpenInList && <button onClick={onOpenInList} type="button" className="ml-auto text-[10.5px] font-medium text-[#5EEAD4] hover:text-[#7FE9DC] transition-colors">Abrir na lista filtrada →</button>}
      </div>
      {data.appliedFilters.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {data.appliedFilters.map((f, i) => <span key={i} className="text-[9.5px] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.07] text-white/50">{f}</span>)}
        </div>
      )}
      <div className="space-y-1.5">
        {data.relatedAlerts.map(r => {
          const tone = RESULT_TONE[r.result] || RESULT_TONE.pending
          return (
            <button key={r.alertId} onClick={() => onOpenAlert?.(r)} type="button" className="w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.012] px-3 py-2 hover:border-white/[0.12] transition-colors">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[12px] font-medium text-white/85 truncate">{r.fixtureLabel}</span>
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded border ${tone.bg} ${tone.border} ${tone.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />{RESULT_LABEL[r.result]}
                </span>
              </div>
              <div className="flex items-center gap-x-2 text-[10.5px] text-white/45 mt-1 flex-wrap">
                <span>{r.league}</span>
                {r.minute != null && <span>· {r.minute}'</span>}
                <span className="text-white/35">· {RELATION_STRENGTH_LABEL[r.strength]}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {r.relationReasons.map((reason, i) => <span key={i} className="text-[9.5px] px-1.5 py-0.5 rounded bg-[#13B8A6]/[0.07] border border-[#2DD4BF]/15 text-[#7FE9DC]/80">{reason}</span>)}
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-white/30 mt-2.5">Relação observada por contexto — não é prova de causa.</p>
    </div>
  )
}
