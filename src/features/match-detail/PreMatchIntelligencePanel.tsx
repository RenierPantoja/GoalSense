/**
 * War Room Pre-Match — Single Panel Apple-like.
 * One immersive container with internal sections divided by subtle separators.
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

  if (loading) return <WarRoomShell><div className="animate-pulse space-y-3"><div className="h-6 w-56 bg-white/[0.04] rounded" /><div className="h-4 w-full bg-white/[0.03] rounded" /><div className="h-32 bg-white/[0.02] rounded-2xl" /></div></WarRoomShell>

  if (!data || !data.available) return (
    <WarRoomShell>
      <Header status="limitado" />
      <Divider />
      <div className="px-7 py-6"><p className="text-[14px] text-white/55 leading-relaxed">Dados pre-jogo limitados para esta partida. O GoalSense tentou buscar historico nos providers, mas nao encontrou amostra suficiente.</p>{data?.limitations && <div className="mt-3 space-y-1">{data.limitations.map((l, i) => <p key={i} className="text-[12px] text-white/35 flex items-center gap-2"><span className="text-amber-400/70">·</span> {l}</p>)}</div>}</div>
    </WarRoomShell>
  )

  const gp = data.goalsProfile; const dp = data.disciplineProfile; const h2h = data.h2h
  const hf = data.homeForm; const af = data.awayForm; const hh = data.homeAtHome; const aa = data.awayAway

  const balanceLabel = !score ? 'Limitado' : score.balance.score >= 65 ? 'Equilibrado' : score.homeStrength.score > score.awayStrength.score + 10 ? 'Mandante +' : 'Visitante +'

  return (
    <WarRoomShell>
      {/* ═══ HEADER ═══ */}
      <div className="px-7 pt-6 pb-5 relative">
        <div className="absolute top-0 right-0 w-[280px] h-[120px] bg-blue-500/[0.04] rounded-full blur-[80px] pointer-events-none" />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-400/60">War Room · Pre-Jogo</span>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${data.status === 'rich' ? 'bg-emerald-500/12 text-emerald-300' : data.status === 'partial' ? 'bg-amber-500/12 text-amber-300' : 'bg-white/[0.06] text-white/45'}`}>{data.status === 'rich' ? 'Rico' : data.status === 'partial' ? 'Parcial' : 'Limitado'}</span>
            </div>
            <h2 className="text-[22px] font-bold text-white tracking-tight leading-tight mb-1">{homeName} <span className="text-white/30 font-normal mx-1.5">vs</span> {awayName}</h2>
            <p className="text-[13px] text-white/50 leading-relaxed">{data.preview?.summary || 'Leitura em construcao com dados disponiveis.'}</p>
          </div>
          {score && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right"><span className="text-[10px] text-white/35 uppercase tracking-wider block">Score</span><span className="text-[10px] text-white/30 block">{score.confidence}</span></div>
              <div className="relative h-[68px] w-[68px] rounded-2xl bg-gradient-to-br from-blue-500/20 via-cyan-500/15 to-blue-500/5 border border-cyan-400/20 flex flex-col items-center justify-center"><div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent" /><span className="relative text-[28px] font-bold text-white leading-none">{score.overallScore}</span><span className="relative text-[9px] text-cyan-300/60">/100</span></div>
            </div>
          )}
        </div>
        {/* Chips */}
        {score && <div className="relative flex flex-wrap gap-1.5 mt-4">
          <Chip icon="◌" label="Equilibrio" value={balanceLabel} score={score.balance.score} />
          <Chip icon="∿" label="Gols" value={score.goalsTrend.label} score={score.goalsTrend.score} />
          <Chip icon="●" label="Disciplina" value={score.disciplineRisk.label} score={score.disciplineRisk.score} />
        </div>}
      </div>

      <Divider />

      {/* ═══ MAPA DO CONFRONTO ═══ */}
      <div className="px-7 py-6">
        <SectionLabel>Mapa do Confronto</SectionLabel>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-6 items-start">
          <TeamCol name={homeName} form={hf} venue={hh} venueLabel="Em casa" align="left" />
          <div className="flex flex-col items-center justify-center pt-6 gap-2">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.08] flex items-center justify-center"><span className="text-[10px] text-white/40 font-bold tracking-wider">VS</span></div>
            {h2h && <span className="text-[10px] text-white/40 font-medium">{h2h.total} confrontos</span>}
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${score && score.balance.score >= 65 ? 'bg-white/[0.05] text-white/55' : score && score.homeStrength.score > score.awayStrength.score + 10 ? 'bg-blue-500/12 text-blue-300' : score && score.awayStrength.score > score.homeStrength.score + 10 ? 'bg-emerald-500/12 text-emerald-300' : 'bg-white/[0.04] text-white/40'}`}>{balanceLabel}</span>
          </div>
          <TeamCol name={awayName} form={af} venue={aa} venueLabel="Fora" align="right" />
        </div>
      </div>

      <Divider />

      {/* ═══ INTELLIGENCE GRID ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Gols */}
        <div className="px-7 py-6 md:border-r border-white/[0.05]">
          <SectionLabel icon="∿">Perfil de Gols</SectionLabel>
          {gp ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Media/jogo" value={String(gp.avgGoalsPerMatch)} accent="emerald" />
                <Metric label="Ambos marcam" value={`${gp.bothScoredPct}%`} accent={gp.bothScoredPct >= 55 ? 'amber' : 'slate'} />
              </div>
              <Bar label="Over 1.5" pct={gp.over15Pct} color="cyan" />
              <Bar label="Over 2.5" pct={gp.over25Pct} color="emerald" />
            </div>
          ) : <p className="text-[12px] text-white/35">Sem jogos recentes suficientes para calcular tendencia.</p>}
        </div>
        {/* Disciplina */}
        <div className="px-7 py-6 border-t md:border-t-0 border-white/[0.05]">
          <SectionLabel icon="●">Disciplina</SectionLabel>
          {dp && dp.trend !== 'unknown' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Metric label={`${homeName.split(' ')[0]} amarelos/j`} value={String(dp.homeYellowAvg)} accent="amber" />
                <Metric label={`${awayName.split(' ')[0]} amarelos/j`} value={String(dp.awayYellowAvg)} accent="amber" />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/[0.025] border border-white/[0.05] px-4 py-2.5">
                <span className="text-[11px] text-white/45">Tendencia</span>
                <span className={`text-[12px] font-bold ${dp.trend === 'high' ? 'text-rose-400' : dp.trend === 'moderate' ? 'text-amber-400' : 'text-emerald-400'}`}>{dp.trend === 'high' ? 'Alta' : dp.trend === 'moderate' ? 'Moderada' : 'Baixa'}</span>
              </div>
              {(dp.homeRedTotal + dp.awayRedTotal) > 0 && <p className="text-[11px] text-rose-400/70">{dp.homeRedTotal + dp.awayRedTotal} cartoes vermelhos recentes</p>}
            </div>
          ) : <p className="text-[12px] text-white/35">Provider sem eventos disciplinares recentes.</p>}
        </div>
      </div>

      <Divider />

      {/* ═══ H2H ═══ */}
      <div className="px-7 py-6">
        <SectionLabel icon="⬢">Confronto Direto</SectionLabel>
        {h2h ? (
          <div>
            <div className="flex items-center gap-1 mb-3 h-3.5 rounded-full overflow-hidden bg-white/[0.04]">
              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500" style={{ width: `${(h2h.homeWins / h2h.total) * 100}%` }} />
              <div className="h-full bg-white/[0.12]" style={{ width: `${(h2h.draws / h2h.total) * 100}%` }} />
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${(h2h.awayWins / h2h.total) * 100}%` }} />
            </div>
            <div className="flex justify-between items-center text-[12px]">
              <div><span className="text-blue-400 font-bold">{h2h.homeWins}V</span> <span className="text-white/40">{homeName.split(' ')[0]}</span></div>
              <span className="text-white/40 font-medium">{h2h.draws} empates</span>
              <div><span className="text-white/40">{awayName.split(' ')[0]}</span> <span className="text-emerald-400 font-bold">{h2h.awayWins}V</span></div>
            </div>
            <p className="text-[11px] text-white/45 mt-3">Media historica: <span className="text-white/70 font-semibold">{((h2h.homeGoals + h2h.awayGoals) / h2h.total).toFixed(1)} gols/jogo</span> · {h2h.total} confrontos analisados</p>
            {isAdvanced && data.recentMeetings && data.recentMeetings.length > 0 && <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1.5">{data.recentMeetings.slice(0, 3).map((m, i) => <div key={i} className="flex items-center gap-3 text-[11px]"><span className="text-white/30 tabular-nums w-16">{new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span><span className="text-white/55 flex-1">{m.homeTeam}</span><span className="text-white/85 font-bold">{m.homeScore}-{m.awayScore}</span><span className="text-white/55 flex-1 text-right">{m.awayTeam}</span></div>)}</div>}
          </div>
        ) : <p className="text-[12px] text-white/35">Confronto direto indisponivel no provider.</p>}
      </div>

      <Divider />

      {/* ═══ OPERACAO AO VIVO ═══ */}
      <div className="px-7 py-6">
        <SectionLabel icon="▲">Operacao ao Vivo</SectionLabel>
        {patterns.length > 0 ? (
          <div className="space-y-1.5 mb-4">{(isAdvanced ? patterns : patterns.filter(r => r.readiness !== 'not_applicable').slice(0, 4)).map(r => (
            <div key={r.patternId} className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.05] px-4 py-2.5">
              <span className={`h-2 w-2 rounded-full ${r.readiness === 'ready' ? 'bg-emerald-400' : 'bg-cyan-400/40'}`} />
              <span className="text-[12px] text-white/65 flex-1 font-medium">{r.patternName}</span>
              <span className="text-[10px] text-white/30">{r.readiness === 'ready' ? 'Pronto' : 'Aguarda live'}</span>
              {r.triggerWindow && <span className="text-[10px] text-white/45 font-medium">{r.triggerWindow}</span>}
            </div>
          ))}</div>
        ) : getActivePatterns().length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] px-5 py-4 mb-4 text-center">
            <p className="text-[12px] text-white/55 font-medium">Nenhum radar ativo</p>
            <p className="text-[11px] text-white/35 mt-0.5">Configure padroes no Command Center para monitorar ao vivo.</p>
          </div>
        ) : null}

        {score && score.watchPoints.length > 0 && (
          <div className="space-y-2">{score.watchPoints.slice(0, 4).map((wp, i) => (
            <div key={i} className="flex items-start gap-3"><span className={`text-[10px] mt-0.5 ${wp.severity === 'attention' ? 'text-amber-400' : 'text-cyan-400/70'}`}>▸</span><div className="flex-1"><span className="text-[12px] text-white/70 font-medium">{wp.label}</span><span className="text-[11px] text-white/40 ml-2">{wp.detail}{wp.timing ? ` · ${wp.timing}` : ''}</span></div></div>
          ))}</div>
        )}
      </div>

      <Divider />

      {/* ═══ AVANCADO ═══ */}
      <div className="px-7 py-6">
        <SectionLabel icon="◍">Elenco e Disponibilidade</SectionLabel>
        {!adv ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[12px] text-white/45">Ausencias, suspensoes, goleadores e jogadores-chave. Sob demanda para preservar limite da API.</p>
            <button onClick={loadAdv} disabled={advLoading} className="px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-gradient-to-r from-cyan-500/15 to-blue-500/15 text-cyan-300 border border-cyan-400/20 hover:from-cyan-500/25 hover:to-blue-500/25 disabled:opacity-40 transition-all whitespace-nowrap" type="button">{advLoading ? 'Carregando...' : 'Carregar avancada'}</button>
          </div>
        ) : <AdvContent data={adv} homeName={homeName} awayName={awayName} />}
      </div>

      {/* ═══ AUDITORIA ═══ */}
      {isAdvanced && <><Divider /><div className="px-7 py-5"><details><summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50 uppercase tracking-wider font-semibold">Auditoria Tecnica</summary><div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-[10px] text-white/40">{[['Status', data.status], ['Confianca', data.confidence], ['Forma', `${hf ? hf.matches.length + 'j' : 'n/a'} / ${af ? af.matches.length + 'j' : 'n/a'}`], ['Casa/Fora', `${hh ? hh.matches.length : 'n/a'} / ${aa ? aa.matches.length : 'n/a'}`], ['Gols', gp ? 'sim' : 'nao'], ['Disciplina', dp ? dp.trend : 'n/a'], ['H2H', h2h ? `${h2h.total}` : 'n/a'], ['Fontes', data.dataSources.length || 0]].map(([k, v]) => <div key={k} className="flex items-center justify-between rounded bg-white/[0.02] px-2 py-1"><span>{k}</span><span className="text-white/65 font-medium">{v}</span></div>)}</div>{data.limitations && data.limitations.length > 0 && <div className="mt-2 space-y-0.5">{data.limitations.map((l, i) => <p key={i} className="text-[10px] text-amber-400/40">! {l}</p>)}</div>}</details></div></>}
    </WarRoomShell>
  )
}

// ═══ Components ═══

function WarRoomShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] overflow-hidden border border-white/[0.07] bg-gradient-to-br from-[#0a0d14] via-[#0b1018] to-[#0c1322] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.5)] relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.025),transparent_60%)] pointer-events-none" />
      <div className="relative">{children}</div>
    </section>
  )
}

function Header({ status }: { status: string }) {
  return <div className="px-7 pt-6 pb-4"><div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-400/60">War Room · Pre-Jogo</span><span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/[0.06] text-white/45">{status}</span></div></div>
}

function Divider() { return <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" /> }

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return <div className="flex items-center gap-2 mb-4">{icon && <span className="text-[12px] text-cyan-400/50">{icon}</span>}<h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">{children}</h4></div>
}

function Chip({ icon, label, value, score }: { icon: string; label: string; value: string; score: number }) {
  const c = score >= 70 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/15' : score >= 50 ? 'bg-blue-500/10 text-blue-300 border-blue-400/15' : 'bg-white/[0.04] text-white/45 border-white/[0.08]'
  return <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border ${c}`}><span className="opacity-60">{icon}</span><span className="text-white/45">{label}</span><span className="font-bold">{value}</span></span>
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  const c = accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : accent === 'rose' ? 'text-rose-400' : 'text-white/85'
  return <div><span className={`text-[22px] font-bold ${c} block leading-tight`}>{value}</span><span className="text-[11px] text-white/45">{label}</span></div>
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const c = color === 'emerald' ? 'from-emerald-500 to-emerald-400' : color === 'cyan' ? 'from-cyan-500 to-cyan-400' : 'from-blue-500 to-blue-400'
  return <div><div className="flex items-center justify-between mb-1"><span className="text-[11px] text-white/50">{label}</span><span className="text-[12px] text-white/85 font-bold tabular-nums">{pct}%</span></div><div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden"><div className={`h-full bg-gradient-to-r ${c}`} style={{ width: `${pct}%` }} /></div></div>
}

function TeamCol({ name, form, venue, venueLabel, align }: { name: string; form?: TeamFormSummary; venue?: TeamFormSummary; venueLabel: string; align: 'left' | 'right' }) {
  const ta = align === 'right' ? 'text-right' : 'text-left'
  const fj = align === 'right' ? 'justify-end' : 'justify-start'
  return (
    <div className={ta}>
      <p className="text-[15px] font-bold text-white mb-2.5 truncate">{name}</p>
      {form ? (<>
        <div className={`flex gap-1 mb-3 ${fj}`}>{form.formString.split(' ').map((r, i) => <span key={i} className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${r === 'W' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/15' : r === 'D' ? 'bg-amber-500/15 text-amber-300 border border-amber-400/10' : 'bg-rose-500/15 text-rose-300 border border-rose-400/10'}`}>{r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}</span>)}</div>
        <div className="space-y-1.5 text-[12px]">
          <div className={`flex items-center gap-3 ${fj}`}><span className="text-white/40">Pro</span><span className="text-emerald-400 font-bold tabular-nums">{form.summary.goalsFor}</span></div>
          <div className={`flex items-center gap-3 ${fj}`}><span className="text-white/40">Contra</span><span className="text-rose-400 font-bold tabular-nums">{form.summary.goalsAgainst}</span></div>
          <div className={`flex items-center gap-3 ${fj}`}><span className="text-white/40">Saldo</span><span className={`font-bold tabular-nums ${form.summary.goalsFor - form.summary.goalsAgainst > 0 ? 'text-emerald-400' : form.summary.goalsFor - form.summary.goalsAgainst < 0 ? 'text-rose-400' : 'text-white/55'}`}>{form.summary.goalsFor - form.summary.goalsAgainst > 0 ? '+' : ''}{form.summary.goalsFor - form.summary.goalsAgainst}</span></div>
        </div>
        {venue && venue.matches.length >= 2 && <div className="mt-3 pt-3 border-t border-white/[0.05]"><p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{venueLabel}</p><p className="text-[11px] text-white/55"><span className="text-emerald-400/70">{venue.summary.wins}V</span> {venue.summary.draws}E <span className="text-rose-400/70">{venue.summary.losses}D</span></p></div>}
      </>) : <p className="text-[11px] text-white/30">Forma indisponivel</p>}
    </div>
  )
}

function AdvContent({ data, homeName, awayName }: { data: PreMatchAdvancedResult; homeName: string; awayName: string }) {
  const hasAbs = data.absences.home.injuries.length + data.absences.away.injuries.length + data.absences.home.suspensions.length + data.absences.away.suspensions.length > 0
  const hasScorers = data.scorers.home.players.length + data.scorers.away.players.length > 0
  if (!hasAbs && !hasScorers) return <p className="text-[12px] text-white/35">Provider nao retornou ausencias ou goleadores para esta liga.</p>
  return (
    <div className="space-y-4">
      {hasAbs && <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><p className="text-[10px] uppercase tracking-wider text-white/35 mb-2">{homeName} · Ausencias</p>{data.absences.home.injuries.map((p, i) => <p key={i} className="text-[12px] text-rose-400/80 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />{p.name}</p>)}{data.absences.home.suspensions.map((p, i) => <p key={i} className="text-[12px] text-amber-400/80 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{p.name}</p>)}</div><div><p className="text-[10px] uppercase tracking-wider text-white/35 mb-2">{awayName} · Ausencias</p>{data.absences.away.injuries.map((p, i) => <p key={i} className="text-[12px] text-rose-400/80 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />{p.name}</p>)}{data.absences.away.suspensions.map((p, i) => <p key={i} className="text-[12px] text-amber-400/80 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{p.name}</p>)}</div></div>}
      {hasScorers && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/[0.04]"><div><p className="text-[10px] uppercase tracking-wider text-white/35 mb-2">{homeName} · Goleadores</p>{data.scorers.home.players.map((p, i) => <p key={i} className="text-[12px] text-white/65">{p.name} <span className="text-emerald-400 font-bold ml-1">{p.goals}g</span>{p.assists ? <span className="text-blue-400 ml-1">{p.assists}a</span> : null}</p>)}</div><div><p className="text-[10px] uppercase tracking-wider text-white/35 mb-2">{awayName} · Goleadores</p>{data.scorers.away.players.map((p, i) => <p key={i} className="text-[12px] text-white/65">{p.name} <span className="text-emerald-400 font-bold ml-1">{p.goals}g</span>{p.assists ? <span className="text-blue-400 ml-1">{p.assists}a</span> : null}</p>)}</div></div>}
    </div>
  )
}
