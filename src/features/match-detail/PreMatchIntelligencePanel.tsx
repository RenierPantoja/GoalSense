/**
 * Pre-Match Intelligence Panel — shows form, H2H, preview for scheduled matches.
 */
import { useEffect, useState } from 'react'
import { TrendingUp, Users, BarChart3 } from 'lucide-react'
import { getPreMatchIntelligence, type PreMatchIntelligenceResult } from '@/services/preMatchIntelligence'
import { useViewMode } from '@/context/ViewModeContext'

interface Props {
  homeName: string
  awayName: string
  homeId?: string | number
  awayId?: string | number
  competition?: string
  utcDate?: string
}

export function PreMatchIntelligencePanel({ homeName, awayName, homeId, awayId, competition, utcDate }: Props) {
  const [data, setData] = useState<PreMatchIntelligenceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const { isAdvanced } = useViewMode()

  useEffect(() => {
    if (!homeName || !awayName) return
    setLoading(true)
    getPreMatchIntelligence({ homeName, awayName, homeId, awayId, competition, utcDate })
      .then(setData)
      .finally(() => setLoading(false))
  }, [homeName, awayName, homeId, awayId, competition, utcDate])

  if (loading) return (
    <div className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5 animate-pulse">
      <div className="h-4 w-32 bg-white/[0.04] rounded mb-3" />
      <div className="h-3 w-full bg-white/[0.03] rounded mb-2" />
      <div className="h-3 w-3/4 bg-white/[0.03] rounded" />
    </div>
  )

  if (!data || !data.available) {
    if (!isAdvanced) return null
    return (
      <div className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5">
        <h3 className="text-[12px] font-bold text-white/50 mb-2">Pré-jogo</h3>
        <p className="text-[10px] text-white/25">Dados pré-jogo indisponíveis para esta partida.</p>
        {data?.limitations && data.limitations.map((l, i) => <p key={i} className="text-[9px] text-white/15 mt-1">{l}</p>)}
      </div>
    )
  }

  return (
    <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-6 space-y-5 animate-slideUp">
      {/* Preview */}
      {data.preview && (
        <div>
          <h3 className="text-[13px] font-bold text-white/70 mb-2 flex items-center gap-2">
            <TrendingUp size={14} className="text-cyan-400/50" />
            {data.preview.title}
          </h3>
          <p className="text-[11px] text-white/45 leading-relaxed">{data.preview.summary}</p>
          {data.preview.keyPoints.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {data.preview.keyPoints.map((p, i) => (
                <span key={i} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/40">{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form */}
      {(data.homeForm || data.awayForm) && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3 flex items-center gap-2">
            <BarChart3 size={12} className="text-white/20" />Forma recente
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.homeForm && <FormCard form={data.homeForm} />}
            {data.awayForm && <FormCard form={data.awayForm} />}
          </div>
          {/* Home/Away split */}
          {(data.homeAtHome || data.awayAway) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {data.homeAtHome && data.homeAtHome.matches.length >= 2 && <FormCard form={data.homeAtHome} label="Em casa" />}
              {data.awayAway && data.awayAway.matches.length >= 2 && <FormCard form={data.awayAway} label="Fora" />}
            </div>
          )}
        </div>
      )}

      {/* Goals Profile */}
      {data.goalsProfile && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3 flex items-center gap-2">
            <TrendingUp size={12} className="text-white/20" />Perfil de gols
          </h4>
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div><span className="text-[16px] font-bold text-white/70 block">{data.goalsProfile.avgGoalsPerMatch}</span><span className="text-[9px] text-white/25">Média/jogo</span></div>
              <div><span className="text-[16px] font-bold text-white/60 block">{data.goalsProfile.over25Pct}%</span><span className="text-[9px] text-white/25">Over 2.5</span></div>
              <div><span className="text-[16px] font-bold text-white/60 block">{data.goalsProfile.over15Pct}%</span><span className="text-[9px] text-white/25">Over 1.5</span></div>
              <div><span className="text-[16px] font-bold text-white/60 block">{data.goalsProfile.bothScoredPct}%</span><span className="text-[9px] text-white/25">Ambos marcam</span></div>
            </div>
            {isAdvanced && (
              <div className="mt-3 pt-3 border-t border-white/[0.03] grid grid-cols-2 gap-2 text-[9px] text-white/25">
                <span>{homeName.split(' ')[0]}: {data.goalsProfile.homeAvgFor} gols/jogo · {data.goalsProfile.homeAvgAgainst} sofridos</span>
                <span>{awayName.split(' ')[0]}: {data.goalsProfile.awayAvgFor} gols/jogo · {data.goalsProfile.awayAvgAgainst} sofridos</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* H2H */}
      {data.h2h && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3 flex items-center gap-2">
            <Users size={12} className="text-white/20" />Confronto direto
          </h4>
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4">
            <div className="grid grid-cols-5 gap-2 text-center">
              <div><span className="text-[16px] font-bold text-white/60 block">{data.h2h.total}</span><span className="text-[8px] text-white/20">Jogos</span></div>
              <div><span className="text-[16px] font-bold text-cyan-400/70 block">{data.h2h.homeWins}</span><span className="text-[8px] text-white/20">{homeName.split(' ')[0]}</span></div>
              <div><span className="text-[16px] font-bold text-white/40 block">{data.h2h.draws}</span><span className="text-[8px] text-white/20">Empates</span></div>
              <div><span className="text-[16px] font-bold text-emerald-400/70 block">{data.h2h.awayWins}</span><span className="text-[8px] text-white/20">{awayName.split(' ')[0]}</span></div>
              <div><span className="text-[16px] font-bold text-white/40 block">{data.h2h.homeGoals}-{data.h2h.awayGoals}</span><span className="text-[8px] text-white/20">Gols</span></div>
            </div>
          </div>
          {/* Recent meetings */}
          {isAdvanced && data.recentMeetings && data.recentMeetings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {data.recentMeetings.slice(0, 3).map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-[9px] text-white/30">
                  <span className="w-16 shrink-0 tabular-nums">{new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                  <span className="flex-1 truncate">{m.homeTeam} {m.homeScore}-{m.awayScore} {m.awayTeam}</span>
                  {m.competition && <span className="text-white/15 truncate">{m.competition}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Discipline */}
      {data.disciplineProfile && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">Disciplina e cartões</h4>
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div><span className="text-[14px] font-bold text-amber-400/70 block">{data.disciplineProfile.homeYellowAvg}</span><span className="text-[9px] text-white/25">{homeName.split(' ')[0]} amarelos/jogo</span></div>
              <div><span className="text-[14px] font-bold text-amber-400/70 block">{data.disciplineProfile.awayYellowAvg}</span><span className="text-[9px] text-white/25">{awayName.split(' ')[0]} amarelos/jogo</span></div>
              <div><span className="text-[14px] font-bold text-rose-400/70 block">{data.disciplineProfile.homeRedTotal}</span><span className="text-[9px] text-white/25">{homeName.split(' ')[0]} vermelhos</span></div>
              <div><span className="text-[14px] font-bold text-rose-400/70 block">{data.disciplineProfile.awayRedTotal}</span><span className="text-[9px] text-white/25">{awayName.split(' ')[0]} vermelhos</span></div>
            </div>
            <p className="text-[10px] text-white/35 mt-3 text-center">{data.disciplineProfile.summary}</p>
          </div>
        </div>
      )}

      {/* Limitations */}
      {isAdvanced && data.limitations && data.limitations.length > 0 && (
        <div className="pt-3 border-t border-white/[0.03]">
          {data.limitations.map((l, i) => <p key={i} className="text-[9px] text-white/15">{l}</p>)}
          {data.dataSources && <p className="text-[8px] text-white/10 mt-1">Fontes: {data.dataSources.join(', ')}</p>}
        </div>
      )}

      {/* Confidence */}
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-medium rounded-lg border px-2 py-1 ${data.confidence === 'high' ? 'text-emerald-400/60 border-emerald-500/15' : data.confidence === 'medium' ? 'text-amber-400/60 border-amber-500/15' : 'text-white/25 border-white/[0.05]'}`}>
          Confiança: {data.confidence === 'high' ? 'alta' : data.confidence === 'medium' ? 'média' : 'baixa'}
        </span>
      </div>
    </section>
  )
}

// ─── Form Card ───────────────────────────────────────────────────────────────

function FormCard({ form, label }: { form: import('@/services/preMatchIntelligence').TeamFormSummary; label?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4">
      <span className="text-[11px] font-semibold text-white/60 block mb-2">{form.teamName}{label && <span className="text-white/30 ml-1">({label})</span>}</span>
      <div className="flex items-center gap-1 mb-2">
        {form.formString.split(' ').map((r, i) => (
          <span key={i} className={`h-6 w-6 rounded-md flex items-center justify-center text-[9px] font-bold ${r === 'W' ? 'bg-emerald-500/15 text-emerald-400' : r === 'D' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
            {r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><span className="text-[12px] font-bold text-emerald-400/60 block">{form.summary.wins}</span><span className="text-[9px] text-white/30">Vitórias</span></div>
        <div><span className="text-[12px] font-bold text-amber-400/60 block">{form.summary.draws}</span><span className="text-[9px] text-white/30">Empates</span></div>
        <div><span className="text-[12px] font-bold text-rose-400/60 block">{form.summary.losses}</span><span className="text-[9px] text-white/30">Derrotas</span></div>
      </div>
      <p className="text-[10px] text-white/25 mt-2 text-center">{form.summary.goalsFor} gols marcados · {form.summary.goalsAgainst} sofridos</p>
    </div>
  )
}
