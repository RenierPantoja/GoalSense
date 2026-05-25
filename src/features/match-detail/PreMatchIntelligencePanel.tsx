/**
 * Pre-Match Intelligence Panel — shows form, H2H, preview for scheduled matches.
 */
import { useEffect, useState, useMemo } from 'react'
import { TrendingUp, Users, BarChart3, Zap } from 'lucide-react'
import { getPreMatchIntelligence, type PreMatchIntelligenceResult } from '@/services/preMatchIntelligence'
import { getPreMatchAdvanced, type PreMatchAdvancedResult } from '@/services/intelligence/preMatchAdvanced'
import { getPreMatchPatternReadiness, type PreMatchPatternReadiness } from '@/services/intelligence/preMatchPatternConnector'
import { calculatePreMatchScore } from '@/services/intelligence/preMatchScoreEngine'
import { PreMatchScorePanel } from './PreMatchScorePanel'
import { PatternJourneyCard } from './PatternJourneyCard'
import { useViewMode } from '@/context/ViewModeContext'
import { usePatterns } from '@/features/command/contexts/PatternContext'
import { useFavorites } from '@/context/FavoritesContext'

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
    return (
      <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-6">
        <h3 className="text-[13px] font-bold text-white/60 mb-2">Pré-jogo</h3>
        <p className="text-[12px] text-white/40">Dados pré-jogo limitados para esta partida.</p>
        <p className="text-[11px] text-white/25 mt-1">Não encontramos dados suficientes nos providers para este confronto. Você ainda pode configurar padrões para monitorar quando a partida iniciar.</p>
        {data?.limitations && data.limitations.length > 0 && isAdvanced && (
          <div className="mt-3 pt-3 border-t border-white/[0.03] space-y-1">
            {data.limitations.map((l, i) => <p key={i} className="text-[10px] text-white/20">{l}</p>)}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="gs-panel space-y-6 animate-slideUp">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-bold text-white/85">Análise pré-jogo</h3>
          <p className="text-[12px] text-white/40 mt-0.5">{data.status === 'rich' ? 'Leitura baseada em forma, H2H, gols e disciplina' : data.status === 'partial' ? 'Leitura parcial com dados disponíveis' : 'Dados limitados — monitoramento ao vivo recomendado'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`gs-badge ${data.status === 'rich' ? 'gs-badge-emerald' : data.status === 'partial' ? 'gs-badge-amber' : 'gs-badge-rose'}`}>{data.status === 'rich' ? 'Dados ricos' : data.status === 'partial' ? 'Parcial' : 'Limitado'}</span>
          {data.dataSources.includes('Base GoalSense') && <span className="gs-badge gs-badge-cyan">Base GoalSense</span>}
        </div>
      </div>

      {/* Preview / Main Read */}
      {data.preview && (
        <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-5">
          <h4 className="text-[13px] font-semibold text-white/70 mb-2 flex items-center gap-2">
            <TrendingUp size={14} className="text-cyan-400/60" />
            Leitura GoalSense
          </h4>
          <p className="text-[13px] text-white/55 leading-relaxed">{data.preview.summary}</p>
          {data.preview.keyPoints.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {data.preview.keyPoints.map((p, i) => (
                <span key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/50">{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form */}
      {(data.homeForm || data.awayForm) && (
        <div>
          <h4 className="gs-section-title mb-3 flex items-center gap-2">
            <BarChart3 size={13} className="text-white/30" />Forma recente
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

      {/* Score Panel */}
      <PreMatchScorePanel data={data} />

      {/* Pattern Readiness */}
      <PatternReadinessSection homeName={homeName} awayName={awayName} data={data} />

      {/* Pattern Journey */}
      <PatternJourneyCard />

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
          <h4 className="gs-section-title mb-3 flex items-center gap-2">
            <Users size={13} className="text-white/30" />Confronto direto
          </h4>
          <div className="gs-card">
            <div className="grid grid-cols-5 gap-3 text-center">
              <div><span className="text-[18px] font-bold text-white/70 block">{data.h2h.total}</span><span className="text-[10px] text-white/30">Jogos</span></div>
              <div><span className="text-[18px] font-bold text-cyan-400/80 block">{data.h2h.homeWins}</span><span className="text-[10px] text-white/30">{homeName.split(' ')[0]}</span></div>
              <div><span className="text-[18px] font-bold text-white/45 block">{data.h2h.draws}</span><span className="text-[10px] text-white/30">Empates</span></div>
              <div><span className="text-[18px] font-bold text-emerald-400/80 block">{data.h2h.awayWins}</span><span className="text-[10px] text-white/30">{awayName.split(' ')[0]}</span></div>
              <div><span className="text-[18px] font-bold text-white/50 block">{data.h2h.homeGoals}-{data.h2h.awayGoals}</span><span className="text-[10px] text-white/30">Gols</span></div>
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

      {/* Advanced Load Button */}
      <AdvancedSection homeName={homeName} awayName={awayName} homeId={homeId} awayId={awayId} competition={competition} data={data} isAdvanced={isAdvanced} />

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

// ─── Advanced Section ────────────────────────────────────────────────────────

function AdvancedSection({ homeName, awayName, homeId, awayId, competition, data, isAdvanced }: { homeName: string; awayName: string; homeId?: string | number; awayId?: string | number; competition?: string; data: PreMatchIntelligenceResult; isAdvanced: boolean }) {
  const [advanced, setAdvanced] = useState<PreMatchAdvancedResult | null>(null)
  const [loadingAdv, setLoadingAdv] = useState(false)

  const loadAdvanced = async () => {
    setLoadingAdv(true)
    try {
      const result = await getPreMatchAdvanced({
        homeName, awayName,
        homeId: homeId ? Number(homeId) : undefined,
        awayId: awayId ? Number(awayId) : undefined,
        goalsProfile: data.goalsProfile,
        homeForm: data.homeForm,
        awayForm: data.awayForm,
        disciplineTrend: data.disciplineProfile?.trend,
      })
      setAdvanced(result)
    } catch { /* */ }
    finally { setLoadingAdv(false) }
  }

  if (!advanced) {
    return (
      <div className="pt-3 border-t border-white/[0.03]">
        <button onClick={loadAdvanced} disabled={loadingAdv} className="w-full py-3 rounded-xl text-[11px] font-semibold bg-cyan-500/8 text-cyan-400/70 border border-cyan-500/15 hover:bg-cyan-500/12 disabled:opacity-40 transition-colors" type="button">
          {loadingAdv ? 'Carregando...' : 'Carregar análise avançada'}
        </button>
        <p className="text-[9px] text-white/20 text-center mt-1.5">Ausências, goleadores, padrões aplicáveis e sinais pré-jogo</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-3 border-t border-white/[0.03]">
      {/* Absences */}
      {(advanced.absences.home.injuries.length > 0 || advanced.absences.away.injuries.length > 0 || advanced.absences.home.suspensions.length > 0 || advanced.absences.away.suspensions.length > 0) && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">Ausências</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {advanced.absences.home.injuries.length + advanced.absences.home.suspensions.length > 0 && (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <span className="text-[10px] font-semibold text-white/50 block mb-1.5">{homeName}</span>
                {advanced.absences.home.injuries.map((p, i) => <p key={i} className="text-[10px] text-rose-400/50">🏥 {p.name} — {p.reason || 'Lesão'}</p>)}
                {advanced.absences.home.suspensions.map((p, i) => <p key={i} className="text-[10px] text-amber-400/50">⚠️ {p.name} — Suspenso</p>)}
              </div>
            )}
            {advanced.absences.away.injuries.length + advanced.absences.away.suspensions.length > 0 && (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <span className="text-[10px] font-semibold text-white/50 block mb-1.5">{awayName}</span>
                {advanced.absences.away.injuries.map((p, i) => <p key={i} className="text-[10px] text-rose-400/50">🏥 {p.name} — {p.reason || 'Lesão'}</p>)}
                {advanced.absences.away.suspensions.map((p, i) => <p key={i} className="text-[10px] text-amber-400/50">⚠️ {p.name} — Suspenso</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scorers */}
      {(advanced.scorers.home.players.length > 0 || advanced.scorers.away.players.length > 0) && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">Goleadores</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {advanced.scorers.home.players.length > 0 && (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <span className="text-[10px] font-semibold text-white/50 block mb-1.5">{homeName}</span>
                {advanced.scorers.home.players.map((p, i) => <p key={i} className="text-[10px] text-white/40">{p.name} — {p.goals} gols{p.assists ? `, ${p.assists} assist.` : ''}</p>)}
              </div>
            )}
            {advanced.scorers.away.players.length > 0 && (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <span className="text-[10px] font-semibold text-white/50 block mb-1.5">{awayName}</span>
                {advanced.scorers.away.players.map((p, i) => <p key={i} className="text-[10px] text-white/40">{p.name} — {p.goals} gols{p.assists ? `, ${p.assists} assist.` : ''}</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Applicable Patterns */}
      {advanced.applicablePatterns.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2 flex items-center gap-1.5"><Zap size={10} className="text-cyan-400/40" />Padrões aplicáveis</h4>
          <div className="space-y-1">
            {advanced.applicablePatterns.map(p => (
              <div key={p.patternId} className="flex items-center gap-2 rounded-lg bg-white/[0.015] px-3 py-2 border border-white/[0.03]">
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${p.readiness === 'ready' ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-white/[0.03] text-white/25'}`}>{p.readiness === 'ready' ? 'Pronto' : 'Ao vivo'}</span>
                <span className="text-[10px] text-white/50 flex-1">{p.name}</span>
                <span className="text-[9px] text-white/20">{p.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Flags */}
      {advanced.riskFlags.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">Sinais pré-jogo</h4>
          <div className="space-y-1">
            {advanced.riskFlags.map((f, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 border-l-2 ${f.severity === 'critical' ? 'border-l-rose-400/50 bg-rose-500/[0.02]' : f.severity === 'attention' ? 'border-l-amber-400/40 bg-amber-500/[0.02]' : 'border-l-white/[0.1] bg-white/[0.01]'}`}>
                <span className="text-[10px] text-white/50 block">{f.label}</span>
                <span className="text-[9px] text-white/25">{f.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limitations */}
      {advanced.limitations.length > 0 && isAdvanced && (
        <div className="text-[9px] text-white/15 space-y-0.5">
          {advanced.limitations.map((l, i) => <p key={i}>{l}</p>)}
          <p className="text-white/10">Fontes: {advanced.sources.join(', ')}</p>
        </div>
      )}
    </div>
  )
}


// ─── Pattern Readiness Section ───────────────────────────────────────────────

function PatternReadinessSection({ homeName, awayName, data }: { homeName: string; awayName: string; data: PreMatchIntelligenceResult }) {
  const { getActivePatterns } = usePatterns()
  const { isFavoriteTeam } = useFavorites()
  const { isAdvanced } = useViewMode()

  const activePatterns = getActivePatterns()
  const score = useMemo(() => calculatePreMatchScore(data), [data])

  const readiness = useMemo(() => {
    if (activePatterns.length === 0) return []
    return getPreMatchPatternReadiness({ homeName, awayName, activePatterns, preMatchData: data, score, isFavoriteTeam })
  }, [homeName, awayName, activePatterns, data, score, isFavoriteTeam])

  if (activePatterns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.06] bg-white/[0.01] p-4 text-center">
        <p className="text-[12px] text-white/40">Nenhum padrão ativo para esta partida</p>
        <p className="text-[10px] text-white/25 mt-1">Configure padrões no Command Center para transformar leituras pré-jogo em alertas operacionais.</p>
      </div>
    )
  }

  if (readiness.length === 0) return null

  const shown = isAdvanced ? readiness : readiness.filter(r => r.readiness !== 'not_applicable').slice(0, 4)

  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-2">Padrões que serão monitorados</h4>
      <p className="text-[10px] text-white/20 mb-3">Pré-sinal não é alerta. O alerta só é registrado quando as condições reais forem atendidas ao vivo.</p>
      <div className="space-y-1.5">
        {shown.map(r => (
          <div key={r.patternId} className="flex items-center gap-3 rounded-xl bg-white/[0.015] border border-white/[0.04] px-4 py-2.5">
            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md shrink-0 ${r.readiness === 'ready' ? 'bg-emerald-500/10 text-emerald-400/70' : r.readiness === 'needs_live_data' ? 'bg-amber-500/8 text-amber-400/60' : 'bg-white/[0.04] text-white/25'}`}>{r.readiness === 'ready' ? 'Pronto' : r.readiness === 'needs_live_data' ? 'Ao vivo' : 'Dados'}</span>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-white/55 block">{r.patternName}</span>
              <span className="text-[10px] text-white/25 block">{r.watchPoint}</span>
            </div>
            {r.triggerWindow && <span className="text-[9px] text-white/20 shrink-0">{r.triggerWindow}</span>}
            {isAdvanced && <span className="text-[9px] text-white/15 tabular-nums shrink-0">{r.confidencePreview}%</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
