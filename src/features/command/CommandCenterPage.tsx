/**
 * Command Center V2 — intelligent decision panel.
 * Auto-refresh, signals, priority decision, favorites, alerts.
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

function isLiveFixture(fx: LiveFixture) { return fx.status.short === 'LIVE' || fx.status.short === 'HT' || (fx as any).status?.state === 'in' }

export function CommandCenterPage() {
  const navigate = useNavigate()
  const [fixtures, setFixtures] = useState<LiveFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(() => { try { return localStorage.getItem('goalsense_command_autorefresh') !== 'false' } catch { return true } })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { alerts, enabledCount } = useAlerts()
  const { isAdvanced } = useViewMode()

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await getLiveFixtures()
      setFixtures(res.fixtures || [])
      setLastUpdate(new Date())
      setError(null)
    } catch (e) { if (!silent) setError((e as Error).message) }
    finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    const ms = liveMatches.length > 0 ? 30_000 : 60_000
    intervalRef.current = setInterval(() => fetchData(true), ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchData])

  const toggleAuto = () => {
    const next = !autoRefresh
    setAutoRefresh(next)
    try { localStorage.setItem('goalsense_command_autorefresh', String(next)) } catch {}
  }

  const liveMatches = useMemo(() => fixtures.filter(isLiveFixture), [fixtures])
  const soonMatches = useMemo(() => fixtures.filter(fx => fx.status.short === 'NS' && new Date(fx.date).getTime() - Date.now() <= 3600000 && new Date(fx.date).getTime() > Date.now()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [fixtures])
  const favoriteMatches = useMemo(() => fixtures.filter(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)), [fixtures, isFavoriteTeam])
  const mainMatches = useMemo(() => [...fixtures].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a))).slice(0, 8), [fixtures])
  const activeAlerts = useMemo(() => alerts.filter(a => a.enabled), [alerts])

  const signals = useMemo(() => buildCommandSignals({ liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam }), [liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam])

  // Priority: favorite live > live relevant > main upcoming
  const priorityMatch = useMemo(() => {
    const favLive = liveMatches.find(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name))
    if (favLive) return favLive
    if (liveMatches.length > 0) return [...liveMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a)))[0]
    if (soonMatches.length > 0) return soonMatches[0]
    return mainMatches[0] || null
  }, [liveMatches, soonMatches, mainMatches, isFavoriteTeam])

  const openMatch = (fx: LiveFixture) => { storeFixtureForNavigation(fx); navigate(`/app/matches/${fx.id}`, { state: { fixture: fx } }) }

  const timeSince = lastUpdate ? Math.round((Date.now() - lastUpdate.getTime()) / 1000) : null

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-white tracking-tight">Command Center</h1>
          <p className="text-[11px] text-white/25 mt-0.5">
            Seu painel de decisão em tempo real
            {timeSince !== null && ` · Atualizado há ${timeSince < 60 ? `${timeSince}s` : `${Math.floor(timeSince / 60)}min`}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleAuto} className={`px-3 py-1.5 rounded-xl text-[9px] font-medium transition-all ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'text-white/25 border border-white/[0.06]'}`}>
            Auto {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button onClick={() => fetchData()} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium text-white/40 border border-white/[0.06] hover:text-white/60 transition-colors disabled:opacity-30">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />Atualizar
          </button>
        </div>
      </header>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <MiniStat icon={<Activity size={12} />} value={liveMatches.length} label="Ao vivo" color={liveMatches.length > 0 ? 'emerald' : 'neutral'} />
        <MiniStat icon={<Heart size={12} />} value={favoriteMatches.length} label="Favoritos" color={favoriteMatches.length > 0 ? 'rose' : 'neutral'} />
        <MiniStat icon={<Bell size={12} />} value={enabledCount} label="Alertas" color={enabledCount > 0 ? 'amber' : 'neutral'} />
        <MiniStat icon={<Zap size={12} />} value={mainMatches.length} label="Principais" color="cyan" />
        <MiniStat icon={<Clock size={12} />} value={soonMatches.length} label="Em breve" color={soonMatches.length > 0 ? 'amber' : 'neutral'} />
      </div>

      {error && <div className="rounded-xl border border-rose-500/10 bg-rose-500/[0.03] px-4 py-2.5 text-[10px] text-rose-400/70 flex items-center gap-2"><AlertCircle size={12} />{error}</div>}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        {/* Left */}
        <div className="space-y-5">
          {/* Decision now */}
          {priorityMatch && <DecisionCard fixture={priorityMatch} openMatch={openMatch} isAdvanced={isAdvanced} isFavoriteTeam={isFavoriteTeam} />}

          {/* Favorites */}
          {favoriteMatches.length > 0 && (
            <Section title="Favoritos em ação" icon={<Heart size={12} className="text-rose-400/50" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {favoriteMatches.filter(isLiveFixture).slice(0, 2).map(fx => <CompactMatchCard key={fx.id} fixture={fx} openMatch={openMatch} badge="Ao vivo" badgeColor="emerald" isAdvanced={isAdvanced} />)}
                {favoriteMatches.filter(fx => !isLiveFixture(fx)).slice(0, 2).map(fx => <CompactMatchCard key={fx.id} fixture={fx} openMatch={openMatch} isAdvanced={isAdvanced} />)}
              </div>
            </Section>
          )}
          {favoriteMatches.length === 0 && (
            <Section title="Favoritos em ação" icon={<Heart size={12} className="text-rose-400/50" />}>
              <EmptyBlock text="Favorite times ou partidas para montar seu radar pessoal." action={() => navigate('/app/matches')} />
            </Section>
          )}

          {/* Live now */}
          {liveMatches.length > 0 && (
            <Section title="Ao vivo agora" icon={<Activity size={12} className="text-emerald-400/50" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[...liveMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a))).slice(0, 5).map(fx => <CompactMatchCard key={fx.id} fixture={fx} openMatch={openMatch} badge={`${fx.status.elapsed || ''}'`} badgeColor="emerald" isAdvanced={isAdvanced} />)}
              </div>
            </Section>
          )}

          {/* Upcoming */}
          {soonMatches.length > 0 && (
            <Section title="Começam em breve" icon={<Clock size={12} className="text-amber-400/50" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {soonMatches.slice(0, 5).map(fx => <CompactMatchCard key={fx.id} fixture={fx} openMatch={openMatch} badge="Em breve" badgeColor="amber" isAdvanced={isAdvanced} />)}
              </div>
            </Section>
          )}
        </div>

        {/* Right */}
        <div className="space-y-4">
          {/* Signals */}
          {signals.length > 0 && (
            <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">Sinais GoalSense</h4>
              <div className="space-y-2">
                {signals.map(s => <SignalCard key={s.id} signal={s} navigate={navigate} />)}
              </div>
            </div>
          )}

          {/* Alerts */}
          <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25">Alertas</h4>
              <button onClick={() => navigate('/app/alerts')} className="text-[9px] text-cyan-400/40 hover:text-cyan-400/70 font-medium transition-colors">Gerenciar →</button>
            </div>
            {activeAlerts.length === 0 ? (
              <p className="text-[10px] text-white/25">Crie alertas para acompanhar gols, início e fim de jogo.</p>
            ) : (
              <div className="space-y-1.5">
                {activeAlerts.slice(0, 4).map(a => (
                  <div key={a.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/[0.03] bg-white/[0.01]">
                    <Bell size={11} className="text-amber-400/50 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-white/50 block truncate">{a.name}</span>
                      <span className="text-[8px] text-white/20">{a.events.length} eventos</span>
                    </div>
                    <span className="text-[7px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Ativo</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-4 space-y-1">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">Atalhos</h4>
            <QuickLink label="Ver partidas do dia" onClick={() => navigate('/app/matches')} />
            <QuickLink label="Abrir Live Radar" onClick={() => navigate('/app/live')} />
            <QuickLink label="Ligas e tabelas" onClick={() => navigate('/app/leagues')} />
            <QuickLink label="Configurações" onClick={() => navigate('/app/settings')} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MiniStat({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  const c = color === 'emerald' ? 'text-emerald-400' : color === 'rose' ? 'text-rose-400' : color === 'amber' ? 'text-amber-400' : color === 'cyan' ? 'text-cyan-400' : 'text-white/40'
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.04] bg-white/[0.015]">
      <span className={c}>{icon}</span>
      <div><span className={`text-[15px] font-bold tabular-nums block ${value > 0 ? c : 'text-white/30'}`}>{value}</span><span className="text-[8px] text-white/20">{label}</span></div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div><div className="flex items-center gap-2 mb-2.5">{icon}<h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/30">{title}</h3></div>{children}</div>
}

function EmptyBlock({ text, action }: { text: string; action?: () => void }) {
  return <div className="rounded-[14px] border border-white/[0.04] bg-white/[0.01] p-5 text-center"><p className="text-[10px] text-white/25">{text}</p>{action && <button onClick={action} className="mt-2 text-[9px] text-cyan-400/50 hover:text-cyan-400/80 font-medium transition-colors">Explorar →</button>}</div>
}

function DecisionCard({ fixture: fx, openMatch, isAdvanced, isFavoriteTeam }: { fixture: LiveFixture; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; isFavoriteTeam: (n: string) => boolean }) {
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const matchId = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
  const isFav = isFavoriteMatch(matchId) || isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const reason = getMatchImportanceReason(toScoring(fx))
  const imp = getMatchImportanceScore(toScoring(fx))
  const live = isLiveFixture(fx)
  const time = formatMatchTime(fx.date)
  const decisionText = live ? `${fx.homeTeam.name} x ${fx.awayTeam.name} está ao vivo: ${fx.league.name}, ${reason}.` : `Próximo destaque: ${fx.homeTeam.name} x ${fx.awayTeam.name} às ${time}.`

  return (
    <div onClick={() => openMatch(fx)} className="group relative rounded-[22px] border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-violet-500/[0.02] p-6 cursor-pointer hover:border-cyan-500/25 hover:shadow-[0_16px_50px_-16px_rgba(34,211,238,0.08)] transition-all overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[80px] bg-cyan-500/[0.03] rounded-full blur-[50px]" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Zap size={12} className="text-cyan-400/70" /><span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/70">Decisão agora</span></div>
          <div className="flex items-center gap-2">
            <FavoriteButton active={isFav} onClick={() => toggleFavoriteMatch({ canonicalMatchId: matchId, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, competition: fx.league.name, utcDate: fx.date })} size={13} />
            <span className={`text-[10px] font-semibold ${live ? 'text-emerald-400' : 'text-white/25'}`}>{live ? `${fx.status.elapsed || ''}'` : time}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col items-center gap-2 w-[90px]"><ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={48} /><span className="text-[11px] font-bold text-white/70 text-center leading-tight">{fx.homeTeam.name}</span></div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-baseline gap-3"><span className="text-[32px] font-bold tabular-nums text-white">{fx.score.home ?? '-'}</span><span className="text-[12px] text-white/10">:</span><span className="text-[32px] font-bold tabular-nums text-white">{fx.score.away ?? '-'}</span></div>
            {live && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <div className="flex flex-col items-center gap-2 w-[90px]"><ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={48} /><span className="text-[11px] font-bold text-white/50 text-center leading-tight">{fx.awayTeam.name}</span></div>
        </div>
        <p className="text-[10px] text-white/30 leading-relaxed mb-3">{decisionText}</p>
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
          <span className="text-[9px] text-white/20">{fx.league.name}</span>
          <div className="flex items-center gap-3">
            {isAdvanced && <span className="text-[8px] text-white/15 font-mono">{imp} · {reason}</span>}
            <span className="text-[10px] text-cyan-400/50 group-hover:text-cyan-400/90 font-bold transition-colors flex items-center gap-1">Abrir análise <TrendingUp size={10} /></span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CompactMatchCard({ fixture: fx, openMatch, badge, badgeColor, isAdvanced }: { fixture: LiveFixture; openMatch: (fx: LiveFixture) => void; badge?: string; badgeColor?: string; isAdvanced: boolean }) {
  const imp = getMatchImportanceScore(toScoring(fx))
  const time = formatMatchTime(fx.date)
  const bc = badgeColor === 'emerald' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15' : badgeColor === 'amber' ? 'bg-amber-500/10 text-amber-400 border-amber-500/15' : 'bg-white/[0.03] text-white/30 border-white/[0.06]'
  return (
    <div onClick={() => openMatch(fx)} className="group rounded-[14px] border border-white/[0.04] bg-white/[0.015] p-3.5 cursor-pointer hover:border-white/[0.1] hover:bg-white/[0.025] transition-all">
      <div className="flex items-center justify-between mb-2">
        {badge ? <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-md border ${bc}`}>{badge}</span> : <span className="text-[9px] text-white/20">{time}</span>}
        {isAdvanced && <span className="text-[7px] text-white/15 font-mono">{imp}</span>}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={20} /><span className="text-[10px] font-semibold text-white/65 truncate max-w-[80px]">{fx.homeTeam.name}</span></div>
        <div className="flex items-center gap-1"><span className="text-[14px] font-bold tabular-nums text-white/80">{fx.score.home ?? '-'}</span><span className="text-[8px] text-white/10">:</span><span className="text-[14px] font-bold tabular-nums text-white/80">{fx.score.away ?? '-'}</span></div>
        <div className="flex items-center gap-2"><span className="text-[10px] font-semibold text-white/45 truncate max-w-[80px]">{fx.awayTeam.name}</span><ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={20} /></div>
      </div>
      <div className="flex items-center justify-between mt-2"><span className="text-[8px] text-white/15 truncate">{fx.league.name}</span><span className="text-[8px] text-cyan-400/0 group-hover:text-cyan-400/60 font-medium transition-colors">Analisar →</span></div>
    </div>
  )
}

function SignalCard({ signal: s, navigate }: { signal: CommandSignal; navigate: (path: string) => void }) {
  const colors = { critical: 'border-rose-500/15 bg-rose-500/[0.03] text-rose-400', attention: 'border-amber-500/12 bg-amber-500/[0.02] text-amber-400', info: 'border-white/[0.05] bg-white/[0.01] text-white/40' }
  return (
    <div className={`rounded-xl border p-3 ${colors[s.severity]}`}>
      <span className="text-[10px] font-semibold block">{s.title}</span>
      <span className="text-[9px] text-white/25 block mt-0.5">{s.description}</span>
      {s.actionLabel && s.actionTarget && <button onClick={(e) => { e.stopPropagation(); navigate(s.actionTarget!) }} className="text-[8px] text-cyan-400/50 hover:text-cyan-400/80 font-medium mt-1.5 transition-colors">{s.actionLabel} →</button>}
    </div>
  )
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group"><span className="text-[10px] text-white/35 group-hover:text-white/55">{label}</span><ChevronRight size={11} className="text-white/15 group-hover:text-white/35" /></button>
}
