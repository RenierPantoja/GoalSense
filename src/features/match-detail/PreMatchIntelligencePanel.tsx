/**
 * Pre-Match Intelligence Panel — War Room Pré-Jogo.
 * Premium analysis for scheduled matches with real data.
 */
import { useEffect, useState, useMemo } from 'react'
import { TrendingUp, Users, BarChart3, Zap } from 'lucide-react'
import { getPreMatchIntelligence, type PreMatchIntelligenceResult } from '@/services/preMatchIntelligence'
import { getPreMatchAdvanced, type PreMatchAdvancedResult } from '@/services/intelligence/preMatchAdvanced'
import { getPreMatchPatternReadiness } from '@/services/intelligence/preMatchPatternConnector'
import { calculatePreMatchScore, type PreMatchScore } from '@/services/intelligence/preMatchScoreEngine'
import { useViewMode } from '@/context/ViewModeContext'
import { usePatterns } from '@/features/command/contexts/PatternContext'
import { useFavorites } from '@/context/FavoritesContext'

interface Props { homeName: string; awayName: string; homeId?: string | number; awayId?: string | number; competition?: string; utcDate?: string }

export function PreMatchIntelligencePanel({ homeName, awayName, homeId, awayId, competition, utcDate }: Props) {
  const [data, setData] = useState<PreMatchIntelligenceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [advanced, setAdvanced] = useState<PreMatchAdvancedResult | null>(null)
  const [loadingAdv, setLoadingAdv] = useState(false)
  const { isAdvanced } = useViewMode()
  const { getActivePatterns } = usePatterns()
  const { isFavoriteTeam } = useFavorites()

  useEffect(() => {
    if (!homeName || !awayName) return
    setLoading(true)
    getPreMatchIntelligence({ homeName, awayName, homeId, awayId, competition, utcDate }).then(setData).finally(() => setLoading(false))
  }, [homeName, awayName, homeId, awayId, competition, utcDate])

  const score = useMemo(() => data ? calculatePreMatchScore(data) : null, [data])

  const patterns = useMemo(() => {
    const active = getActivePatterns()
    if (active.length === 0 || !data) return []
    return getPreMatchPatternReadiness({ homeName, awayName, activePatterns: active, preMatchData: data, score, isFavoriteTeam })
  }, [homeName, awayName, data, score, getActivePatterns, isFavoriteTeam])

  const loadAdvanced = async () => {
    setLoadingAdv(true)
    try { const r = await getPreMatchAdvanced({ homeName, awayName, homeId: homeId ? Number(homeId) : undefined, awayId: awayId ? Number(awayId) : undefined, goalsProfile: data?.goalsProfile, homeForm: data?.homeForm, awayForm: data?.awayForm, disciplineTrend: data?.disciplineProfile?.trend }); setAdvanced(r) } catch {}
    finally { setLoadingAdv(false) }
  }

  if (loading) return <div className="gs-panel animate-pulse space-y-4"><div className="h-5 w-48 bg-white/[0.04] rounded" /><div className="h-4 w-full bg-white/[0.03] rounded" /><div className="h-4 w-3/4 bg-white/[0.03] rounded" /></div>

  if (!data || !data.available) return (
    <section className="gs-panel">
      <h3 className="text-[16px] font-bold text-white/80 mb-2">Análise pré-jogo</h3>
      <p className="text-[13px] text-white/50">Dados pré-jogo limitados para esta partida.</p>
      <p className="text-[12px] text-white/35 mt-2">Não encontramos histórico suficiente nos providers para montar uma leitura completa.</p>
      {data?.limitations && data.limitations.length > 0 && isAdvanced && <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1">{data.limitations.map((l, i) => <p key={i} className="text-[11px] text-white/25">· {l}</p>)}</div>}
      {patterns.length === 0 && <p className="text-[11px] text-white/30 mt-3">Configure padrões no Command Center para monitorar ao vivo.</p>}
    </section>
  )

  const gp = data.goalsProfile
  const dp = data.disciplineProfile
  const h = data.h2h

  return (
    <section className="space-y-5 animate-slideUp">
      {/* ═══ HERO ═══ */}
      <div className="gs-panel relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.02),transparent_60%)]" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[18px] font-bold text-white/90">War Room Pré-Jogo</h3>
              <p className="text-[12px] text-white/40 mt-0.5">{data.status === 'rich' ? 'Leitura baseada em forma, gols, H2H e disciplina' : data.status === 'partial' ? 'Leitura parcial com sinais disponíveis' : 'Dados limitados — monitoramento ao vivo recomendado'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`gs-badge ${data.status === 'rich' ? 'gs-badge-emerald' : data.status === 'partial' ? 'gs-badge-amber' : 'gs-badge-rose'}`}>{data.status === 'rich' ? 'Rico' : data.status === 'partial' ? 'Parcial' : 'Limitado'}</span>
              {score && <span className="text-[22px] font-bold tabular-nums text-white/80">{score.overallScore}<span className="text-[11px] text-white/30 ml-0.5">/100</span></span>}
            </div>
          </div>
          {/* Chips de leitura */}
          <div className="flex flex-wrap gap-2">
            {score && <Chip label="Equilíbrio" value={score.balance.label} score={score.balance.score} />}
            {score && <Chip label="Gols" value={score.goalsTrend.label} score={score.goalsTrend.score} />}
            {score && <Chip label="Disciplina" value={score.disciplineRisk.label} score={score.disciplineRisk.score} />}
          </div>
        </div>
      </div>

      {/* ═══ LEITURA EXECUTIVA ═══ */}
      {data.preview && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-5 py-4">
          <p className="text-[14px] text-white/65 leading-relaxed">{data.preview.summary}</p>
          {score && score.watchPoints.length > 0 && (
            <p className="text-[12px] text-cyan-400/50 mt-2">▸ {score.watchPoints[0].detail}</p>
          )}
        </div>
      )}

      {/* ═══ COMPARATIVO ═══ */}
      {(data.homeForm || data.awayForm) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.homeForm && <TeamFormCard form={data.homeForm} label="Mandante" homeAway={data.homeAtHome} homeAwayLabel="Em casa" />}
          {data.awayForm && <TeamFormCard form={data.awayForm} label="Visitante" homeAway={data.awayAway} homeAwayLabel="Fora" />}
        </div>
      ) : (
        <div className="gs-card py-4 text-center"><p className="text-[12px] text-white/40">Forma recente indisponível no provider</p><p className="text-[11px] text-white/25 mt-1">O GoalSense tentou buscar os últimos jogos, mas o provider não retornou dados suficientes.</p></div>
      )}

      {/* ═══ PERFIL DE GOLS ═══ */}
      {gp ? (
        <div className="gs-card">
          <h4 className="gs-section-title mb-3">Perfil de gols</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Media/jogo" value={String(gp.avgGoalsPerMatch)} sub={gp.avgGoalsPerMatch >= 2.5 ? 'Forte' : gp.avgGoalsPerMatch >= 1.8 ? 'Moderada' : 'Baixa'} />
            <Metric label="Over 2.5" value={`${gp.over25Pct}%`} sub={gp.over25Pct >= 60 ? 'Forte' : 'Moderada'} />
            <Metric label="Over 1.5" value={`${gp.over15Pct}%`} />
            <Metric label="Ambos marcam" value={`${gp.bothScoredPct}%`} sub={gp.bothScoredPct >= 60 ? 'Frequente' : ''} />
          </div>
          {isAdvanced && <div className="mt-3 pt-3 border-t border-white/[0.04] grid grid-cols-2 gap-2 text-[11px] text-white/35"><span>{homeName.split(' ')[0]}: {gp.homeAvgFor} pro - {gp.homeAvgAgainst} contra</span><span>{awayName.split(' ')[0]}: {gp.awayAvgFor} pro - {gp.awayAvgAgainst} contra</span></div>}
        </div>
      ) : (
        <div className="gs-card py-4 text-center"><p className="text-[12px] text-white/40">Perfil de gols indisponivel</p><p className="text-[11px] text-white/25 mt-1">Sem jogos recentes suficientes para calcular tendencia.</p></div>
      )}

      {/* ═══ DISCIPLINA ═══ */}
      {dp && (
        <div className="gs-card">
          <h4 className="gs-section-title mb-3">Disciplina e risco</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label={`${homeName.split(' ')[0]} amarelos`} value={String(dp.homeYellowAvg)} sub="/jogo" />
            <Metric label={`${awayName.split(' ')[0]} amarelos`} value={String(dp.awayYellowAvg)} sub="/jogo" />
            <Metric label="Vermelhos" value={String(dp.homeRedTotal + dp.awayRedTotal)} sub="recentes" />
            <Metric label="Tendência" value={dp.trend === 'high' ? 'Alta' : dp.trend === 'moderate' ? 'Moderada' : 'Baixa'} sub="" />
          </div>
          <p className="text-[11px] text-white/35 mt-2">{dp.summary}</p>
        </div>
      )}

      {/* ═══ H2H ═══ */}
      {h && (
        <div className="gs-card">
          <h4 className="gs-section-title mb-3">Confronto direto</h4>
          <div className="grid grid-cols-5 gap-2 text-center">
            <div><span className="text-[20px] font-bold text-white/70">{h.total}</span><span className="text-[10px] text-white/35 block">Jogos</span></div>
            <div><span className="text-[20px] font-bold text-cyan-400/80">{h.homeWins}</span><span className="text-[10px] text-white/35 block">{homeName.split(' ')[0]}</span></div>
            <div><span className="text-[20px] font-bold text-white/45">{h.draws}</span><span className="text-[10px] text-white/35 block">Empates</span></div>
            <div><span className="text-[20px] font-bold text-emerald-400/80">{h.awayWins}</span><span className="text-[10px] text-white/35 block">{awayName.split(' ')[0]}</span></div>
            <div><span className="text-[20px] font-bold text-white/50">{h.homeGoals}:{h.awayGoals}</span><span className="text-[10px] text-white/35 block">Gols</span></div>
          </div>
          {isAdvanced && data.recentMeetings && data.recentMeetings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1">{data.recentMeetings.slice(0, 3).map((m, i) => (<div key={i} className="flex items-center gap-2 text-[11px] text-white/35"><span className="w-16 tabular-nums">{new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span><span className="flex-1">{m.homeTeam} {m.homeScore}-{m.awayScore} {m.awayTeam}</span></div>))}</div>
          )}
        </div>
      )}

      {/* ═══ PADRÕES MONITORÁVEIS ═══ */}
      {patterns.length > 0 && (
        <div className="gs-card">
          <h4 className="gs-section-title mb-2">Padrões que serão monitorados</h4>
          <p className="text-[11px] text-white/30 mb-3">Pré-sinal não é alerta. O alerta só é registrado quando condições reais forem atendidas ao vivo.</p>
          <div className="space-y-1.5">{(isAdvanced ? patterns : patterns.filter(r => r.readiness !== 'not_applicable').slice(0, 4)).map(r => (
            <div key={r.patternId} className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/[0.04] px-4 py-2.5">
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${r.readiness === 'ready' ? 'bg-emerald-500/10 text-emerald-400/70' : 'bg-white/[0.04] text-white/30'}`}>{r.readiness === 'ready' ? 'Pronto' : r.readiness === 'needs_live_data' ? 'Ao vivo' : 'Dados'}</span>
              <span className="text-[12px] text-white/55 flex-1">{r.patternName}</span>
              <span className="text-[10px] text-white/25">{r.watchPoint}</span>
            </div>
          ))}</div>
        </div>
      )}
      {patterns.length === 0 && getActivePatterns().length === 0 && (
        <div className="gs-card text-center py-4"><p className="text-[12px] text-white/40">Nenhum radar ativo para esta partida</p><p className="text-[11px] text-white/25 mt-1">Configure padrões no Command Center para monitorar ao vivo.</p></div>
      )}

      {/* ═══ ANÁLISE AVANÇADA ═══ */}
      {!advanced ? (
        <div className="gs-card text-center py-4">
          <button onClick={loadAdvanced} disabled={loadingAdv} className="gs-btn-secondary" type="button">{loadingAdv ? 'Carregando...' : 'Carregar ausências e jogadores-chave'}</button>
          <p className="text-[10px] text-white/25 mt-2">Consulta sob demanda para preservar limites da API.</p>
        </div>
      ) : (
        <AdvancedResults data={advanced} homeName={homeName} awayName={awayName} isAdvanced={isAdvanced} />
      )}

      {/* ═══ WATCH POINTS ═══ */}
      {score && score.watchPoints.length > 1 && (
        <div className="gs-card">
          <h4 className="gs-section-title mb-2">O que observar ao vivo</h4>
          <div className="space-y-1.5">{score.watchPoints.map((wp, i) => (
            <div key={i} className={`rounded-lg px-4 py-2.5 border-l-[3px] ${wp.severity === 'attention' ? 'border-l-amber-400/50 bg-amber-500/[0.02]' : 'border-l-white/[0.1] bg-white/[0.01]'}`}>
              <span className="text-[12px] text-white/60 block">{wp.label}</span>
              <span className="text-[11px] text-white/35">{wp.detail}{wp.timing ? ` · ${wp.timing}` : ''}</span>
            </div>
          ))}</div>
        </div>
      )}

      {/* ═══ FONTES E LIMITAÇÕES ═══ */}
      {isAdvanced && (data.limitations?.length || data.dataSources?.length) && (
        <div className="rounded-lg bg-white/[0.01] border border-white/[0.03] px-4 py-3">
          <details><summary className="text-[11px] text-white/30 cursor-pointer hover:text-white/50">Auditoria dos dados</summary>
            <div className="mt-2 space-y-1 text-[10px] text-white/25">
              {data.dataSources.map((s, i) => <p key={i}>✓ {s}</p>)}
              {data.limitations?.map((l, i) => <p key={i}>⚠ {l}</p>)}
              <p className="text-white/15 mt-1">Confiança: {data.confidence} · Status: {data.status}</p>
            </div>
          </details>
        </div>
      )}
    </section>
  )
}


// ═══ SUB-COMPONENTS ═══

function Chip({ label, value, score }: { label: string; value: string; score: number }) {
  const color = score >= 70 ? 'border-emerald-500/20 text-emerald-400/70' : score >= 50 ? 'border-white/[0.08] text-white/55' : 'border-white/[0.06] text-white/35'
  return <span className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium ${color}`}>{label}: {value}</span>
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (<div className="text-center"><span className="text-[18px] font-bold text-white/75 block">{value}</span><span className="text-[10px] text-white/40 block">{label}</span>{sub && <span className="text-[9px] text-white/25">{sub}</span>}</div>)
}

function TeamFormCard({ form, label, homeAway, homeAwayLabel }: { form: import('@/services/preMatchIntelligence').TeamFormSummary; label: string; homeAway?: import('@/services/preMatchIntelligence').TeamFormSummary; homeAwayLabel?: string }) {
  return (
    <div className="gs-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-white/65">{form.teamName}</span>
        <span className="text-[10px] text-white/30">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 mb-3">{form.formString.split(' ').map((r, i) => (
        <span key={i} className={`h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold ${r === 'W' ? 'bg-emerald-500/15 text-emerald-400' : r === 'D' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>{r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}</span>
      ))}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><span className="text-[14px] font-bold text-emerald-400/70">{form.summary.wins}</span><span className="text-[10px] text-white/30 block">V</span></div>
        <div><span className="text-[14px] font-bold text-amber-400/70">{form.summary.draws}</span><span className="text-[10px] text-white/30 block">E</span></div>
        <div><span className="text-[14px] font-bold text-rose-400/70">{form.summary.losses}</span><span className="text-[10px] text-white/30 block">D</span></div>
      </div>
      <p className="text-[11px] text-white/35 mt-2 text-center">{form.summary.goalsFor} gols pró · {form.summary.goalsAgainst} contra</p>
      {homeAway && homeAway.matches.length >= 2 && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <span className="text-[10px] text-white/30 block mb-1">{homeAwayLabel}: {homeAway.formString.replace(/W/g, 'V').replace(/L/g, 'D').replace(/D/g, 'E')}</span>
          <span className="text-[10px] text-white/25">{homeAway.summary.wins}V {homeAway.summary.draws}E {homeAway.summary.losses}D · {homeAway.summary.goalsFor} gols</span>
        </div>
      )}
    </div>
  )
}

function AdvancedResults({ data, homeName, awayName, isAdvanced }: { data: PreMatchAdvancedResult; homeName: string; awayName: string; isAdvanced: boolean }) {
  return (
    <div className="space-y-3">
      {(data.absences.home.injuries.length > 0 || data.absences.away.injuries.length > 0 || data.absences.home.suspensions.length > 0 || data.absences.away.suspensions.length > 0) && (
        <div className="gs-card">
          <h4 className="gs-section-title mb-2">Ausências</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(data.absences.home.injuries.length + data.absences.home.suspensions.length > 0) && (
              <div><span className="text-[11px] font-medium text-white/50 block mb-1">{homeName}</span>{data.absences.home.injuries.map((p, i) => <p key={i} className="text-[11px] text-rose-400/60">● {p.name} — {p.reason || 'Lesão'}</p>)}{data.absences.home.suspensions.map((p, i) => <p key={i} className="text-[11px] text-amber-400/60">● {p.name} — Suspenso</p>)}</div>
            )}
            {(data.absences.away.injuries.length + data.absences.away.suspensions.length > 0) && (
              <div><span className="text-[11px] font-medium text-white/50 block mb-1">{awayName}</span>{data.absences.away.injuries.map((p, i) => <p key={i} className="text-[11px] text-rose-400/60">● {p.name} — {p.reason || 'Lesão'}</p>)}{data.absences.away.suspensions.map((p, i) => <p key={i} className="text-[11px] text-amber-400/60">● {p.name} — Suspenso</p>)}</div>
            )}
          </div>
        </div>
      )}
      {(data.scorers.home.players.length > 0 || data.scorers.away.players.length > 0) && (
        <div className="gs-card">
          <h4 className="gs-section-title mb-2">Goleadores</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.scorers.home.players.length > 0 && <div><span className="text-[11px] font-medium text-white/50 block mb-1">{homeName}</span>{data.scorers.home.players.map((p, i) => <p key={i} className="text-[11px] text-white/45">{p.name} — {p.goals} gols{p.assists ? `, ${p.assists} assist.` : ''}</p>)}</div>}
            {data.scorers.away.players.length > 0 && <div><span className="text-[11px] font-medium text-white/50 block mb-1">{awayName}</span>{data.scorers.away.players.map((p, i) => <p key={i} className="text-[11px] text-white/45">{p.name} — {p.goals} gols{p.assists ? `, ${p.assists} assist.` : ''}</p>)}</div>}
          </div>
        </div>
      )}
      {data.riskFlags.length > 0 && (
        <div className="gs-card">
          <h4 className="gs-section-title mb-2">Sinais pré-jogo</h4>
          <div className="space-y-1.5">{data.riskFlags.map((f, i) => (
            <div key={i} className={`rounded-lg px-4 py-2 border-l-[3px] ${f.severity === 'critical' ? 'border-l-rose-400/50 bg-rose-500/[0.02]' : f.severity === 'attention' ? 'border-l-amber-400/40 bg-amber-500/[0.02]' : 'border-l-white/[0.1] bg-white/[0.01]'}`}>
              <span className="text-[12px] text-white/55">{f.label}</span><span className="text-[10px] text-white/30 ml-2">{f.detail}</span>
            </div>
          ))}</div>
        </div>
      )}
      {isAdvanced && data.limitations.length > 0 && <div className="text-[10px] text-white/20 space-y-0.5">{data.limitations.map((l, i) => <p key={i}>· {l}</p>)}<p>Fontes: {data.sources.join(', ')}</p></div>}
    </div>
  )
}
