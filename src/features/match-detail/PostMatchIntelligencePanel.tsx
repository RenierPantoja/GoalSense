/**
 * Post-Match Intelligence Panel — analysis for finished matches.
 */
import { useMemo } from 'react'
import { Trophy, Clock, Users, BarChart3 } from 'lucide-react'
import { buildPostMatchIntelligence, type PostMatchIntelligenceResult } from '@/services/postMatchIntelligence'
import { useViewMode } from '@/context/ViewModeContext'

interface Props {
  homeName: string
  awayName: string
  homeScore: number
  awayScore: number
  stats: { label: string; home: string; away: string }[]
  events: { clock: string; text: string; type: string; team: string }[]
  hasLineups: boolean
  hasNarration: boolean
}

export function PostMatchIntelligencePanel({ homeName, awayName, homeScore, awayScore, stats, events, hasLineups, hasNarration }: Props) {
  const { isAdvanced } = useViewMode()

  const data = useMemo(() => buildPostMatchIntelligence({ homeName, awayName, homeScore, awayScore, stats, events, hasLineups, hasNarration }), [homeName, awayName, homeScore, awayScore, stats, events, hasLineups, hasNarration])

  if (!data.available) return null

  return (
    <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-6 space-y-5 animate-slideUp">
      {/* Result Summary */}
      <div>
        <h3 className="text-[14px] font-bold text-white/75 mb-1.5 flex items-center gap-2">
          <Trophy size={15} className="text-cyan-400/50" />
          {data.resultSummary.title}
        </h3>
        <p className="text-[11px] text-white/40 leading-relaxed">{data.resultSummary.description}</p>
        {data.tacticalReading && <p className="text-[11px] text-white/35 italic mt-2">{data.tacticalReading}</p>}
      </div>

      {/* Key Moments */}
      {data.keyMoments.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3 flex items-center gap-2">
            <Clock size={12} className="text-white/20" />Momentos-chave
          </h4>
          <div className="space-y-2">
            {data.keyMoments.map((m, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`text-[11px] font-bold tabular-nums w-7 text-right shrink-0 ${m.type === 'goal' ? 'text-emerald-400/70' : m.type === 'red_card' ? 'text-rose-400/70' : 'text-white/30'}`}>
                  {m.minute ? `${m.minute}'` : '—'}
                </span>
                <div>
                  <span className={`text-[11px] font-semibold ${m.type === 'goal' ? 'text-emerald-400/80' : m.type === 'red_card' ? 'text-rose-400/80' : 'text-white/55'}`}>{m.title}</span>
                  {m.description && <span className="text-[10px] text-white/25 ml-2">{m.description}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Comparison */}
      {isAdvanced && data.performanceComparison.summary !== 'Dados insuficientes para comparação.' && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3 flex items-center gap-2">
            <BarChart3 size={12} className="text-white/20" />Comparação de desempenho
          </h4>
          <p className="text-[11px] text-white/40 leading-relaxed">{data.performanceComparison.summary}</p>
          {(data.performanceComparison.possessionLeader || data.performanceComparison.shotsLeader) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {data.performanceComparison.possessionLeader && <span className="text-[9px] px-2 py-0.5 rounded-md border border-white/[0.05] bg-white/[0.02] text-white/30">Posse: {data.performanceComparison.possessionLeader}</span>}
              {data.performanceComparison.shotsLeader && <span className="text-[9px] px-2 py-0.5 rounded-md border border-white/[0.05] bg-white/[0.02] text-white/30">Finalizações: {data.performanceComparison.shotsLeader}</span>}
              {data.performanceComparison.efficiencyLeader && <span className="text-[9px] px-2 py-0.5 rounded-md border border-white/[0.05] bg-white/[0.02] text-white/30">Eficiência: {data.performanceComparison.efficiencyLeader}</span>}
            </div>
          )}
        </div>
      )}

      {/* Decisive Players */}
      {data.decisivePlayers.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3 flex items-center gap-2">
            <Users size={12} className="text-white/20" />Jogadores decisivos
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.decisivePlayers.slice(0, isAdvanced ? 5 : 3).map((p, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl border border-white/[0.03] bg-white/[0.01] p-3">
                <div className="flex flex-col items-center shrink-0 w-5">
                  <span className="text-[8px] font-bold text-cyan-400/40">#{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-white/65 block">{p.name}</span>
                  {p.teamName && <span className="text-[9px] text-white/20 block">{p.teamName}</span>}
                  <span className="text-[9px] text-white/30 italic block mt-0.5">{p.reason}</span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.events.map((e, ei) => (
                      <span key={ei} className={`text-[8px] px-1.5 py-0.5 rounded border ${e.startsWith('Gol') ? 'border-emerald-500/15 bg-emerald-500/5 text-emerald-400/70' : e.startsWith('Assist') ? 'border-cyan-500/12 bg-cyan-500/5 text-cyan-400/60' : 'border-white/[0.05] bg-white/[0.02] text-white/30'}`}>{e}</span>
                    ))}
                  </div>
                  {isAdvanced && <span className="text-[8px] text-white/15 mt-1 block">Impacto: {p.score}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limitations (advanced only) */}
      {isAdvanced && data.dataLimitations.length > 0 && (
        <div className="pt-3 border-t border-white/[0.03]">
          {data.dataLimitations.map((l, i) => <p key={i} className="text-[9px] text-white/15">{l}</p>)}
          <span className={`text-[9px] font-medium rounded-lg border px-2 py-1 mt-2 inline-block ${data.confidence === 'high' ? 'text-emerald-400/60 border-emerald-500/15' : data.confidence === 'medium' ? 'text-amber-400/60 border-amber-500/15' : 'text-white/25 border-white/[0.05]'}`}>
            Confiança: {data.confidence === 'high' ? 'alta' : data.confidence === 'medium' ? 'média' : 'baixa'}
          </span>
        </div>
      )}
    </section>
  )
}
