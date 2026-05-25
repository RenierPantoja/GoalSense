/**
 * War Room Pre-Match — Ultra Premium Edition.
 * Dense, colorful, hierarchical, editorial-grade pre-match intelligence.
 */
import { useEffect, useState, useMemo } from 'react'
import { getPreMatchIntelligence, type PreMatchIntelligenceResult, type TeamFormSummary } from '@/services/preMatchIntelligence'
import { getPreMatchAdvanced, type PreMatchAdvancedResult } from '@/services/intelligence/preMatchAdvanced'
import { getPreMatchPatternReadiness } from '@/services/intelligence/preMatchPatternConnector'
import { calculatePreMatchScore } from '@/services/intelligence/preMatchScoreEngine'
import { useViewMode } from '@/context/ViewModeContext'
import { usePatterns } from '@/features/command/contexts/PatternContext'
import { useFavorites } from '@/context/FavoritesContext'

interface Props { homeName: string; awayName: string; homeId?: string | number; awayId?: string | number; competition?: string; utcDate?: string }

export function PreMatchIntelligencePanel({ homeName, awayName, homeId, awayId, competition, utcDate }: Props) {
  const [data, setData] = useState<PreMatchIntelligenceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [adv, setAdv] = useState<PreMatchAdvancedResult | null>(null)
  const [advLoading, setAdvLoading] = useState(false)
  const { isAdvanced } = useViewMode()
  const { getActivePatterns } = usePatterns()
  const { isFavoriteTeam } = useFavorites()

  useEffect(() => { if (!homeName || !awayName) return; setLoading(true); getPreMatchIntelligence({ homeName, awayName, homeId, awayId, competition, utcDate }).then(setData).finally(() => setLoading(false)) }, [homeName, awayName, homeId, awayId, competition, utcDate])

  const score = useMemo(() => data ? calculatePreMatchScore(data) : null, [data])
  const patterns = useMemo(() => { const a = getActivePatterns(); if (!a.length || !data) return []; return getPreMatchPatternReadiness({ homeName, awayName, activePatterns: a, preMatchData: data, score, isFavoriteTeam }) }, [homeName, awayName, data, score, getActivePatterns, isFavoriteTeam])

  const loadAdv = async () => { setAdvLoading(true); try { setAdv(await getPreMatchAdvanced({ homeName, awayName, homeId: homeId ? Number(homeId) : undefined, awayId: awayId ? Number(awayId) : undefined, goalsProfile: data?.goalsProfile, homeForm: data?.homeForm, awayForm: data?.awayForm, disciplineTrend: data?.disciplineProfile?.trend })) } catch {} finally { setAdvLoading(false) } }

  if (loading) return <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700/30 p-8 animate-pulse"><div className="h-6 w-56 bg-slate-800 rounded-lg mb-4" /><div className="h-4 w-full bg-slate-800/60 rounded mb-2" /><div className="h-40 bg-slate-800/40 rounded-2xl" /></div>

  if (!data || !data.available) return (
    <section className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700/30 p-8">
      <div className="flex items-center gap-3 mb-4"><div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center"><span className="text-[16px]">&#9878;</span></div><div><h3 className="text-[18px] font-bold text-white">Analise Pre-Jogo</h3><p className="text-[12px] text-slate-400">Dados limitados para esta partida</p></div></div>
      <div className="rounded-2xl bg-slate-800/40 border border-slate-700/20 p-5"><p className="text-[14px] text-slate-300 leading-relaxed">Nao encontramos historico suficiente nos providers para montar uma leitura completa deste confronto.</p>{data?.limitations && <div className="mt-3 space-y-1">{data.limitations.map((l, i) => <p key={i} className="text-[12px] text-slate-500 flex items-center gap-2"><span className="text-amber-400">!</span> {l}</p>)}</div>}</div>
    </section>
  )

  const gp = data.goalsProfile; const dp = data.disciplineProfile; const h2h = data.h2h
  const hf = data.homeForm; const af = data.awayForm; const hh = data.homeAtHome; const aa = data.awayAway

  return (
    <section className="space-y-4">
      {/* ═══ HERO ═══ */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border border-slate-700/30 p-7 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-[200px] h-[200px] bg-blue-500/[0.04] rounded-full blur-[80px]" />
        <div className="absolute bottom-0 left-0 w-[150px] h-[150px] bg-cyan-500/[0.03] rounded-full blur-[60px]" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500/30 to-cyan-500/20 flex items-center justify-center border border-blue-400/20"><span className="text-[14px] text-blue-300">&#9878;</span></div>
              <div><h3 className="text-[17px] font-bold text-white">War Room</h3></div>
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${data.status === 'rich' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20' : data.status === 'partial' ? 'bg-amber-500/15 text-amber-300 border border-amber-400/20' : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'}`}>{data.status === 'rich' ? 'Dados ricos' : data.status === 'partial' ? 'Parcial' : 'Limitado'}</span>
            </div>
            <p className="text-[14px] text-slate-300 leading-relaxed mb-4">{data.preview?.summary || 'Leitura em construcao com dados disponiveis.'}</p>
            <div className="flex flex-wrap gap-2">{score && <><ScoreChip label="Equilibrio" value={score.balance.label} score={score.balance.score} /><ScoreChip label="Gols" value={score.goalsTrend.label} score={score.goalsTrend.score} /><ScoreChip label="Disciplina" value={score.disciplineRisk.label} score={score.disciplineRisk.score} /></>}</div>
          </div>
          {score && <div className="text-right shrink-0"><div className="inline-flex flex-col items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-400/15"><span className="text-[32px] font-bold text-white leading-none">{score.overallScore}</span><span className="text-[10px] text-blue-300/70 mt-0.5">/100</span></div><p className="text-[10px] text-slate-500 mt-1.5">{score.confidence}</p></div>}
        </div>
      </div>

      {/* ═══ CONFRONTO ═══ */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-5">
        <div className="grid grid-cols-[1fr_80px_1fr] gap-3 items-start">
          <TeamCol name={homeName} form={hf} venue={hh} venueLabel="Em casa" align="left" />
          <div className="flex flex-col items-center justify-center pt-4 gap-2">
            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700/40 flex items-center justify-center"><span className="text-[10px] text-slate-400 font-bold">VS</span></div>
            {h2h && <span className="text-[9px] text-slate-500">{h2h.total} jogos</span>}
            {score && <span className={`text-[9px] px-2 py-0.5 rounded-full ${score.balance.score >= 65 ? 'bg-slate-800 text-slate-400' : score.homeStrength.score > score.awayStrength.score + 10 ? 'bg-blue-500/10 text-blue-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{score.balance.score >= 65 ? 'Equilibrado' : score.homeStrength.score > score.awayStrength.score + 10 ? 'Casa +' : 'Fora +'}</span>}
          </div>
          <TeamCol name={awayName} form={af} venue={aa} venueLabel="Fora" align="right" />
        </div>
      </div>

      {/* ═══ METRICAS ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Gols */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-5">
          <div className="flex items-center gap-2 mb-3"><div className="h-6 w-6 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/10 flex items-center justify-center"><span className="text-[11px] text-emerald-400">&#9917;</span></div><h4 className="text-[12px] font-bold text-slate-300 uppercase tracking-wide">Perfil de Gols</h4></div>
          {gp ? (<div className="grid grid-cols-2 gap-4"><MetricBox label="Media/jogo" value={String(gp.avgGoalsPerMatch)} color="emerald" /><MetricBox label="Over 2.5" value={`${gp.over25Pct}%`} color={gp.over25Pct >= 55 ? 'emerald' : 'slate'} /><MetricBox label="Over 1.5" value={`${gp.over15Pct}%`} color="slate" /><MetricBox label="Ambos marcam" value={`${gp.bothScoredPct}%`} color={gp.bothScoredPct >= 55 ? 'amber' : 'slate'} /></div>) : <p className="text-[12px] text-slate-500">Sem jogos recentes suficientes no provider.</p>}
        </div>
        {/* Disciplina */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-5">
          <div className="flex items-center gap-2 mb-3"><div className="h-6 w-6 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center"><span className="text-[11px] text-amber-400">&#9888;</span></div><h4 className="text-[12px] font-bold text-slate-300 uppercase tracking-wide">Disciplina</h4></div>
          {dp && dp.trend !== 'unknown' ? (<div className="grid grid-cols-2 gap-4"><MetricBox label={`${homeName.split(' ')[0]}`} value={String(dp.homeYellowAvg)} color="amber" sub="amarelos/j" /><MetricBox label={`${awayName.split(' ')[0]}`} value={String(dp.awayYellowAvg)} color="amber" sub="amarelos/j" /><MetricBox label="Vermelhos" value={String(dp.homeRedTotal + dp.awayRedTotal)} color="rose" /><MetricBox label="Tendencia" value={dp.trend === 'high' ? 'Alta' : dp.trend === 'moderate' ? 'Media' : 'Baixa'} color={dp.trend === 'high' ? 'rose' : 'slate'} /></div>) : <p className="text-[12px] text-slate-500">Provider sem eventos disciplinares recentes.</p>}
        </div>
      </div>

      {/* ═══ H2H ═══ */}
      {h2h && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-5">
          <div className="flex items-center gap-2 mb-4"><div className="h-6 w-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/10 flex items-center justify-center"><span className="text-[11px] text-violet-400">&#8644;</span></div><h4 className="text-[12px] font-bold text-slate-300 uppercase tracking-wide">Confronto Direto</h4><span className="text-[11px] text-slate-500 ml-auto">{h2h.total} jogos</span></div>
          <div className="flex items-center gap-1 mb-3 h-4 rounded-full overflow-hidden"><div className="h-full rounded-l-full bg-gradient-to-r from-blue-400 to-blue-500" style={{ width: `${Math.max(5, (h2h.homeWins / h2h.total) * 100)}%` }} /><div className="h-full bg-slate-600" style={{ width: `${Math.max(5, (h2h.draws / h2h.total) * 100)}%` }} /><div className="h-full rounded-r-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${Math.max(5, (h2h.awayWins / h2h.total) * 100)}%` }} /></div>
          <div className="flex justify-between items-center"><span className="text-[13px] font-bold text-blue-400">{h2h.homeWins} {homeName.split(' ')[0]}</span><span className="text-[12px] text-slate-500">{h2h.draws} empates</span><span className="text-[13px] font-bold text-emerald-400">{h2h.awayWins} {awayName.split(' ')[0]}</span></div>
          <p className="text-[11px] text-slate-500 mt-2">Media historica: {((h2h.homeGoals + h2h.awayGoals) / h2h.total).toFixed(1)} gols/jogo</p>
          {isAdvanced && data.recentMeetings && data.recentMeetings.length > 0 && <div className="mt-3 pt-3 border-t border-slate-700/30 space-y-1.5">{data.recentMeetings.slice(0, 3).map((m, i) => <p key={i} className="text-[11px] text-slate-400">{new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} — {m.homeTeam} <span className="text-white font-bold">{m.homeScore}-{m.awayScore}</span> {m.awayTeam}</p>)}</div>}
        </div>
      )}

      {/* ═══ WATCH POINTS ═══ */}
      {score && score.watchPoints.length > 0 && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-5">
          <div className="flex items-center gap-2 mb-3"><div className="h-6 w-6 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/10 flex items-center justify-center"><span className="text-[11px] text-cyan-400">&#9673;</span></div><h4 className="text-[12px] font-bold text-slate-300 uppercase tracking-wide">Observar ao Vivo</h4></div>
          <div className="space-y-2.5">{score.watchPoints.map((wp, i) => (<div key={i} className="flex items-start gap-3"><div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${wp.severity === 'attention' ? 'bg-amber-400' : 'bg-cyan-400/60'}`} /><div><p className="text-[13px] text-slate-200 font-medium">{wp.label}</p><p className="text-[11px] text-slate-500">{wp.detail}{wp.timing ? ` · ${wp.timing}` : ''}</p></div></div>))}</div>
        </div>
      )}

      {/* ═══ PADROES ═══ */}
      {patterns.length > 0 ? (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-5">
          <div className="flex items-center gap-2 mb-3"><div className="h-6 w-6 rounded-lg bg-gradient-to-br from-rose-500/20 to-pink-500/10 flex items-center justify-center"><span className="text-[11px] text-rose-400">&#9733;</span></div><h4 className="text-[12px] font-bold text-slate-300 uppercase tracking-wide">Padroes Monitoraveis</h4></div>
          <div className="space-y-2">{(isAdvanced ? patterns : patterns.filter(r => r.readiness !== 'not_applicable').slice(0, 4)).map(r => (<div key={r.patternId} className="flex items-center gap-3 rounded-xl bg-slate-800/50 border border-slate-700/20 px-4 py-2.5"><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${r.readiness === 'ready' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20' : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'}`}>{r.readiness === 'ready' ? 'Pronto' : 'Ao vivo'}</span><span className="text-[12px] text-slate-300 flex-1">{r.patternName}</span>{r.triggerWindow && <span className="text-[10px] text-slate-500">{r.triggerWindow}</span>}</div>))}</div>
        </div>
      ) : getActivePatterns().length === 0 ? (
        <div className="rounded-2xl bg-slate-900/60 border border-dashed border-slate-700/30 p-6 text-center"><p className="text-[13px] text-slate-400 font-medium">Nenhum radar ativo</p><p className="text-[11px] text-slate-500 mt-1">Configure padroes no Command Center para monitorar ao vivo.</p></div>
      ) : null}

      {/* ═══ AVANCADO ═══ */}
      {!adv ? (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-700/25 p-5">
          <div className="flex items-center gap-2 mb-2"><div className="h-6 w-6 rounded-lg bg-gradient-to-br from-slate-600/30 to-slate-700/20 flex items-center justify-center"><span className="text-[11px] text-slate-400">+</span></div><h4 className="text-[13px] font-semibold text-slate-300">Elenco e disponibilidade</h4></div>
          <p className="text-[11px] text-slate-500 mb-3">Ausencias, goleadores e sinais adicionais. Sob demanda para preservar limite da API.</p>
          <button onClick={loadAdv} disabled={advLoading} className="px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-gradient-to-r from-blue-500/15 to-cyan-500/15 text-cyan-300 border border-cyan-400/20 hover:from-blue-500/25 hover:to-cyan-500/25 disabled:opacity-40 transition-all" type="button">{advLoading ? 'Carregando...' : 'Carregar analise avancada'}</button>
        </div>
      ) : <AdvPanel data={adv} homeName={homeName} awayName={awayName} isAdvanced={isAdvanced} />}

      {/* ═══ AUDITORIA ═══ */}
      {isAdvanced && <details className="rounded-xl bg-slate-900/40 border border-slate-800/30 px-4 py-3"><summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-400">Auditoria dos dados</summary><div className="mt-2 space-y-1 text-[10px] text-slate-600"><p>Status: {data.status} · Confianca: {data.confidence}</p><p>Forma: {hf ? `${hf.matches.length}j` : 'n/a'} / {af ? `${af.matches.length}j` : 'n/a'} · Casa/fora: {hh ? `${hh.matches.length}` : 'n/a'} / {aa ? `${aa.matches.length}` : 'n/a'}</p><p>Gols: {gp ? 'sim' : 'nao'} · Disciplina: {dp ? dp.trend : 'n/a'} · H2H: {h2h ? `${h2h.total}` : 'n/a'}</p><p>Fontes: {data.dataSources.join(', ') || 'nenhuma'}</p>{data.limitations?.map((l, i) => <p key={i} className="text-slate-700">! {l}</p>)}</div></details>}
    </section>
  )
}


// ═══ Components ═══

function ScoreChip({ label, value, score }: { label: string; value: string; score: number }) {
  const bg = score >= 70 ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : score >= 50 ? 'bg-blue-500/10 text-blue-300 border-blue-400/15' : 'bg-slate-700/40 text-slate-400 border-slate-600/20'
  return <span className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border ${bg}`}>{label}: {value}</span>
}

function MetricBox({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  const c = color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : color === 'rose' ? 'text-rose-400' : 'text-white'
  return <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3 text-center"><span className={`text-[20px] font-bold ${c} block leading-tight`}>{value}</span><span className="text-[10px] text-slate-500 block mt-0.5">{label}</span>{sub && <span className="text-[9px] text-slate-600">{sub}</span>}</div>
}

function TeamCol({ name, form, venue, venueLabel, align }: { name: string; form?: TeamFormSummary; venue?: TeamFormSummary; venueLabel: string; align: 'left' | 'right' }) {
  const ta = align === 'right' ? 'text-right' : 'text-left'
  const fj = align === 'right' ? 'justify-end' : 'justify-start'
  return (
    <div className={ta}>
      <p className="text-[15px] font-bold text-white mb-2">{name}</p>
      {form ? (<>
        <div className={`flex gap-1 mb-2 ${fj}`}>{form.formString.split(' ').map((r, i) => <span key={i} className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${r === 'W' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/15' : r === 'D' ? 'bg-amber-500/15 text-amber-300 border border-amber-400/10' : 'bg-rose-500/15 text-rose-300 border border-rose-400/10'}`}>{r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}</span>)}</div>
        <div className="space-y-1 text-[12px]">
          <div className={`flex items-center gap-2 ${fj}`}><span className="text-slate-500">Gols pro</span><span className="text-emerald-400 font-bold">{form.summary.goalsFor}</span></div>
          <div className={`flex items-center gap-2 ${fj}`}><span className="text-slate-500">Gols contra</span><span className="text-rose-400 font-bold">{form.summary.goalsAgainst}</span></div>
          <div className={`flex items-center gap-2 ${fj}`}><span className="text-slate-500">Saldo</span><span className={`font-bold ${form.summary.goalsFor - form.summary.goalsAgainst > 0 ? 'text-emerald-400' : form.summary.goalsFor - form.summary.goalsAgainst < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{form.summary.goalsFor - form.summary.goalsAgainst > 0 ? '+' : ''}{form.summary.goalsFor - form.summary.goalsAgainst}</span></div>
        </div>
        {venue && venue.matches.length >= 2 && <div className="mt-2 pt-2 border-t border-slate-700/20"><p className="text-[10px] text-slate-500 mb-0.5">{venueLabel}</p><p className="text-[11px] text-slate-400">{venue.summary.wins}V {venue.summary.draws}E {venue.summary.losses}D · {venue.summary.goalsFor} gols</p></div>}
      </>) : <p className="text-[12px] text-slate-600">Forma indisponivel</p>}
    </div>
  )
}

function AdvPanel({ data, homeName, awayName, isAdvanced }: { data: PreMatchAdvancedResult; homeName: string; awayName: string; isAdvanced: boolean }) {
  const hasAbs = data.absences.home.injuries.length + data.absences.away.injuries.length + data.absences.home.suspensions.length + data.absences.away.suspensions.length > 0
  const hasScorers = data.scorers.home.players.length + data.scorers.away.players.length > 0
  return (
    <div className="space-y-3">
      {hasAbs && <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-5"><div className="flex items-center gap-2 mb-3"><div className="h-6 w-6 rounded-lg bg-rose-500/15 flex items-center justify-center"><span className="text-[11px] text-rose-400">&#10006;</span></div><h4 className="text-[12px] font-bold text-slate-300 uppercase tracking-wide">Ausencias</h4></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{(data.absences.home.injuries.length + data.absences.home.suspensions.length > 0) && <div><p className="text-[12px] font-semibold text-slate-400 mb-1.5">{homeName}</p>{data.absences.home.injuries.map((p, i) => <p key={i} className="text-[12px] text-rose-400/80 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />{p.name}</p>)}{data.absences.home.suspensions.map((p, i) => <p key={i} className="text-[12px] text-amber-400/80 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{p.name} (suspenso)</p>)}</div>}{(data.absences.away.injuries.length + data.absences.away.suspensions.length > 0) && <div><p className="text-[12px] font-semibold text-slate-400 mb-1.5">{awayName}</p>{data.absences.away.injuries.map((p, i) => <p key={i} className="text-[12px] text-rose-400/80 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />{p.name}</p>)}{data.absences.away.suspensions.map((p, i) => <p key={i} className="text-[12px] text-amber-400/80 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{p.name} (suspenso)</p>)}</div>}</div></div>}
      {hasScorers && <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-5"><div className="flex items-center gap-2 mb-3"><div className="h-6 w-6 rounded-lg bg-emerald-500/15 flex items-center justify-center"><span className="text-[11px] text-emerald-400">&#9917;</span></div><h4 className="text-[12px] font-bold text-slate-300 uppercase tracking-wide">Goleadores</h4></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{data.scorers.home.players.length > 0 && <div><p className="text-[12px] font-semibold text-slate-400 mb-1.5">{homeName}</p>{data.scorers.home.players.map((p, i) => <p key={i} className="text-[12px] text-slate-300">{p.name} — <span className="text-emerald-400 font-bold">{p.goals}g</span>{p.assists ? <span className="text-blue-400"> {p.assists}a</span> : null}</p>)}</div>}{data.scorers.away.players.length > 0 && <div><p className="text-[12px] font-semibold text-slate-400 mb-1.5">{awayName}</p>{data.scorers.away.players.map((p, i) => <p key={i} className="text-[12px] text-slate-300">{p.name} — <span className="text-emerald-400 font-bold">{p.goals}g</span>{p.assists ? <span className="text-blue-400"> {p.assists}a</span> : null}</p>)}</div>}</div></div>}
      {!hasAbs && !hasScorers && <div className="rounded-2xl bg-slate-900/60 border border-slate-700/20 p-5 text-center"><p className="text-[12px] text-slate-500">Provider nao retornou ausencias ou goleadores para esta liga.</p></div>}
      {data.riskFlags.length > 0 && <div className="rounded-2xl bg-slate-900/80 border border-slate-700/25 p-4">{data.riskFlags.map((f, i) => <p key={i} className="text-[12px] text-slate-300 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${f.severity === 'critical' ? 'bg-rose-400' : f.severity === 'attention' ? 'bg-amber-400' : 'bg-slate-500'}`} />{f.label} — <span className="text-slate-500">{f.detail}</span></p>)}</div>}
      {isAdvanced && data.limitations.length > 0 && <p className="text-[10px] text-slate-600 px-1">{data.limitations.join(' · ')}</p>}
    </div>
  )
}
