/**
 * Command Center — Central de Decisão GoalSense.
 * Responde: "O que importa agora e qual ação eu devo tomar?"
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
import { buildCommandSignals, type CommandSignal } from './commandSignals'
import { isLiveFx, getOperationalState, groupCommandMatches, getDecisionReason, getActionPlan, getDataHealth, type CommandGroup } from './commandHelpers'

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { alerts, enabledCount } = useAlerts()
  const { isAdvanced } = useViewMode()

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try { const r = await getLiveFixtures(); setFixtures(r.fixtures || []); setLastUpdate(new Date()); setError(null) }
    catch (e) { if (!silent) setError((e as Error).message) }
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
  const mainMatches = useMemo(() => [...fixtures].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a))).slice(0, 8), [fixtures])
  const activeAlerts = useMemo(() => alerts.filter(a => a.enabled), [alerts])
  const signals = useMemo(() => buildCommandSignals({ liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam }), [liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam])
  const opState = useMemo(() => getOperationalState(fixtures, liveMatches.length, soonMatches.length, favoriteMatches.length, enabledCount), [fixtures, liveMatches, soonMatches, favoriteMatches, enabledCount])
  const groups = useMemo(() => groupCommandMatches(fixtures, isFavoriteTeam), [fixtures, isFavoriteTeam])
  const actions = useMemo(() => getActionPlan(liveMatches.length, favoriteMatches.length, enabledCount, soonMatches.length), [liveMatches, favoriteMatches, enabledCount, soonMatches])
  const health = useMemo(() => getDataHealth(fixtures, lastUpdate), [fixtures, lastUpdate])

  const priorityMatch = useMemo(() => {
    const favLive = liveMatches.find(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name))
    if (favLive) return favLive
    if (liveMatches.length > 0) return [...liveMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a)))[0]
    if (soonMatches.length > 0) return [...soonMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a)))[0]
    return mainMatches[0] || null
  }, [liveMatches, soonMatches, mainMatches, isFavoriteTeam])

  const openMatch = (fx: LiveFixture) => { storeFixtureForNavigation(fx); navigate(`/app/matches/${fx.id}`, { state: { fixture: fx } }) }

  if (loading) return <div className="max-w-[1200px] mx-auto flex items-center justify-center min-h-[50vh]"><div className="flex flex-col items-center gap-4"><div className="h-10 w-10 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" /><span className="text-[11px] text-white/20">Inicializando Command Center...</span></div></div>

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 animate-fadeIn">
      {/* ═══ 1. SALA DE CONTROLE ═══ */}
      <header className="rounded-[22px] border border-white/[0.04] bg-gradient-to-r from-[#0b0f18] to-[#0d1220] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-bold text-white tracking-tight">Command Center</h1>
            <p className="text-[10px] text-white/25 mt-0.5 flex items-center gap-2">{opState.headline}{refreshing && <span className="text-cyan-400/40 animate-pulse text-[9px]">Atualizando</span>}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleAuto} className={`px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'text-white/15 border border-white/[0.05]'}`} type="button">Auto {autoRefresh ? 'ON' : 'OFF'}</button>
            <button onClick={() => fetchData()} disabled={refreshing} className="p-2 rounded-lg text-white/25 border border-white/[0.05] hover:text-white/50 transition-all disabled:opacity-30" type="button" aria-label="Atualizar"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /></button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {opState.metrics.map(m => (
            <div key={m.label} className={`rounded-xl px-3 py-2.5 border transition-all ${m.attention && m.value > 0 ? 'border-white/[0.06] bg-white/[0.02]' : 'border-transparent bg-white/[0.008]'}`}>
              <span className={`text-[18px] font-bold tabular-nums block ${m.attention && m.value > 0 ? `text-${m.color === 'emerald' ? 'emerald' : m.color === 'cyan' ? 'cyan' : m.color === 'rose' ? 'rose' : m.color === 'amber' ? 'amber' : 'violet'}-400` : 'text-white/15'}`}>{m.value}</span>
              <span className="text-[8px] text-white/20 uppercase tracking-wider">{m.label}</span>
            </div>
          ))}
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-500/10 bg-rose-500/[0.02] px-4 py-2 text-[10px] text-rose-400/60 flex items-center gap-2"><AlertCircle size={11} />{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
        {/* LEFT */}
        <div className="space-y-5">
          {/* ═══ 2. DECISÃO AGORA ═══ */}
          {priorityMatch && (
            <div onClick={() => openMatch(priorityMatch)} className="group relative rounded-[22px] border border-cyan-500/[0.1] bg-gradient-to-br from-[#0c1018] via-[#090d16] to-[#0c1220] p-6 cursor-pointer hover:border-cyan-500/20 transition-all overflow-hidden" role="button" aria-label="Abrir análise">
              <div className="absolute top-0 left-1/3 w-[200px] h-[80px] bg-cyan-500/[0.025] rounded-full blur-[50px] pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" /><span className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-400/60">Decisão agora</span></div>
                  <div className="flex items-center gap-2">
                    <FavoriteButton active={isFavoriteMatch(buildCanonicalMatchId(priorityMatch.homeTeam.name, priorityMatch.awayTeam.name, priorityMatch.date))} onClick={() => toggleFavoriteMatch({ canonicalMatchId: buildCanonicalMatchId(priorityMatch.homeTeam.name, priorityMatch.awayTeam.name, priorityMatch.date), homeTeam: priorityMatch.homeTeam.name, awayTeam: priorityMatch.awayTeam.name, competition: priorityMatch.league.name, utcDate: priorityMatch.date })} size={13} />
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${isLiveFx(priorityMatch) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'text-white/20'}`}>{isLiveFx(priorityMatch) ? `${priorityMatch.status.elapsed || ''}'` : formatMatchTime(priorityMatch.date)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col items-center gap-2 w-[100px]"><ClubLogo src={priorityMatch.homeTeam.logo} name={priorityMatch.homeTeam.name} size={52} /><span className="text-[10px] font-bold text-white/70 text-center leading-tight">{priorityMatch.homeTeam.name}</span></div>
                  <div className="flex flex-col items-center gap-1.5"><div className="flex items-baseline gap-3"><span className="text-[34px] font-bold tabular-nums text-white">{priorityMatch.score.home ?? '-'}</span><span className="text-[12px] text-white/10">:</span><span className="text-[34px] font-bold tabular-nums text-white">{priorityMatch.score.away ?? '-'}</span></div>{isLiveFx(priorityMatch) && <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}</div>
                  <div className="flex flex-col items-center gap-2 w-[100px]"><ClubLogo src={priorityMatch.awayTeam.logo} name={priorityMatch.awayTeam.name} size={52} /><span className="text-[10px] font-bold text-white/45 text-center leading-tight">{priorityMatch.awayTeam.name}</span></div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.03]">
                  <div><span className="text-[9px] text-white/20 block">{priorityMatch.league.name}</span><span className="text-[9px] text-white/30 italic">{getDecisionReason(priorityMatch, isFavoriteTeam)}</span></div>
                  <div className="flex items-center gap-2">{isAdvanced && <span className="text-[7px] text-white/10 font-mono">{getMatchImportanceScore(toScoring(priorityMatch))}</span>}<span className="text-[9px] text-cyan-400/50 group-hover:text-cyan-400/90 font-bold transition-colors flex items-center gap-1">Abrir análise <TrendingUp size={10} /></span></div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ 4. MESA DE MONITORAMENTO ═══ */}
          {groups.map(g => (
            <div key={g.id}>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2.5 pl-1">{g.title}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {g.matches.map(fx => (
                  <div key={fx.id} onClick={() => openMatch(fx)} className="group rounded-[14px] border border-white/[0.04] bg-white/[0.012] p-3.5 cursor-pointer hover:border-white/[0.1] hover:bg-white/[0.02] transition-all" role="button">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[8px] font-semibold ${isLiveFx(fx) ? 'text-emerald-400' : 'text-white/15'}`}>{isLiveFx(fx) ? `${fx.status.elapsed || ''}'` : formatMatchTime(fx.date)}</span>
                      {isAdvanced && <span className="text-[7px] text-white/10 font-mono">{getMatchImportanceScore(toScoring(fx))}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5"><ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={20} /><span className="text-[10px] font-semibold text-white/60 truncate max-w-[65px]">{fx.homeTeam.name}</span></div>
                      <span className="text-[13px] font-bold tabular-nums text-white/75">{fx.score.home ?? '-'} : {fx.score.away ?? '-'}</span>
                      <div className="flex items-center gap-1.5"><span className="text-[10px] font-semibold text-white/40 truncate max-w-[65px]">{fx.awayTeam.name}</span><ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={20} /></div>
                    </div>
                    <span className="text-[7px] text-white/10 block mt-1.5 truncate">{fx.league.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {groups.length === 0 && !priorityMatch && (
            <div className="rounded-[18px] border border-white/[0.04] border-dashed bg-white/[0.008] p-8 text-center">
              <p className="text-[11px] text-white/25">Sem jogos ao vivo no momento.</p>
              <p className="text-[10px] text-white/15 mt-1">Próximos jogos relevantes aparecerão quando disponíveis.</p>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {/* ═══ 3. RADAR DE SINAIS ═══ */}
          {signals.length > 0 && (
            <div className="rounded-[18px] border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent p-4">
              <h4 className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-400/40 mb-3 flex items-center gap-1.5"><Zap size={10} className="text-cyan-400/50" />Radar de sinais</h4>
              <div className="space-y-1.5">
                {signals.map(s => {
                  const border = s.severity === 'critical' ? 'border-l-rose-400/50' : s.severity === 'attention' ? 'border-l-amber-400/40' : 'border-l-cyan-400/20'
                  return (
                    <div key={s.id} className={`rounded-lg border border-white/[0.03] border-l-2 ${border} bg-white/[0.008] p-2.5`}>
                      <span className="text-[9px] font-semibold text-white/50 block">{s.title}</span>
                      <span className="text-[8px] text-white/20 block mt-0.5 leading-relaxed">{s.description}</span>
                      {s.actionLabel && s.actionTarget && <button onClick={(e) => { e.stopPropagation(); navigate(s.actionTarget!) }} className="text-[7px] text-cyan-400/40 hover:text-cyan-400/70 font-medium mt-1 transition-colors" type="button">{s.actionLabel} →</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══ 5. PLANO DE AÇÃO ═══ */}
          <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-4">
            <h4 className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/20 mb-2.5">Próximas ações</h4>
            <div className="space-y-0.5">
              {actions.map((a, i) => <button key={i} onClick={() => navigate(a.target)} className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-white/[0.02] transition-colors group" type="button"><span className="text-[9px] text-white/30 group-hover:text-white/55">{a.label}</span><ChevronRight size={10} className="text-white/10 group-hover:text-white/30" /></button>)}
            </div>
          </div>

          {/* ADVANCED: Data Health */}
          {isAdvanced && (
            <div className="rounded-[18px] border border-white/[0.04] bg-white/[0.01] p-4">
              <h4 className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/15 mb-2">Diagnóstico</h4>
              <div className="space-y-1 text-[8px] text-white/20">
                <div className="flex justify-between"><span>Fixtures carregados</span><span className="text-white/30">{health.totalFixtures}</span></div>
                <div className="flex justify-between"><span>Com logos</span><span className="text-white/30">{health.withLogos}</span></div>
                <div className="flex justify-between"><span>Providers</span><span className="text-white/30">{health.providers.join(', ')}</span></div>
                <div className="flex justify-between"><span>Última atualização</span><span className="text-white/30">{health.lastUpdate}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
