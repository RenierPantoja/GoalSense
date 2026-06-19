/**
 * PatternSignalQualityView — per-pattern quality from B13 learning profiles.
 * Never ranks tiny samples as "best"; shows "indício" + explicit unknown.
 */
import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { alertIntelligenceApi, isAlertIntelligenceConfigured } from '@/services/alertIntelligenceApi'
import type { PatternLearningProfile } from '../../../../intelligence/alertIntelligenceTypes'
import { SAMPLE_QUALITY_LABEL, pct } from '../../../../intelligence/alertIntelligenceTypes'
import { RelatedAlertsPanel } from './RelatedAlertsPanel'

function Mini({ k, v, tone }: { k: string; v: string; tone: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-2 text-center min-w-[64px]"><span className={`text-[15px] font-bold tabular-nums block ${tone}`}>{v}</span><span className="text-[9px] uppercase tracking-wider text-white/40 mt-0.5 block">{k}</span></div>
}

export function PatternSignalQualityView({ onOpenInList }: { onOpenInList?: (patternId: string) => void } = {}) {
  const configured = isAlertIntelligenceConfigured()
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<PatternLearningProfile[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) { setLoading(false); return }
    let alive = true
    alertIntelligenceApi.listPatternLearningProfiles().then(p => { if (!alive) return; setProfiles(p || []); setLoading(false) })
    return () => { alive = false }
  }, [configured])

  if (!configured) return <Empty title="Conecte um backend" body="A qualidade dos padrões vem da memória de aprendizado (B13) no backend." />
  if (loading) return <div className="py-16 text-center text-[13px] text-white/40">Carregando qualidade dos padrões…</div>
  if (profiles.length === 0) return <Empty title="Ainda não há perfis de aprendizado" body="Rode a agregação de aprendizado (B13) ou aguarde mais sinais resolvidos. Backtests e alertas alimentam estes perfis." />

  const sorted = [...profiles].sort((a, b) => {
    const rank = (q: string) => q === 'strong' ? 3 : q === 'moderate' ? 2 : q === 'low' ? 1 : 0
    const r = rank(b.sampleQuality) - rank(a.sampleQuality)
    if (r !== 0) return r
    return (b.usefulRate ?? -1) - (a.usefulRate ?? -1)
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-white/[0.04] border border-white/[0.07]"><BarChart3 size={15} className="text-white/55" /></div>
        <div>
          <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Qualidade dos padrões</h3>
          <p className="text-[11px] text-white/50 mt-0.5">Desempenho histórico por radar. Amostras pequenas são indício, não conclusão.</p>
        </div>
      </div>

      {sorted.map(p => {
        const low = p.sampleQuality === 'insufficient' || p.sampleQuality === 'low'
        return (
          <div key={p.id} className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <span className="text-[13px] font-semibold text-white/90 truncate">{p.radarName}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${low ? 'text-amber-200/80 bg-amber-500/[0.08] border-amber-400/20' : 'text-[#7FE9DC]/85 bg-[#13B8A6]/[0.08] border-[#2DD4BF]/20'}`}>{SAMPLE_QUALITY_LABEL[p.sampleQuality]}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Mini k="Útil" v={pct(p.usefulRate)} tone="text-emerald-200/85" />
              <Mini k="Falha" v={pct(p.failedRate)} tone="text-rose-200/80" />
              <Mini k="Sem dados" v={pct(p.unknownRate)} tone="text-amber-100/75" />
              <Mini k="Confirm." v={String(p.confirmedCount)} tone="text-white/80" />
              <Mini k="Parcial" v={String(p.confirmedPartialCount)} tone="text-teal-200/80" />
              <Mini k="Falhas" v={String(p.failedCount)} tone="text-white/70" />
              <Mini k="Sem dados" v={String(p.unknownCount + p.expiredCount)} tone="text-white/60" />
              <Mini k="Amostra" v={String(p.resolvedCount)} tone="text-white/70" />
            </div>
            {(p.bestMinuteWindows.length > 0 || p.worstCompetitions.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {p.bestMinuteWindows.length > 0 && (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-2.5">
                    <span className="text-[9.5px] uppercase tracking-wider text-white/40 font-semibold block mb-1">Contextos fortes (indício)</span>
                    {p.bestMinuteWindows.slice(0, 3).map(s => <div key={s.contextKey} className="flex justify-between"><span className="text-[11px] text-white/70 truncate">{s.label}</span><span className="text-[10.5px] text-emerald-200/80 tabular-nums">{pct(s.usefulRate)}</span></div>)}
                  </div>
                )}
                {p.worstCompetitions.length > 0 && (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-2.5">
                    <span className="text-[9.5px] uppercase tracking-wider text-white/40 font-semibold block mb-1">Contextos fracos (indício)</span>
                    {p.worstCompetitions.slice(0, 3).map(s => <div key={s.contextKey} className="flex justify-between"><span className="text-[11px] text-white/70 truncate">{s.label}</span><span className="text-[10.5px] text-rose-200/75 tabular-nums">{pct(s.failedRate)}</span></div>)}
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-white/30 mt-2">Atualizado: {p.lastUpdatedAt ? new Date(p.lastUpdatedAt).toLocaleString('pt-BR') : '—'}</p>
            <button onClick={() => setExpanded(expanded === p.scopeKey ? null : p.scopeKey)} type="button" className="mt-2 text-[11px] font-medium text-[#5EEAD4] hover:text-[#7FE9DC] transition-colors">
              {expanded === p.scopeKey ? 'Ocultar alertas' : 'Ver alertas relacionados →'}
            </button>
            {expanded === p.scopeKey && <div className="mt-2"><RelatedAlertsPanel source={{ kind: 'pattern', patternId: p.scopeKey }} onOpenInList={onOpenInList ? () => onOpenInList(p.scopeKey) : undefined} /></div>}
          </div>
        )
      })}
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-10 text-center">
      <p className="text-[15px] text-white/90 font-semibold">{title}</p>
      <p className="text-[12.5px] text-white/55 mt-1.5 max-w-[460px] mx-auto leading-relaxed">{body}</p>
    </div>
  )
}
