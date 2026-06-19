/**
 * AlertOverviewStrip — server-side period metrics for Alertas 2.0 (B17).
 * Consumes /api/intelligence/alerts/overview. Honest: loading / empty / offline.
 * usefulRate = confirmed + partial; failedRate excludes unknown/expired.
 */
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { alertIntelligenceApi, isAlertIntelligenceConfigured } from '@/services/alertIntelligenceApi'
import type { AlertIntelligenceOverview } from '../../../../intelligence/alertIntelligenceTypes'
import { SAMPLE_QUALITY_LABEL, pct } from '../../../../intelligence/alertIntelligenceTypes'

type Period = 'today' | '7d' | '30d' | 'all'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Hoje' }, { id: '7d', label: '7 dias' }, { id: '30d', label: '30 dias' }, { id: 'all', label: 'Tudo' },
]

function dateFromOf(p: Period): string | undefined {
  if (p === 'all') return undefined
  const d = new Date()
  if (p === 'today') d.setHours(0, 0, 0, 0)
  else d.setDate(d.getDate() - (p === '7d' ? 7 : 30))
  return d.toISOString()
}

function Metric({ k, v, tone }: { k: string; v: string | number; tone?: string }) {
  return <div className="px-3 py-2.5 text-center bg-[#080d16]"><span className={`text-[18px] font-bold tabular-nums block leading-none ${tone || 'text-white/85'}`}>{v}</span><span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">{k}</span></div>
}

export function AlertOverviewStrip() {
  const configured = isAlertIntelligenceConfigured()
  const [period, setPeriod] = useState<Period>('7d')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AlertIntelligenceOverview | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!configured) { setLoading(false); return }
    let alive = true
    setLoading(true)
    alertIntelligenceApi.getAlertIntelligenceOverview({ dateFrom: dateFromOf(period) }).then(o => {
      if (!alive) return; setData(o); setLoading(false)
    })
    return () => { alive = false }
  }, [configured, period, tick])

  if (!configured) return null

  const lowSample = data && (data.sampleQuality === 'insufficient' || data.sampleQuality === 'low')

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} type="button" className={`px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors ${period === p.id ? 'bg-white/[0.08] text-white/95' : 'text-white/50 hover:text-white/80'}`}>{p.label}</button>
          ))}
        </div>
        <button onClick={() => setTick(t => t + 1)} type="button" className="inline-flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white/75 transition-colors"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} />Atualizar</button>
      </div>

      {loading ? (
        <p className="text-[12px] text-white/40 py-6 text-center">Carregando métricas do período…</p>
      ) : !data || data.totalAlerts === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] p-6 text-center">
          <p className="text-[12.5px] text-white/70 font-medium">Sem alertas registrados no backend para este período</p>
          <p className="text-[11px] text-white/45 mt-1">As métricas vêm do Signal Ledger (B12). Sinais do worker aparecem aqui após resolução.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
            <Metric k="Total" v={data.totalAlerts} />
            <Metric k="Pendentes" v={data.pending} tone="text-amber-200/80" />
            <Metric k="Útil" v={pct(data.usefulRate)} tone="text-emerald-200/85" />
            <Metric k="Falha" v={pct(data.failedRate)} tone="text-rose-200/80" />
            <Metric k="Sem dados" v={pct(data.unknownRate)} tone="text-amber-100/75" />
            <Metric k="Conf. média" v={data.avgConfidence ?? '—'} />
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap text-[11px] text-white/45">
            <span>Confirmados <span className="text-emerald-200/80 tabular-nums">{data.confirmed}</span></span>
            <span>· Parciais <span className="text-teal-200/80 tabular-nums">{data.confirmedPartial}</span></span>
            <span>· Falhas <span className="text-rose-200/75 tabular-nums">{data.failed}</span></span>
            <span>· Sem dados <span className="text-amber-100/70 tabular-nums">{data.unknown + data.expired}</span></span>
            {data.avgTimeToResolutionMinutes != null && <span>· Resolução média <span className="text-white/75 tabular-nums">{data.avgTimeToResolutionMinutes}min</span></span>}
            <span className="text-white/35">· {SAMPLE_QUALITY_LABEL[data.sampleQuality]}</span>
          </div>
          {lowSample && <p className="text-[11px] text-amber-100/70 mt-2">Amostra insuficiente para conclusão forte — trate como indício inicial.</p>}
        </>
      )}
    </section>
  )
}
