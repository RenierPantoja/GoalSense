/**
 * War Room Pre-Match — dense, comparative, premium pre-match intelligence.
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

  if (loading) return <div className="rounded-2xl border border-white/[0.06] bg-[#0b111c] p-6 animate-pulse space-y-3"><div className="h-5 w-52 bg-white/[0.05] rounded" /><div className="h-4 w-full bg-white/[0.04] rounded" /><div className="h-32 bg-white/[0.03] rounded-xl" /></div>

  // Fallback when no data at all
  if (!data || !data.available) return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0b111c] p-6">
      <h3 className="text-[17px] font-bold text-white/85 mb-2">War Room Pre-Jogo</h3>
      <p className="text-[13px] text-white/50 leading-relaxed">Dados pre-jogo limitados para esta partida. O GoalSense tentou buscar historico nos providers, mas nao encontrou amostra suficiente.</p>
      {data?.limitations && data.limitations.length > 0 && <div className="mt-3 space-y-1">{data.limitations.map((l, i) => <p key={i} className="text-[11px] text-white/30">- {l}</p>)}</div>}
      <p className="text-[12px] text-white/35 mt-4">Configure padroes no Command Center para monitorar esta partida ao vivo.</p>
    </section>
  )

  const gp = data.goalsProfile; const dp = data.disciplineProfile; const h2h = data.h2h
  const hf = data.homeForm; const af = data.awayForm; const hh = data.homeAtHome; const aa = data.awayAway

  return (
    <section className="space-y-4">
      {/* ═══ A. HERO TATICO ═══ */}
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0a0f18] via-[#0c1220] to-[#0e1424] p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[200px] h-[100px] bg-cyan-500/[0.02] rounded-full blur-[60px]" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[18px] font-bold text-white/90">War Room</h3>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${data.status === 'rich' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/15' : data.status === 'partial' ? 'text-amber-300 bg-amber-500/10 border-amber-500/15' : 'text-white/40 bg-white/[0.04] border-white/[0.08]'}`}>{data.status === 'rich' ? 'Rico' : data.status === 'partial' ? 'Parcial' : 'Limitado'}</span>
            </div>
            <p className="text-[13px] text-white/55 leading-relaxed mb-3">{data.preview?.summary || 'Leitura em construcao.'}</p>
            <div className="flex flex-wrap gap-2">
              {score && <><Chip label="Equilibrio" val={score.balance.label} s={score.balance.score} /><Chip label="Gols" val={score.goalsTrend.label} s={score.goalsTrend.score} /><Chip label="Disciplina" val={score.disciplineRisk.label} s={score.disciplineRisk.score} /></>}
              {!score && <span className="text-[11px] text-white/30">Score indisponivel por dados insuficientes</span>}
            </div>
          </div>
          {score && <div className="text-right shrink-0"><span className="text-[38px] font-bold tabular-nums text-white/85 leading-none">{score.overallScore}</span><span className="text-[11px] text-white/30 block mt-1">/100 · {score.confidence}</span></div>}
        </div>
      </div>

      {/* ═══ C. MAPA DO CONFRONTO ═══ */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#0b111c] p-5">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/40 mb-4">Mapa do confronto</h4>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
          {/* Mandante */}
          <div>
            <p className="text-[14px] font-bold text-white/80 mb-1">{homeName}</p>
            {hf ? (<><div className="flex gap-1 mb-2">{hf.formString.split(' ').map((r, i) => <span key={i} className={`h-6 w-6 rounded flex items-center justify-center text-[9px] font-bold ${r === 'W' ? 'bg-emerald-500/20 text-emerald-400' : r === 'D' ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-400'}`}>{r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}</span>)}</div><div className="space-y-1 text-[12px]"><Row l="Gols pro" v={String(hf.summary.goalsFor)} /><Row l="Gols contra" v={String(hf.summary.goalsAgainst)} />{hh && hh.matches.length >= 2 && <Row l="Em casa" v={`${hh.summary.wins}V ${hh.summary.draws}E ${hh.summary.losses}D`} />}</div></>) : <p className="text-[11px] text-white/30">Forma indisponivel</p>}
          </div>
          {/* Centro */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <span className="text-[10px] text-white/25 uppercase tracking-wider">vs</span>
            {score && <span className={`text-[11px] font-medium px-2 py-1 rounded-lg ${score.balance.score >= 65 ? 'text-white/50 bg-white/[0.04]' : score.homeStrength.score > score.awayStrength.score + 10 ? 'text-cyan-400/60 bg-cyan-500/8' : 'text-emerald-400/60 bg-emerald-500/8'}`}>{score.balance.score >= 65 ? 'Equilibrado' : score.homeStrength.score > score.awayStrength.score + 10 ? 'Mandante +' : 'Visitante +'}</span>}
            {h2h && <span className="text-[10px] text-white/25">{h2h.total} confrontos</span>}
          </div>
          {/* Visitante */}
          <div className="text-right">
            <p className="text-[14px] font-bold text-white/80 mb-1">{awayName}</p>
            {af ? (<><div className="flex gap-1 justify-end mb-2">{af.formString.split(' ').map((r, i) => <span key={i} className={`h-6 w-6 rounded flex items-center justify-center text-[9px] font-bold ${r === 'W' ? 'bg-emerald-500/20 text-emerald-400' : r === 'D' ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-400'}`}>{r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}</span>)}</div><div className="space-y-1 text-[12px] text-right"><Row l="Gols pro" v={String(af.summary.goalsFor)} right /><Row l="Gols contra" v={String(af.summary.goalsAgainst)} right />{aa && aa.matches.length >= 2 && <Row l="Fora" v={`${aa.summary.wins}V ${aa.summary.draws}E ${aa.summary.losses}D`} right />}</div></>) : <p className="text-[11px] text-white/30">Forma indisponivel</p>}
          </div>
        </div>
      </div>

      {/* ═══ E. PERFIL DE GOLS + DISCIPLINA ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.07] bg-[#0b111c] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-3">Perfil de gols</h4>
          {gp ? (<div className="grid grid-cols-2 gap-3"><Stat label="Media" value={String(gp.avgGoalsPerMatch)} tag={gp.avgGoalsPerMatch >= 2.5 ? 'Forte' : 'Mod.'} /><Stat label="Over 2.5" value={`${gp.over25Pct}%`} /><Stat label="Over 1.5" value={`${gp.over15Pct}%`} /><Stat label="Ambos" value={`${gp.bothScoredPct}%`} tag={gp.bothScoredPct >= 60 ? 'Freq.' : ''} /></div>) : <p className="text-[11px] text-white/30">Indisponivel — sem jogos recentes suficientes.</p>}
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-[#0b111c] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-3">Disciplina</h4>
          {dp && dp.trend !== 'unknown' ? (<div className="grid grid-cols-2 gap-3"><Stat label={homeName.split(' ')[0]} value={String(dp.homeYellowAvg)} tag="amarelos/j" /><Stat label={awayName.split(' ')[0]} value={String(dp.awayYellowAvg)} tag="amarelos/j" /><Stat label="Vermelhos" value={String(dp.homeRedTotal + dp.awayRedTotal)} /><Stat label="Tendencia" value={dp.trend === 'high' ? 'Alta' : dp.trend === 'moderate' ? 'Moderada' : 'Baixa'} /></div>) : <p className="text-[11px] text-white/30">Indisponivel — provider sem eventos disciplinares recentes.</p>}
        </div>
      </div>

      {/* ═══ F. H2H ═══ */}
      {h2h ? (
        <div className="rounded-xl border border-white/[0.07] bg-[#0b111c] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-3">Confronto direto · {h2h.total} jogos</h4>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-3 rounded-full overflow-hidden flex"><div className="bg-cyan-400/60" style={{ width: `${(h2h.homeWins / h2h.total) * 100}%` }} /><div className="bg-white/10" style={{ width: `${(h2h.draws / h2h.total) * 100}%` }} /><div className="bg-emerald-400/60" style={{ width: `${(h2h.awayWins / h2h.total) * 100}%` }} /></div>
          </div>
          <div className="flex justify-between text-[12px]"><span className="text-cyan-400/70 font-bold">{h2h.homeWins} {homeName.split(' ')[0]}</span><span className="text-white/35">{h2h.draws} empates</span><span className="text-emerald-400/70 font-bold">{h2h.awayWins} {awayName.split(' ')[0]}</span></div>
          <p className="text-[11px] text-white/30 mt-2">Media: {((h2h.homeGoals + h2h.awayGoals) / h2h.total).toFixed(1)} gols/jogo no historico</p>
          {isAdvanced && data.recentMeetings && data.recentMeetings.length > 0 && <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-1">{data.recentMeetings.slice(0, 3).map((m, i) => <p key={i} className="text-[10px] text-white/30">{new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} — {m.homeTeam} {m.homeScore}-{m.awayScore} {m.awayTeam}</p>)}</div>}
        </div>
      ) : <div className="rounded-xl border border-white/[0.06] bg-[#0b111c] p-4"><h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-2">H2H</h4><p className="text-[11px] text-white/30">Confronto direto indisponivel no provider.</p></div>}

      {/* ═══ G. PADROES ═══ */}
      {patterns.length > 0 ? (
        <div className="rounded-xl border border-white/[0.07] bg-[#0b111c] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-2">Padroes monitoraveis</h4>
          <p className="text-[10px] text-white/25 mb-3">Pre-sinal nao e alerta. O alerta so e registrado ao vivo.</p>
          <div className="space-y-1.5">{(isAdvanced ? patterns : patterns.filter(r => r.readiness !== 'not_applicable').slice(0, 4)).map(r => (
            <div key={r.patternId} className="flex items-center gap-2 rounded-lg bg-white/[0.025] border border-white/[0.05] px-3 py-2">
              <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${r.readiness === 'ready' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.05] text-white/30'}`}>{r.readiness === 'ready' ? 'Pronto' : 'Ao vivo'}</span>
              <span className="text-[12px] text-white/60 flex-1">{r.patternName}</span>
              {r.triggerWindow && <span className="text-[10px] text-white/25">{r.triggerWindow}</span>}
            </div>
          ))}</div>
        </div>
      ) : getActivePatterns().length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.06] bg-[#0b111c] p-5 text-center"><p className="text-[12px] text-white/45">Nenhum radar ativo</p><p className="text-[11px] text-white/25 mt-1">Configure padroes no Command Center para monitorar ao vivo.</p></div>
      ) : null}

      {/* ═══ H. WATCH POINTS ═══ */}
      {score && score.watchPoints.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-[#0b111c] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-3">O que observar ao vivo</h4>
          <div className="space-y-2">{score.watchPoints.map((wp, i) => (
            <div key={i} className="flex items-start gap-2"><span className="text-cyan-400/50 mt-0.5">▸</span><div><span className="text-[12px] text-white/60 block">{wp.label}</span><span className="text-[11px] text-white/30">{wp.detail}{wp.timing ? ` · ${wp.timing}` : ''}</span></div></div>
          ))}</div>
        </div>
      )}

      {/* ═══ I. AVANCADO SOB DEMANDA ═══ */}
      {!adv ? (
        <div className="rounded-xl border border-white/[0.06] bg-[#0b111c] p-5">
          <h4 className="text-[12px] font-semibold text-white/55 mb-1">Elenco e disponibilidade</h4>
          <p className="text-[11px] text-white/30 mb-3">Consulte ausencias, suspensoes, goleadores e sinais adicionais. Dados carregados sob demanda para preservar limite da API.</p>
          <button onClick={loadAdv} disabled={advLoading} className="px-4 py-2 rounded-xl text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/15 disabled:opacity-40 transition-colors" type="button">{advLoading ? 'Carregando...' : 'Carregar analise avancada'}</button>
        </div>
      ) : <AdvPanel data={adv} homeName={homeName} awayName={awayName} isAdvanced={isAdvanced} />}

      {/* ═══ J. AUDITORIA ═══ */}
      {isAdvanced && (
        <details className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-4 py-3">
          <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50">Auditoria dos dados</summary>
          <div className="mt-2 space-y-1 text-[10px] text-white/25">
            <p>Status: {data.status} · Confianca: {data.confidence}</p>
            <p>Forma geral: {hf ? `${hf.matches.length} jogos` : 'indisponivel'} / {af ? `${af.matches.length} jogos` : 'indisponivel'}</p>
            <p>Casa/fora: {hh ? `${hh.matches.length} casa` : 'n/a'} / {aa ? `${aa.matches.length} fora` : 'n/a'}</p>
            <p>Goals profile: {gp ? 'disponivel' : 'indisponivel'} · Disciplina: {dp ? dp.trend : 'indisponivel'}</p>
            <p>H2H: {h2h ? `${h2h.total} confrontos` : 'indisponivel'}</p>
            <p>Fontes: {data.dataSources.join(', ') || 'nenhuma'}</p>
            {data.limitations && data.limitations.length > 0 && <>{data.limitations.map((l, i) => <p key={i} className="text-white/20">⚠ {l}</p>)}</>}
          </div>
        </details>
      )}
    </section>
  )
}

// ═══ Micro-components ═══

function Chip({ label, val, s }: { label: string; val: string; s: number }) {
  const c = s >= 70 ? 'border-emerald-500/20 text-emerald-300/70' : s >= 50 ? 'border-white/[0.1] text-white/55' : 'border-white/[0.06] text-white/35'
  return <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-medium ${c}`}>{label}: {val}</span>
}

function Stat({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return <div><span className="text-[18px] font-bold text-white/80 block leading-tight">{value}</span><span className="text-[10px] text-white/35">{label}</span>{tag && <span className="text-[9px] text-white/25 ml-1">{tag}</span>}</div>
}

function Row({ l, v, right }: { l: string; v: string; right?: boolean }) {
  return <div className={`flex items-center justify-between ${right ? 'flex-row-reverse' : ''}`}><span className="text-white/35">{l}</span><span className="text-white/70 font-semibold">{v}</span></div>
}

function AdvPanel({ data, homeName, awayName, isAdvanced }: { data: PreMatchAdvancedResult; homeName: string; awayName: string; isAdvanced: boolean }) {
  const hasAbs = data.absences.home.injuries.length + data.absences.away.injuries.length + data.absences.home.suspensions.length + data.absences.away.suspensions.length > 0
  const hasScorers = data.scorers.home.players.length + data.scorers.away.players.length > 0
  return (
    <div className="space-y-3">
      {hasAbs && <div className="rounded-xl border border-white/[0.07] bg-[#0b111c] p-4"><h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-2">Ausencias</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{(data.absences.home.injuries.length + data.absences.home.suspensions.length > 0) && <div><p className="text-[11px] font-medium text-white/50 mb-1">{homeName}</p>{data.absences.home.injuries.map((p, i) => <p key={i} className="text-[11px] text-rose-400/60">● {p.name} — {p.reason || 'Lesao'}</p>)}{data.absences.home.suspensions.map((p, i) => <p key={i} className="text-[11px] text-amber-400/60">● {p.name} — Suspenso</p>)}</div>}{(data.absences.away.injuries.length + data.absences.away.suspensions.length > 0) && <div><p className="text-[11px] font-medium text-white/50 mb-1">{awayName}</p>{data.absences.away.injuries.map((p, i) => <p key={i} className="text-[11px] text-rose-400/60">● {p.name} — {p.reason || 'Lesao'}</p>)}{data.absences.away.suspensions.map((p, i) => <p key={i} className="text-[11px] text-amber-400/60">● {p.name} — Suspenso</p>)}</div>}</div></div>}
      {hasScorers && <div className="rounded-xl border border-white/[0.07] bg-[#0b111c] p-4"><h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-2">Goleadores</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{data.scorers.home.players.length > 0 && <div><p className="text-[11px] font-medium text-white/50 mb-1">{homeName}</p>{data.scorers.home.players.map((p, i) => <p key={i} className="text-[11px] text-white/45">{p.name} — {p.goals}g{p.assists ? ` ${p.assists}a` : ''}</p>)}</div>}{data.scorers.away.players.length > 0 && <div><p className="text-[11px] font-medium text-white/50 mb-1">{awayName}</p>{data.scorers.away.players.map((p, i) => <p key={i} className="text-[11px] text-white/45">{p.name} — {p.goals}g{p.assists ? ` ${p.assists}a` : ''}</p>)}</div>}</div></div>}
      {!hasAbs && !hasScorers && <div className="rounded-xl border border-white/[0.06] bg-[#0b111c] p-4 text-center"><p className="text-[11px] text-white/30">Provider nao retornou ausencias ou goleadores para esta liga.</p></div>}
      {data.riskFlags.length > 0 && <div className="rounded-xl border border-white/[0.07] bg-[#0b111c] p-4"><h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 mb-2">Sinais</h4>{data.riskFlags.map((f, i) => <p key={i} className="text-[11px] text-white/45">▸ {f.label} — <span className="text-white/30">{f.detail}</span></p>)}</div>}
      {isAdvanced && data.limitations.length > 0 && <p className="text-[10px] text-white/20">{data.limitations.join(' · ')}</p>}
    </div>
  )
}
