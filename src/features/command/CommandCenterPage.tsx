/**
 * Command Center — Motor de Decisão GoalSense.
 * Responde: "Qual jogo abrir agora? Por quê? Qual ação tomar?"
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, TrendingUp, ChevronRight, AlertCircle } from 'lucide-react'
import { getLiveFixtures, type LiveFixture } from '@/lib/apiClient'
import { storeFixtureForNavigation } from '@/lib/matchNavigation'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { useFavorites } from '@/context/FavoritesContext'
import { useAlerts } from '@/context/AlertsContext'
import { useViewMode } from '@/context/ViewModeContext'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { getMatchImportanceScore } from '@/utils/matchImportance'
import { formatMatchTime } from '@/utils/matchDate'
import { buildCommandSignals } from './commandSignals'
import { isLiveFx, getOperationalState, getDecisionReason, getActionPlan, getDataHealth, getOperationalDecision, detectChanges, type ChangeEvent, type OperationalDecision } from './commandHelpers'

function toScoring(fx: LiveFixture) {
  return { competition: { name: fx.league.name }, homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name }, awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name }, score: { fullTime: { home: fx.score.home, away: fx.score.away } }, status: fx.status.short === 'LIVE' || fx.status.short === 'HT' ? 'IN_PLAY' : fx.status.short === 'FT' ? 'FINISHED' : 'TIMED', utcDate: fx.date, area: { name: fx.league.country } }
}

export function CommandCenterPage() {
  const navigate = useNavigate()
  const [fixtures, setFixtures] = useState<LiveFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(() => { try { return localStorage.getItem('goalsense_command_autorefresh') !== 'false' } catch { return true } })
  const [changes, setChanges] = useState<ChangeEvent[]>([])
  const prevFixturesRef = useRef<LiveFixture[] | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { alerts, enabledCount } = useAlerts()
  const { isAdvanced } = useViewMode()

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try {
      const r = await getLiveFixtures()
      const newFixtures = r.fixtures || []
      // Detect changes
      const detected = detectChanges(newFixtures, prevFixturesRef.current)
      if (detected.length > 0) setChanges(prev => [...detected, ...prev].slice(0, 8))
      prevFixturesRef.current = newFixtures
      setFixtures(newFixtures); setLastUpdate(new Date()); setError(null)
    } catch (e) { if (!silent) setError((e as Error).message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (!autoRefresh) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => fetchData(true), liveMatches.length > 0 ? 25000 : 60000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchData])

  const toggleAuto = () => { const n = !autoRefresh; setAutoRefresh(n); try { localStorage.setItem('goalsense_command_autorefresh', String(n)) } catch {} }

  const liveMatches = useMemo(() => fixtures.filter(isLiveFx), [fixtures])
  const soonMatches = useMemo(() => fixtures.filter(fx => fx.status.short === 'NS' && new Date(fx.date).getTime() - Date.now() <= 3600000 && new Date(fx.date).getTime() > Date.now()), [fixtures])
  const favoriteMatches = useMemo(() => fixtures.filter(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)), [fixtures, isFavoriteTeam])
  const mainMatches = useMemo(() => [...fixtures].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a))).slice(0, 10), [fixtures])
  const activeAlerts = useMemo(() => alerts.filter(a => a.enabled), [alerts])
  const signals = useMemo(() => buildCommandSignals({ liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam }), [liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam])
  const opState = useMemo(() => getOperationalState(fixtures, liveMatches.length, soonMatches.length, favoriteMatches.length, enabledCount), [fixtures, liveMatches, soonMatches, favoriteMatches, enabledCount])
  const actions = useMemo(() => getActionPlan(liveMatches.length, favoriteMatches.length, enabledCount, soonMatches.length), [liveMatches, favoriteMatches, enabledCount, soonMatches])
  const health = useMemo(() => getDataHealth(fixtures, lastUpdate), [fixtures, lastUpdate])

  // Decision queue: all relevant matches with operational decision
  const decisionQueue = useMemo(() => {
    const relevant = [...liveMatches, ...soonMatches.slice(0, 4), ...mainMatches.slice(0, 4)]
    const unique = Array.from(new Map(relevant.map(fx => [fx.id, fx])).values())
    return unique.map(fx => ({ fixture: fx, decision: getOperationalDecision(fx, isFavoriteTeam, activeAlerts.some(a => a.targetName.toLowerCase().includes(fx.homeTeam.name.toLowerCase()) || a.targetName.toLowerCase().includes(fx.awayTeam.name.toLowerCase()))) })).sort((a, b) => b.decision.urgency - a.decision.urgency).slice(0, 8)
  }, [liveMatches, soonMatches, mainMatches, isFavoriteTeam, activeAlerts])

  const priorityMatch = decisionQueue[0]?.fixture || null

  const openMatch = (fx: LiveFixture) => { storeFixtureForNavigation(fx); navigate(`/app/matches/${fx.id}`, { state: { fixture: fx } }) }
  const timeSince = lastUpdate ? Math.round((Date.now() - lastUpdate.getTime()) / 1000) : null

  if (loading) return <div className="max-w-[1240px] mx-auto flex items-center justify-center min-h-[50vh]"><div className="flex flex-col items-center gap-4"><div className="relative h-12 w-12"><div className="absolute inset-0 rounded-full border-2 border-cyan-400/10" /><div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" /></div><span className="text-[11px] text-white/20">Inicializando cockpit...</span></div></div>

  return (
    <div className="max-w-[1240px] mx-auto space-y-5 animate-fadeIn">

      {/* ═══ COMMAND HEADER + OPERATIONAL STATE ═══ */}
      <header className="relative rounded-[22px] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#080c14] via-[#0a0e18] to-[#0c1020]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.025),transparent_60%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/15 to-transparent" />
        <div className="relative p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2.5"><h1 className="text-[22px] font-bold text-white tracking-tight">Command Center</h1><span className="text-[7px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full bg-emerald-500/8 text-emerald-400/70 border border-emerald-500/12">Online</span></div>
              <p className="text-[10px] text-white/20 mt-0.5">{opState.headline}{timeSince !== null && ` · ${timeSince < 60 ? `${timeSince}s` : `${Math.floor(timeSince / 60)}min`}`}{refreshing && <span className="text-cyan-400/30 ml-2 animate-pulse">●</span>}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={toggleAuto} className={`h-6 px-2 rounded-md text-[7px] font-bold uppercase tracking-wider transition-all ${autoRefresh ? 'bg-emerald-500/8 text-emerald-400/60 border border-emerald-500/10' : 'text-white/12 border border-white/[0.03]'}`} type="button">Auto</button>
              <button onClick={() => fetchData()} disabled={refreshing} className="h-6 w-6 rounded-md flex items-center justify-center text-white/15 border border-white/[0.04] hover:text-white/40 transition-all disabled:opacity-20" type="button" aria-label="Atualizar"><RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="flex gap-1">
            {opState.metrics.map(m => (
              <div key={m.label} className={`flex-1 rounded-lg px-3 py-2 ${m.attention && m.value > 0 ? 'bg-white/[0.02] border border-white/[0.05]' : 'border border-transparent'}`}>
                <span className={`text-[18px] font-bold tabular-nums block leading-none ${m.attention && m.value > 0 ? (m.color === 'emerald' ? 'text-emerald-400' : m.color === 'cyan' ? 'text-cyan-400' : m.color === 'rose' ? 'text-rose-400' : m.color === 'amber' ? 'text-amber-400' : 'text-violet-400') : 'text-white/10'}`}>{m.value}</span>
                <span className="text-[7px] text-white/15 uppercase tracking-[0.12em] mt-0.5 block">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {error && <div className="rounded-lg border border-rose-500/8 bg-rose-500/[0.015] px-3 py-2 text-[9px] text-rose-400/50 flex items-center gap-2"><AlertCircle size={10} />{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-5">
        {/* LEFT — Decision Engine */}
        <div className="space-y-5">

          {/* ═══ DECISÃO AGORA ═══ */}
          {priorityMatch && (() => {
            const d = decisionQueue[0].decision
            return (
              <div onClick={() => openMatch(priorityMatch)} className="group relative rounded-[20px] overflow-hidden cursor-pointer transition-all hover:shadow-[0_0_50px_-20px_rgba(34,211,238,0.06)]" role="button">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1a] via-[#080c16] to-[#0b1020]" />
                <div className="absolute inset-0 border border-cyan-500/[0.08] rounded-[20px] group-hover:border-cyan-500/[0.14] transition-colors" />
                <div className="absolute top-0 left-1/3 w-[250px] h-[80px] bg-cyan-500/[0.02] rounded-full blur-[45px]" />
                <div className="relative p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.4)] animate-pulse" /><span className="text-[8px] font-bold uppercase tracking-[0.25em] text-cyan-400/55">Decisão agora</span></div>
                    <div className="flex items-center gap-2">
                      <FavoriteButton active={isFavoriteMatch(buildCanonicalMatchId(priorityMatch.homeTeam.name, priorityMatch.awayTeam.name, priorityMatch.date))} onClick={() => toggleFavoriteMatch({ canonicalMatchId: buildCanonicalMatchId(priorityMatch.homeTeam.name, priorityMatch.awayTeam.name, priorityMatch.date), homeTeam: priorityMatch.homeTeam.name, awayTeam: priorityMatch.awayTeam.name, competition: priorityMatch.league.name, utcDate: priorityMatch.date })} size={13} />
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${isLiveFx(priorityMatch) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/12' : 'text-white/18'}`}>{isLiveFx(priorityMatch) ? `${priorityMatch.status.elapsed || ''}'` : formatMatchTime(priorityMatch.date)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col items-center gap-2.5 w-[110px]"><ClubLogo src={priorityMatch.homeTeam.logo} name={priorityMatch.homeTeam.name} size={60} /><span className="text-[10px] font-bold text-white/75 text-center leading-tight">{priorityMatch.homeTeam.name}</span></div>
                    <div className="flex flex-col items-center gap-1.5"><div className="flex items-baseline gap-3"><span className="text-[42px] font-bold tabular-nums text-white leading-none">{priorityMatch.score.home ?? '-'}</span><span className="text-[14px] text-white/8">:</span><span className="text-[42px] font-bold tabular-nums text-white leading-none">{priorityMatch.score.away ?? '-'}</span></div>{isLiveFx(priorityMatch) && <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)] animate-pulse" />}</div>
                    <div className="flex flex-col items-center gap-2.5 w-[110px]"><ClubLogo src={priorityMatch.awayTeam.logo} name={priorityMatch.awayTeam.name} size={60} /><span className="text-[10px] font-bold text-white/45 text-center leading-tight">{priorityMatch.awayTeam.name}</span></div>
                  </div>
                  <div className="mt-5 pt-4 border-t border-white/[0.03] grid grid-cols-[1fr_auto] gap-4">
                    <div>
                      <span className="text-[8px] text-cyan-400/35 font-medium uppercase tracking-wider block mb-1">Recomendação</span>
                      <span className="text-[10px] text-white/40">{d.reason}</span>
                      <span className="text-[9px] text-white/20 block mt-0.5">{priorityMatch.league.name}</span>
                    </div>
                    <div className="flex items-end gap-2">{isAdvanced && <span className="text-[7px] text-white/10 font-mono">{getMatchImportanceScore(toScoring(priorityMatch))} · {d.confidence}</span>}<span className="text-[9px] text-cyan-400/50 group-hover:text-cyan-400 font-bold transition-colors flex items-center gap-1">Abrir <TrendingUp size={10} /></span></div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ═══ FILA DE COMANDO ═══ */}
          {decisionQueue.length > 1 && (
            <div>
              <h3 className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/20 mb-2.5 pl-1">Fila de comando</h3>
              <div className="space-y-1">
                {decisionQueue.slice(1).map(({ fixture: fx, decision: d }) => (
                  <div key={fx.id} onClick={() => openMatch(fx)} className="group flex items-center gap-3 rounded-[12px] border border-white/[0.03] bg-white/[0.008] px-3.5 py-2.5 cursor-pointer hover:border-white/[0.08] hover:bg-white/[0.015] transition-all" role="button">
                    <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${d.action === 'open_now' ? 'bg-cyan-500/10 text-cyan-400/70' : d.action === 'monitor' ? 'bg-amber-500/8 text-amber-400/60' : d.action === 'prepare_alert' ? 'bg-violet-500/8 text-violet-400/60' : 'bg-white/[0.03] text-white/20'}`}>{d.label}</span>
                    <span className={`text-[9px] font-semibold tabular-nums w-7 shrink-0 ${isLiveFx(fx) ? 'text-emerald-400' : 'text-white/15'}`}>{isLiveFx(fx) ? `${fx.status.elapsed || ''}'` : ''}</span>
                    <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={16} />
                    <span className="text-[10px] font-medium text-white/50 truncate flex-1">{fx.homeTeam.name} {fx.score.home ?? '-'}:{fx.score.away ?? '-'} {fx.awayTeam.name}</span>
                    <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={16} />
                    <span className="text-[8px] text-white/15 truncate max-w-[60px]">{d.reason}</span>
                    {isAdvanced && <span className="text-[7px] text-white/8 font-mono shrink-0">{d.urgency}</span>}
                    <ChevronRight size={10} className="text-white/8 group-hover:text-white/25 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {decisionQueue.length === 0 && (
            <div className="rounded-[16px] border border-white/[0.03] border-dashed bg-white/[0.005] p-8 text-center">
              <p className="text-[11px] text-white/18">Sem jogos relevantes no momento</p>
              <p className="text-[9px] text-white/10 mt-1">Próximos jogos aparecerão quando disponíveis</p>
            </div>
          )}
        </div>

        {/* RIGHT — Intelligence */}
        <div className="space-y-4">

          {/* ═══ RADAR DE MUDANÇAS ═══ */}
          {changes.length > 0 && (
            <div className="rounded-[16px] border border-white/[0.04] bg-gradient-to-b from-white/[0.015] to-transparent p-3.5">
              <h4 className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-400/35 mb-2.5">Mudanças</h4>
              <div className="space-y-1.5">
                {changes.slice(0, 4).map(c => (
                  <div key={c.id} className={`rounded-md px-2.5 py-1.5 border-l-2 ${c.type === 'score_change' ? 'border-l-emerald-400/50 bg-emerald-500/[0.02]' : c.type === 'final_phase' ? 'border-l-amber-400/40 bg-amber-500/[0.02]' : 'border-l-cyan-400/20 bg-white/[0.005]'}`}>
                    <span className="text-[8px] text-white/35">{c.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signals */}
          {signals.length > 0 && (
            <div className="rounded-[16px] border border-white/[0.04] bg-white/[0.01] p-3.5">
              <h4 className="text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-400/30 mb-2.5 flex items-center gap-1"><Zap size={8} className="text-cyan-400/35" />Sinais</h4>
              <div className="space-y-1">
                {signals.slice(0, 4).map(s => (
                  <div key={s.id} className={`rounded-md border border-white/[0.02] border-l-2 ${s.severity === 'critical' ? 'border-l-rose-400/40' : s.severity === 'attention' ? 'border-l-amber-400/30' : 'border-l-white/[0.06]'} px-2.5 py-1.5`}>
                    <span className="text-[8px] font-semibold text-white/40 block">{s.title}</span>
                    <span className="text-[7px] text-white/15 block">{s.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Personal Panel */}
          {favoriteMatches.length === 0 && (
            <div className="rounded-[16px] border border-white/[0.03] border-dashed bg-white/[0.005] p-4 text-center">
              <span className="text-[9px] text-white/20 block">Personalize o Command Center</span>
              <span className="text-[8px] text-white/12 block mt-0.5">Favorite times para priorizar seu radar</span>
              <button onClick={() => navigate('/app/matches')} className="text-[8px] text-cyan-400/40 hover:text-cyan-400/70 font-medium mt-2 transition-colors" type="button">Explorar →</button>
            </div>
          )}

          {/* Actions */}
          <div className="rounded-[16px] border border-white/[0.04] bg-white/[0.008] p-3.5">
            <h4 className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/15 mb-2">Ações</h4>
            {actions.slice(0, 4).map((a, i) => (
              <button key={i} onClick={() => navigate(a.target)} className="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-white/[0.015] transition-colors group" type="button">
                <span className="text-[8px] text-white/22 group-hover:text-white/45">{a.label}</span>
                <ChevronRight size={8} className="text-white/8 group-hover:text-white/20" />
              </button>
            ))}
          </div>

          {/* Advanced diagnostics */}
          {isAdvanced && (
            <div className="rounded-[16px] border border-white/[0.02] bg-white/[0.003] p-3.5">
              <h4 className="text-[7px] font-bold uppercase tracking-[0.2em] text-white/10 mb-1.5">Diagnóstico</h4>
              <div className="space-y-0.5 text-[7px]">
                <div className="flex justify-between"><span className="text-white/12">Fixtures</span><span className="text-white/18 tabular-nums">{health.totalFixtures}</span></div>
                <div className="flex justify-between"><span className="text-white/12">Providers</span><span className="text-white/18">{health.providers.join(', ')}</span></div>
                <div className="flex justify-between"><span className="text-white/12">Atualização</span><span className="text-white/18">{health.lastUpdate}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
