/**
 * Command Center — Cockpit de Decisão GoalSense.
 * "O que importa agora e qual ação eu devo tomar?"
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
import { isLiveFx, getOperationalState, groupCommandMatches, getDecisionReason, getActionPlan, getDataHealth } from './commandHelpers'

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
  const timeSince = lastUpdate ? Math.round((Date.now() - lastUpdate.getTime()) / 1000) : null

  if (loading) return <div className="max-w-[1240px] mx-auto flex items-center justify-center min-h-[50vh]"><div className="flex flex-col items-center gap-4"><div className="relative h-12 w-12"><div className="absolute inset-0 rounded-full border-2 border-cyan-400/10" /><div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" /></div><span className="text-[11px] text-white/20 tracking-wide">Inicializando cockpit...</span></div></div>

  return (
    <div className="max-w-[1240px] mx-auto space-y-5 animate-fadeIn">

      {/* ═══ A) COMMAND HEADER ═══ */}
      <header className="relative rounded-[24px] overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#080c14] via-[#0a0e18] to-[#0c1020]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.03),transparent_60%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

        <div className="relative p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-[24px] font-bold text-white tracking-tight">Command Center</h1>
                <span className="text-[7px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Online</span>
              </div>
              <p className="text-[10px] text-white/25 flex items-center gap-2">
                {opState.headline}
                {timeSince !== null && <span className="text-white/12">· {timeSince < 60 ? `${timeSince}s` : `${Math.floor(timeSince / 60)}min`}</span>}
                {refreshing && <span className="text-cyan-400/30 animate-pulse">●</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleAuto} className={`h-7 px-2.5 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all ${autoRefresh ? 'bg-emerald-500/8 text-emerald-400/70 border border-emerald-500/12' : 'text-white/15 border border-white/[0.04]'}`} type="button">Auto</button>
              <button onClick={() => fetchData()} disabled={refreshing} className="h-7 w-7 rounded-lg flex items-center justify-center text-white/20 border border-white/[0.05] hover:text-white/50 hover:border-white/[0.1] transition-all disabled:opacity-20" type="button" aria-label="Atualizar"><RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /></button>
            </div>
          </div>

          {/* Operational Strip */}
          <div className="flex gap-1">
            {opState.metrics.map(m => (
              <div key={m.label} className={`flex-1 rounded-xl px-3 py-2.5 transition-all ${m.attention && m.value > 0 ? 'bg-white/[0.025] border border-white/[0.06]' : 'bg-white/[0.008] border border-transparent'}`}>
                <span className={`text-[20px] font-bold tabular-nums block leading-none ${m.attention && m.value > 0 ? (m.color === 'emerald' ? 'text-emerald-400' : m.color === 'cyan' ? 'text-cyan-400' : m.color === 'rose' ? 'text-rose-400' : m.color === 'amber' ? 'text-amber-400' : 'text-violet-400') : 'text-white/12'}`}>{m.value}</span>
                <span className="text-[7px] text-white/20 uppercase tracking-[0.15em] mt-1 block">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-500/8 bg-rose-500/[0.02] px-4 py-2 text-[9px] text-rose-400/50 flex items-center gap-2"><AlertCircle size={10} />{error}</div>}

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5">

        {/* LEFT — Cockpit + Monitoring */}
        <div className="space-y-5">

          {/* ═══ B) DECISION COCKPIT ═══ */}
          {priorityMatch && (
            <div onClick={() => openMatch(priorityMatch)} className="group relative rounded-[22px] overflow-hidden cursor-pointer transition-all hover:shadow-[0_0_40px_-15px_rgba(34,211,238,0.08)]" role="button" aria-label="Abrir análise da partida prioritária">
              {/* Cockpit background */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1a] via-[#080c16] to-[#0b1020]" />
              <div className="absolute inset-0 border border-cyan-500/[0.08] rounded-[22px] group-hover:border-cyan-500/[0.15] transition-colors" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[100px] bg-cyan-500/[0.02] rounded-full blur-[50px]" />
              <div className="absolute bottom-0 right-1/3 w-[150px] h-[60px] bg-violet-500/[0.015] rounded-full blur-[40px]" />

              <div className="relative p-7">
                {/* Badge */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.4)] animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-cyan-400/60">Decisão agora</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FavoriteButton active={isFavoriteMatch(buildCanonicalMatchId(priorityMatch.homeTeam.name, priorityMatch.awayTeam.name, priorityMatch.date))} onClick={() => toggleFavoriteMatch({ canonicalMatchId: buildCanonicalMatchId(priorityMatch.homeTeam.name, priorityMatch.awayTeam.name, priorityMatch.date), homeTeam: priorityMatch.homeTeam.name, awayTeam: priorityMatch.awayTeam.name, competition: priorityMatch.league.name, utcDate: priorityMatch.date })} size={14} />
                    <span className={`text-[9px] font-semibold px-2.5 py-1 rounded-lg ${isLiveFx(priorityMatch) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'text-white/20 bg-white/[0.02] border border-white/[0.04]'}`}>
                      {isLiveFx(priorityMatch) && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />}
                      {isLiveFx(priorityMatch) ? `${priorityMatch.status.elapsed || ''}'` : formatMatchTime(priorityMatch.date)}
                    </span>
                  </div>
                </div>

                {/* Match display */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col items-center gap-3 w-[120px]">
                    <ClubLogo src={priorityMatch.homeTeam.logo} name={priorityMatch.homeTeam.name} size={64} />
                    <span className="text-[11px] font-bold text-white/80 text-center leading-tight">{priorityMatch.homeTeam.name}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-baseline gap-4">
                      <span className="text-[48px] font-bold tabular-nums text-white leading-none">{priorityMatch.score.home ?? '-'}</span>
                      <span className="text-[16px] text-white/8">:</span>
                      <span className="text-[48px] font-bold tabular-nums text-white leading-none">{priorityMatch.score.away ?? '-'}</span>
                    </div>
                    {isLiveFx(priorityMatch) && <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)] animate-pulse" />}
                    <span className="text-[9px] text-white/20 mt-1">{priorityMatch.league.name}</span>
                  </div>
                  <div className="flex flex-col items-center gap-3 w-[120px]">
                    <ClubLogo src={priorityMatch.awayTeam.logo} name={priorityMatch.awayTeam.name} size={64} />
                    <span className="text-[11px] font-bold text-white/50 text-center leading-tight">{priorityMatch.awayTeam.name}</span>
                  </div>
                </div>

                {/* Why this match */}
                <div className="mt-6 pt-4 border-t border-white/[0.03] flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-cyan-400/40 font-medium block mb-0.5">Por que este jogo?</span>
                    <span className="text-[10px] text-white/35">{getDecisionReason(priorityMatch, isFavoriteTeam)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {isAdvanced && <span className="text-[8px] text-white/10 font-mono tabular-nums">{getMatchImportanceScore(toScoring(priorityMatch))}</span>}
                    <span className="text-[10px] text-cyan-400/50 group-hover:text-cyan-400 font-bold transition-colors flex items-center gap-1.5">Abrir análise <TrendingUp size={11} /></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ C) MONITORING BOARD ═══ */}
          {groups.map(g => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-2 pl-1">
                <div className="h-1 w-1 rounded-full bg-white/20" />
                <h3 className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/25">{g.title}</h3>
                <span className="text-[8px] text-white/10 tabular-nums">{g.matches.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {g.matches.map(fx => (
                  <div key={fx.id} onClick={() => openMatch(fx)} className="group flex items-center gap-3 rounded-[12px] border border-white/[0.03] bg-white/[0.01] px-3.5 py-3 cursor-pointer hover:border-white/[0.08] hover:bg-white/[0.02] transition-all" role="button">
                    <span className={`text-[9px] font-semibold tabular-nums w-8 shrink-0 ${isLiveFx(fx) ? 'text-emerald-400' : 'text-white/15'}`}>{isLiveFx(fx) ? `${fx.status.elapsed || ''}'` : formatMatchTime(fx.date)}</span>
                    <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={18} />
                    <span className="text-[10px] font-medium text-white/55 truncate flex-1">{fx.homeTeam.name}</span>
                    <span className="text-[12px] font-bold tabular-nums text-white/70 shrink-0">{fx.score.home ?? '-'}:{fx.score.away ?? '-'}</span>
                    <span className="text-[10px] font-medium text-white/35 truncate flex-1 text-right">{fx.awayTeam.name}</span>
                    <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={18} />
                    <span className="text-[8px] text-cyan-400/0 group-hover:text-cyan-400/50 transition-colors shrink-0">→</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {groups.length === 0 && !priorityMatch && (
            <div className="rounded-[18px] border border-white/[0.03] border-dashed bg-white/[0.005] p-10 text-center">
              <p className="text-[11px] text-white/20">Sem jogos ao vivo no momento</p>
              <p className="text-[9px] text-white/10 mt-1">Próximos jogos aparecerão quando disponíveis</p>
            </div>
          )}
        </div>

        {/* RIGHT — Intelligence Panel */}
        <div className="space-y-4">

          {/* Signals Radar */}
          {signals.length > 0 && (
            <div className="rounded-[18px] border border-white/[0.04] bg-gradient-to-b from-white/[0.015] to-transparent p-4">
              <h4 className="text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-400/35 mb-3 flex items-center gap-1.5"><Zap size={9} className="text-cyan-400/40" />Radar</h4>
              <div className="space-y-1.5">
                {signals.map(s => {
                  const lc = s.severity === 'critical' ? 'border-l-rose-400/50' : s.severity === 'attention' ? 'border-l-amber-400/35' : 'border-l-white/[0.08]'
                  return (
                    <div key={s.id} className={`rounded-lg border border-white/[0.02] border-l-[2px] ${lc} bg-white/[0.005] px-3 py-2`}>
                      <span className="text-[9px] font-semibold text-white/45 block">{s.title}</span>
                      <span className="text-[8px] text-white/18 block mt-0.5 leading-relaxed">{s.description}</span>
                      {s.actionLabel && s.actionTarget && <button onClick={(e) => { e.stopPropagation(); navigate(s.actionTarget!) }} className="text-[7px] text-cyan-400/35 hover:text-cyan-400/70 font-medium mt-1 transition-colors" type="button">{s.actionLabel} →</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Action Plan */}
          <div className="rounded-[18px] border border-white/[0.04] bg-white/[0.01] p-4">
            <h4 className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/18 mb-2.5">Ações recomendadas</h4>
            <div className="space-y-0.5">
              {actions.map((a, i) => (
                <button key={i} onClick={() => navigate(a.target)} className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-white/[0.02] transition-colors group" type="button">
                  <span className="text-[9px] text-white/25 group-hover:text-white/50">{a.label}</span>
                  <ChevronRight size={9} className="text-white/8 group-hover:text-white/25" />
                </button>
              ))}
            </div>
          </div>

          {/* Advanced: Diagnostics */}
          {isAdvanced && (
            <div className="rounded-[18px] border border-white/[0.03] bg-white/[0.005] p-4">
              <h4 className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/12 mb-2">Diagnóstico</h4>
              <div className="space-y-1 text-[8px]">
                <div className="flex justify-between"><span className="text-white/15">Fixtures</span><span className="text-white/25 tabular-nums">{health.totalFixtures}</span></div>
                <div className="flex justify-between"><span className="text-white/15">Com logos</span><span className="text-white/25 tabular-nums">{health.withLogos}</span></div>
                <div className="flex justify-between"><span className="text-white/15">Providers</span><span className="text-white/25">{health.providers.join(', ')}</span></div>
                <div className="flex justify-between"><span className="text-white/15">Atualização</span><span className="text-white/25">{health.lastUpdate}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
