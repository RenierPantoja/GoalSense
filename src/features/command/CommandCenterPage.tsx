/**
 * Command Center Ultra Premium — immersive decision panel.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, Activity, Bell, Heart, Clock, TrendingUp, ChevronRight, AlertCircle } from 'lucide-react'
import { getLiveFixtures, type LiveFixture } from '@/lib/apiClient'
import { storeFixtureForNavigation } from '@/lib/matchNavigation'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { useFavorites } from '@/context/FavoritesContext'
import { useAlerts } from '@/context/AlertsContext'
import { useViewMode } from '@/context/ViewModeContext'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { getMatchImportanceScore, getMatchImportanceReason } from '@/utils/matchImportance'
import { formatMatchTime } from '@/utils/matchDate'
import { buildCommandSignals, type CommandSignal } from './commandSignals'

function toScoring(fx: LiveFixture) {
  return { competition: { name: fx.league.name }, homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name }, awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name }, score: { fullTime: { home: fx.score.home, away: fx.score.away } }, status: fx.status.short === 'LIVE' || fx.status.short === 'HT' ? 'IN_PLAY' : fx.status.short === 'FT' ? 'FINISHED' : 'TIMED', utcDate: fx.date, area: { name: fx.league.country } }
}
function isLiveFx(fx: LiveFixture) { return fx.status.short === 'LIVE' || fx.status.short === 'HT' || (fx as any).status?.state === 'in' }

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
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await getLiveFixtures()
      setFixtures(res.fixtures || [])
      setLastUpdate(new Date())
      setError(null)
    } catch (e) { if (!silent) setError((e as Error).message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (!autoRefresh) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    const ms = liveMatches.length > 0 ? 25_000 : 60_000
    intervalRef.current = setInterval(() => fetchData(true), ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchData])

  const toggleAuto = () => { const next = !autoRefresh; setAutoRefresh(next); try { localStorage.setItem('goalsense_command_autorefresh', String(next)) } catch {} }

  const liveMatches = useMemo(() => fixtures.filter(isLiveFx), [fixtures])
  const soonMatches = useMemo(() => fixtures.filter(fx => fx.status.short === 'NS' && new Date(fx.date).getTime() - Date.now() <= 3600000 && new Date(fx.date).getTime() > Date.now()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [fixtures])
  const favoriteMatches = useMemo(() => fixtures.filter(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)), [fixtures, isFavoriteTeam])
  const mainMatches = useMemo(() => [...fixtures].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a))).slice(0, 8), [fixtures])
  const activeAlerts = useMemo(() => alerts.filter(a => a.enabled), [alerts])
  const signals = useMemo(() => buildCommandSignals({ liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam }), [liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam])

  const priorityMatch = useMemo(() => {
    const favLive = liveMatches.find(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name))
    if (favLive) return favLive
    if (liveMatches.length > 0) return [...liveMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a)))[0]
    if (soonMatches.length > 0) return soonMatches[0]
    return mainMatches[0] || null
  }, [liveMatches, soonMatches, mainMatches, isFavoriteTeam])

  const openMatch = (fx: LiveFixture) => { storeFixtureForNavigation(fx); navigate(`/app/matches/${fx.id}`, { state: { fixture: fx } }) }
  const timeSince = lastUpdate ? Math.round((Date.now() - lastUpdate.getTime()) / 1000) : null

  if (loading) return (
    <div className="max-w-[1200px] mx-auto flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
        <span className="text-[12px] text-white/25">Carregando Command Center...</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 animate-fadeIn">
      {/* ═══ HEADER ═══ */}
      <header className="relative">
        <div className="absolute inset-0 -z-10 rounded-[28px] bg-gradient-to-r from-cyan-500/[0.02] via-transparent to-violet-500/[0.02]" />
        <div className="flex items-center justify-between py-2">
          <div>
            <h1 className="text-[24px] font-bold text-white tracking-tight">Command Center</h1>
            <p className="text-[11px] text-white/30 mt-0.5 flex items-center gap-2">
              Painel de decisão em tempo real
              {timeSince !== null && <span className="text-white/15">· {timeSince < 60 ? `${timeSince}s atrás` : `${Math.floor(timeSince / 60)}min atrás`}</span>}
              {refreshing && <span className="text-cyan-400/40 animate-pulse">Atualizando...</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleAuto} className={`px-3 py-1.5 rounded-xl text-[9px] font-semibold tracking-wide uppercase transition-all ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-white/20 border border-white/[0.06] hover:text-white/40'}`}>
              Auto {autoRefresh ? 'ON' : 'OFF'}
            </button>
            <button onClick={() => fetchData()} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium text-white/35 border border-white/[0.06] hover:text-white/60 hover:border-white/[0.1] transition-all disabled:opacity-30" type="button" aria-label="Atualizar dados">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />Atualizar
            </button>
          </div>
        </div>
      </header>

      {/* ═══ METRICS STRIP ═══ */}
      <div className="grid grid-cols-5 gap-2">
        <Metric value={liveMatches.length} label="Ao vivo" active={liveMatches.length > 0} color="emerald" />
        <Metric value={mainMatches.length} label="Principais" active color="cyan" />
        <Metric value={favoriteMatches.length} label="Favoritos" active={favoriteMatches.length > 0} color="rose" />
        <Metric value={enabledCount} label="Alertas" active={enabledCount > 0} color="amber" />
        <Metric value={soonMatches.length} label="Em breve" active={soonMatches.length > 0} color="violet" />
      </div>

      {error && <div className="rounded-xl border border-rose-500/10 bg-rose-500/[0.02] px-4 py-2.5 text-[10px] text-rose-400/60 flex items-center gap-2"><AlertCircle size={12} />{error}</div>}

      {/* ═══ MAIN GRID ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5">
        {/* LEFT — Decision + Sections */}
        <div className="space-y-5">
          {/* DECISION NOW */}
          {priorityMatch && <DecisionHero fixture={priorityMatch} openMatch={openMatch} isAdvanced={isAdvanced} isFavoriteTeam={isFavoriteTeam} />}

          {/* LIVE NOW */}
          {liveMatches.length > 0 && (
            <Panel title="Ao vivo agora" icon={<Activity size={13} className="text-emerald-400" />} count={liveMatches.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[...liveMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a))).slice(0, 4).map(fx => <MatchTile key={fx.id} fixture={fx} openMatch={openMatch} isAdvanced={isAdvanced} />)}
              </div>
            </Panel>
          )}

          {/* FAVORITES */}
          <Panel title="Favoritos em ação" icon={<Heart size={13} className="text-rose-400/70" />} count={favoriteMatches.length}>
            {favoriteMatches.length === 0 ? (
              <EmptyState text="Favorite times ou partidas para montar seu radar pessoal." action={() => navigate('/app/matches')} actionLabel="Explorar partidas" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {favoriteMatches.slice(0, 4).map(fx => <MatchTile key={fx.id} fixture={fx} openMatch={openMatch} isAdvanced={isAdvanced} highlight />)}
              </div>
            )}
          </Panel>

          {/* SOON */}
          {soonMatches.length > 0 && (
            <Panel title="Começam em breve" icon={<Clock size={13} className="text-amber-400/70" />} count={soonMatches.length}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {soonMatches.slice(0, 5).map(fx => <MatchTile key={fx.id} fixture={fx} openMatch={openMatch} isAdvanced={isAdvanced} />)}
              </div>
            </Panel>
          )}
        </div>

        {/* RIGHT — Intelligence */}
        <div className="space-y-4">
          {/* SIGNALS */}
          {signals.length > 0 && (
            <div className="rounded-[20px] border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent p-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-400/40 mb-3 flex items-center gap-2"><Zap size={11} className="text-cyan-400/50" />Sinais GoalSense</h4>
              <div className="space-y-2">
                {signals.map(s => <SignalRow key={s.id} signal={s} navigate={navigate} />)}
              </div>
            </div>
          )}

          {/* ALERTS */}
          <div className="rounded-[20px] border border-white/[0.05] bg-white/[0.015] p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 flex items-center gap-2"><Bell size={11} className="text-amber-400/40" />Alertas</h4>
              <button onClick={() => navigate('/app/alerts')} className="text-[8px] text-cyan-400/40 hover:text-cyan-400/70 font-medium transition-colors" type="button">Gerenciar →</button>
            </div>
            {activeAlerts.length === 0 ? (
              <p className="text-[10px] text-white/20 leading-relaxed">Crie alertas para gols, início e fim de jogo.</p>
            ) : (
              <div className="space-y-1.5">
                {activeAlerts.slice(0, 4).map(a => (
                  <div key={a.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/[0.03] bg-white/[0.01]">
                    <div className="h-2 w-2 rounded-full bg-emerald-400/60 shrink-0" />
                    <span className="text-[10px] text-white/45 flex-1 truncate">{a.name}</span>
                    <span className="text-[7px] text-white/15">{a.events.length} ev.</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* QUICK LINKS */}
          <div className="rounded-[20px] border border-white/[0.05] bg-white/[0.015] p-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/20 mb-2">Atalhos</h4>
            <div className="space-y-0.5">
              <QuickLink label="Ver partidas do dia" onClick={() => navigate('/app/matches')} />
              <QuickLink label="Abrir Live Radar" onClick={() => navigate('/app/live')} />
              <QuickLink label="Ligas e tabelas" onClick={() => navigate('/app/leagues')} />
              <QuickLink label="Configurações" onClick={() => navigate('/app/settings')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Metric ──────────────────────────────────────────────────────────────────

function Metric({ value, label, active, color }: { value: number; label: string; active: boolean; color: string }) {
  const colors: Record<string, string> = { emerald: 'text-emerald-400', cyan: 'text-cyan-400', rose: 'text-rose-400', amber: 'text-amber-400', violet: 'text-violet-400' }
  const glows: Record<string, string> = { emerald: 'shadow-[0_0_12px_-4px_rgba(52,211,153,0.15)]', cyan: 'shadow-[0_0_12px_-4px_rgba(34,211,238,0.1)]', rose: '', amber: '', violet: '' }
  return (
    <div className={`rounded-[14px] border border-white/[0.05] bg-white/[0.015] px-4 py-3 transition-all ${active && value > 0 ? glows[color] || '' : ''}`}>
      <span className={`text-[20px] font-bold tabular-nums block ${active && value > 0 ? colors[color] : 'text-white/20'}`}>{value}</span>
      <span className="text-[8px] text-white/25 uppercase tracking-wider font-medium">{label}</span>
    </div>
  )
}

// ─── Decision Hero ───────────────────────────────────────────────────────────

function DecisionHero({ fixture: fx, openMatch, isAdvanced, isFavoriteTeam }: { fixture: LiveFixture; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; isFavoriteTeam: (n: string) => boolean }) {
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const matchId = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
  const isFav = isFavoriteMatch(matchId) || isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const reason = getMatchImportanceReason(toScoring(fx))
  const imp = getMatchImportanceScore(toScoring(fx))
  const live = isLiveFx(fx)
  const time = formatMatchTime(fx.date)

  return (
    <div onClick={() => openMatch(fx)} className="group relative rounded-[24px] border border-cyan-500/[0.12] bg-gradient-to-br from-[#0d1520] via-[#0a0f18] to-[#0d1220] p-7 cursor-pointer hover:border-cyan-500/25 transition-all overflow-hidden" role="button" aria-label="Abrir análise da partida prioritária">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/3 w-[250px] h-[100px] bg-cyan-500/[0.03] rounded-full blur-[60px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[150px] h-[80px] bg-violet-500/[0.02] rounded-full blur-[50px] pointer-events-none" />

      <div className="relative">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/70">Decisão agora</span>
          </div>
          <div className="flex items-center gap-2">
            <FavoriteButton active={isFav} onClick={() => toggleFavoriteMatch({ canonicalMatchId: matchId, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, competition: fx.league.name, utcDate: fx.date })} size={14} />
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${live ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'text-white/25'}`}>
              {live && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />}
              {live ? `${fx.status.elapsed || ''}'` : time}
            </span>
          </div>
        </div>

        {/* Match */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2.5 w-[110px]">
            <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={56} />
            <span className="text-[11px] font-bold text-white/75 text-center leading-tight">{fx.homeTeam.name}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-baseline gap-4">
              <span className="text-[38px] font-bold tabular-nums text-white">{fx.score.home ?? '-'}</span>
              <span className="text-[14px] text-white/10">:</span>
              <span className="text-[38px] font-bold tabular-nums text-white">{fx.score.away ?? '-'}</span>
            </div>
            {live && <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <div className="flex flex-col items-center gap-2.5 w-[110px]">
            <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={56} />
            <span className="text-[11px] font-bold text-white/50 text-center leading-tight">{fx.awayTeam.name}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.04]">
          <div>
            <span className="text-[10px] text-white/25 block">{fx.league.name}</span>
            <span className="text-[9px] text-white/15 italic">{reason}</span>
          </div>
          <div className="flex items-center gap-3">
            {isAdvanced && <span className="text-[8px] text-white/10 font-mono tabular-nums">{imp}</span>}
            <span className="text-[10px] text-cyan-400/50 group-hover:text-cyan-400/90 font-bold transition-colors flex items-center gap-1.5">Abrir análise <TrendingUp size={11} /></span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function Panel({ title, icon, count, children }: { title: string; icon: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/30">{title}</h3>
        {count !== undefined && count > 0 && <span className="text-[9px] tabular-nums text-white/15 ml-1">{count}</span>}
      </div>
      {children}
    </div>
  )
}

// ─── Match Tile ──────────────────────────────────────────────────────────────

function MatchTile({ fixture: fx, openMatch, isAdvanced, highlight }: { fixture: LiveFixture; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; highlight?: boolean }) {
  const live = isLiveFx(fx)
  const time = formatMatchTime(fx.date)
  const imp = getMatchImportanceScore(toScoring(fx))
  return (
    <div onClick={() => openMatch(fx)} className={`group rounded-[16px] border ${highlight ? 'border-rose-500/12' : 'border-white/[0.04]'} bg-white/[0.015] p-4 cursor-pointer hover:border-white/[0.1] hover:bg-white/[0.025] transition-all`} role="button">
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-[9px] font-semibold ${live ? 'text-emerald-400' : 'text-white/20'}`}>{live ? `${fx.status.elapsed || ''}'` : time}</span>
        {isAdvanced && <span className="text-[7px] text-white/10 font-mono">{imp}</span>}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={22} /><span className="text-[10px] font-semibold text-white/65 truncate max-w-[70px]">{fx.homeTeam.name}</span></div>
        <div className="flex items-center gap-1.5"><span className="text-[15px] font-bold tabular-nums text-white/80">{fx.score.home ?? '-'}</span><span className="text-[8px] text-white/10">:</span><span className="text-[15px] font-bold tabular-nums text-white/80">{fx.score.away ?? '-'}</span></div>
        <div className="flex items-center gap-2"><span className="text-[10px] font-semibold text-white/45 truncate max-w-[70px]">{fx.awayTeam.name}</span><ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={22} /></div>
      </div>
      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[8px] text-white/15 truncate">{fx.league.name}</span>
        <span className="text-[8px] text-cyan-400/0 group-hover:text-cyan-400/60 font-medium transition-colors">Analisar →</span>
      </div>
    </div>
  )
}

// ─── Signal Row ──────────────────────────────────────────────────────────────

function SignalRow({ signal: s, navigate }: { signal: CommandSignal; navigate: (p: string) => void }) {
  const severityStyles = { critical: 'border-l-rose-400/60 bg-rose-500/[0.03]', attention: 'border-l-amber-400/50 bg-amber-500/[0.02]', info: 'border-l-cyan-400/30 bg-white/[0.01]' }
  return (
    <div className={`rounded-xl border border-white/[0.03] border-l-2 ${severityStyles[s.severity]} p-3`}>
      <span className="text-[10px] font-semibold text-white/55 block">{s.title}</span>
      <span className="text-[9px] text-white/25 block mt-0.5 leading-relaxed">{s.description}</span>
      {s.actionLabel && s.actionTarget && <button onClick={(e) => { e.stopPropagation(); navigate(s.actionTarget!) }} className="text-[8px] text-cyan-400/50 hover:text-cyan-400/80 font-medium mt-1.5 transition-colors" type="button">{s.actionLabel} →</button>}
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ text, action, actionLabel }: { text: string; action?: () => void; actionLabel?: string }) {
  return (
    <div className="rounded-[16px] border border-white/[0.04] border-dashed bg-white/[0.008] p-6 text-center">
      <p className="text-[10px] text-white/25 leading-relaxed">{text}</p>
      {action && <button onClick={action} className="mt-3 text-[9px] text-cyan-400/50 hover:text-cyan-400/80 font-medium transition-colors" type="button">{actionLabel || 'Explorar'} →</button>}
    </div>
  )
}

// ─── Quick Link ──────────────────────────────────────────────────────────────

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.025] transition-colors group" type="button"><span className="text-[10px] text-white/30 group-hover:text-white/55">{label}</span><ChevronRight size={11} className="text-white/10 group-hover:text-white/30" /></button>
}
