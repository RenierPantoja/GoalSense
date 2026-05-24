/**
 * Command Center — decision panel with live matches, favorites, alerts, signals.
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, Activity, Bell, Heart, Clock, TrendingUp, ChevronRight } from 'lucide-react'
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

// Adapter: LiveFixture → MatchForScoring interface
function toScoring(fx: LiveFixture) {
  return { competition: { name: fx.league.name }, homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name }, awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name }, score: { fullTime: { home: fx.score.home, away: fx.score.away } }, status: fx.status.short === 'LIVE' || fx.status.short === 'HT' ? 'IN_PLAY' : fx.status.short === 'FT' ? 'FINISHED' : 'TIMED', utcDate: fx.date, area: { name: fx.league.country } }
}

export function CommandCenterPage() {
  const navigate = useNavigate()
  const [fixtures, setFixtures] = useState<LiveFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch, teams: favTeams } = useFavorites()
  const { alerts, enabledCount } = useAlerts()
  const { isAdvanced } = useViewMode()

  const fetchData = useCallback(async () => {
    try {
      const res = await getLiveFixtures()
      setFixtures(res.fixtures || [])
      setLastUpdate(new Date())
      setError(null)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const liveMatches = useMemo(() => fixtures.filter(fx => fx.status.short === 'LIVE' || fx.status.short === 'HT' || (fx as any).status?.state === 'in'), [fixtures])
  const upcomingMatches = useMemo(() => fixtures.filter(fx => fx.status.short === 'NS' && new Date(fx.date).getTime() - Date.now() <= 3600000 && new Date(fx.date).getTime() > Date.now()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 6), [fixtures])
  const favoriteMatches = useMemo(() => fixtures.filter(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)), [fixtures, isFavoriteTeam])
  const mainMatches = useMemo(() => [...fixtures].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a))).slice(0, 6), [fixtures])
  const activeAlerts = useMemo(() => alerts.filter(a => a.enabled), [alerts])

  // Priority match: favorite live > live relevant > main
  const priorityMatch = useMemo(() => {
    const favLive = liveMatches.find(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name))
    if (favLive) return favLive
    if (liveMatches.length > 0) return [...liveMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a)))[0]
    return mainMatches[0] || null
  }, [liveMatches, mainMatches, isFavoriteTeam])

  const openMatch = (fx: LiveFixture) => {
    storeFixtureForNavigation(fx)
    navigate(`/app/matches/${fx.id}`, { state: { fixture: fx } })
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-white tracking-tight">Command Center</h1>
          <p className="text-[11px] text-white/25 mt-0.5">
            Seu painel de decisão em tempo real
            {lastUpdate && ` · ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-medium text-white/40 border border-white/[0.06] hover:text-white/60 hover:bg-white/[0.03] transition-colors disabled:opacity-30">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Atualizar
        </button>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard icon={<Activity size={14} />} value={liveMatches.length} label="Ao vivo" highlight={liveMatches.length > 0} color="emerald" />
        <SummaryCard icon={<Heart size={14} />} value={favoriteMatches.length} label="Favoritos" color="rose" />
        <SummaryCard icon={<Bell size={14} />} value={enabledCount} label="Alertas" color="amber" />
        <SummaryCard icon={<Zap size={14} />} value={mainMatches.length} label="Principais" color="cyan" />
        <SummaryCard icon={<Clock size={14} />} value={upcomingMatches.length} label="Em breve" color="white" />
      </div>

      {error && <div className="rounded-2xl border border-rose-500/10 bg-rose-500/[0.03] p-4 text-[11px] text-rose-400/70">{error}</div>}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Priority match */}
          {priorityMatch && (
            <PriorityCard fixture={priorityMatch} openMatch={openMatch} isAdvanced={isAdvanced} />
          )}

          {/* Favorites in action */}
          <Section title="Favoritos em ação" icon={<Heart size={13} className="text-rose-400/50" />} empty={favoriteMatches.length === 0} emptyText="Favorite times ou partidas para montar seu radar pessoal." emptyAction={() => navigate('/app/matches')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {favoriteMatches.slice(0, 4).map(fx => <MatchCard key={fx.id} fixture={fx} openMatch={openMatch} isAdvanced={isAdvanced} />)}
            </div>
          </Section>

          {/* Live now */}
          {liveMatches.length > 0 && (
            <Section title="Ao vivo agora" icon={<Activity size={13} className="text-emerald-400/50" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {liveMatches.slice(0, 6).map(fx => <MatchCard key={fx.id} fixture={fx} openMatch={openMatch} isAdvanced={isAdvanced} />)}
              </div>
            </Section>
          )}

          {/* Upcoming */}
          {upcomingMatches.length > 0 && (
            <Section title="Começam em breve" icon={<Clock size={13} className="text-amber-400/50" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcomingMatches.map(fx => <MatchCard key={fx.id} fixture={fx} openMatch={openMatch} isAdvanced={isAdvanced} />)}
              </div>
            </Section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Active alerts */}
          <Section title="Alertas ativos" icon={<Bell size={13} className="text-amber-400/50" />} empty={activeAlerts.length === 0} emptyText="Crie alertas para acompanhar gols, início e fim de jogo." emptyAction={() => navigate('/app/alerts')}>
            <div className="space-y-2">
              {activeAlerts.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.04] bg-white/[0.015]">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/15 shrink-0">
                    <Bell size={12} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-white/60 block truncate">{a.name}</span>
                    <span className="text-[9px] text-white/25">{a.events.length} eventos · {a.type === 'team' ? 'Time' : a.type === 'match' ? 'Partida' : 'Liga'}</span>
                  </div>
                  <span className="text-[8px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Ativo</span>
                </div>
              ))}
              {activeAlerts.length > 5 && <button onClick={() => navigate('/app/alerts')} className="text-[10px] text-cyan-400/50 hover:text-cyan-400/80 font-medium transition-colors">Ver todos →</button>}
            </div>
          </Section>

          {/* Quick links */}
          <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-4 space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">Atalhos</h4>
            <QuickLink label="Ver partidas do dia" onClick={() => navigate('/app/matches')} />
            <QuickLink label="Abrir Live Radar" onClick={() => navigate('/app/live')} />
            <QuickLink label="Gerenciar alertas" onClick={() => navigate('/app/alerts')} />
            <QuickLink label="Ligas e tabelas" onClick={() => navigate('/app/leagues')} />
          </div>

          {/* GoalSense signals (if live matches have data) */}
          {isAdvanced && liveMatches.length > 0 && (
            <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">Sinais GoalSense</h4>
              <p className="text-[10px] text-white/30">{liveMatches.length} {liveMatches.length === 1 ? 'partida ao vivo' : 'partidas ao vivo'} sendo monitoradas. Sinais detalhados disponíveis no Live Radar.</p>
              <button onClick={() => navigate('/app/live')} className="mt-2 text-[9px] text-cyan-400/50 hover:text-cyan-400/80 font-medium transition-colors">Abrir Live Radar →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({ icon, value, label, highlight, color }: { icon: React.ReactNode; value: number; label: string; highlight?: boolean; color: string }) {
  const colors: Record<string, string> = { emerald: 'border-emerald-500/15 bg-emerald-500/5', rose: 'border-rose-500/12 bg-rose-500/[0.03]', amber: 'border-amber-500/12 bg-amber-500/[0.03]', cyan: 'border-cyan-500/12 bg-cyan-500/[0.03]', white: 'border-white/[0.06] bg-white/[0.02]' }
  const textColors: Record<string, string> = { emerald: 'text-emerald-400', rose: 'text-rose-400', amber: 'text-amber-400', cyan: 'text-cyan-400', white: 'text-white/50' }
  return (
    <div className={`rounded-[14px] border p-4 ${colors[color]}`}>
      <div className={`${textColors[color]} mb-2`}>{icon}</div>
      <span className={`text-[20px] font-bold tabular-nums block ${highlight ? textColors[color] : 'text-white/60'}`}>{value}</span>
      <span className="text-[9px] text-white/25">{label}</span>
    </div>
  )
}

function Section({ title, icon, children, empty, emptyText, emptyAction }: { title: string; icon: React.ReactNode; children?: React.ReactNode; empty?: boolean; emptyText?: string; emptyAction?: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/35">{title}</h3>
      </div>
      {empty ? (
        <div className="rounded-[16px] border border-white/[0.04] bg-white/[0.015] p-6 text-center">
          <p className="text-[11px] text-white/30">{emptyText}</p>
          {emptyAction && <button onClick={emptyAction} className="mt-3 text-[10px] text-cyan-400/50 hover:text-cyan-400/80 font-medium transition-colors">Explorar →</button>}
        </div>
      ) : children}
    </div>
  )
}

function PriorityCard({ fixture: fx, openMatch, isAdvanced }: { fixture: LiveFixture; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean }) {
  const { isFavoriteMatch, toggleFavoriteMatch, isFavoriteTeam } = useFavorites()
  const matchId = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
  const isFav = isFavoriteMatch(matchId) || isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const reason = getMatchImportanceReason(toScoring(fx))
  const imp = getMatchImportanceScore(toScoring(fx))
  const isLive = fx.status.short === 'LIVE' || fx.status.short === 'HT' || (fx as any).status?.state === 'in'
  const time = formatMatchTime(fx.date)

  return (
    <div onClick={() => openMatch(fx)} className="group relative rounded-[22px] border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-violet-500/[0.02] p-7 cursor-pointer hover:border-cyan-500/25 hover:shadow-[0_16px_50px_-16px_rgba(34,211,238,0.08)] transition-all overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[250px] h-[100px] bg-cyan-500/[0.03] rounded-full blur-[50px]" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-cyan-400/70" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/70">Prioridade agora</span>
          </div>
          <div className="flex items-center gap-2">
            <FavoriteButton active={isFav} onClick={() => toggleFavoriteMatch({ canonicalMatchId: matchId, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, competition: fx.league.name, utcDate: fx.date })} size={13} />
            <span className={`text-[10px] font-semibold ${isLive ? 'text-emerald-400' : 'text-white/25'}`}>{isLive ? `${fx.status.elapsed || ''}' Ao vivo` : time}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2 w-[100px]">
            <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={52} />
            <span className="text-[11px] font-bold text-white/70 text-center leading-tight">{fx.homeTeam.name}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-baseline gap-3">
              <span className="text-[36px] font-bold tabular-nums text-white">{fx.score.home ?? '-'}</span>
              <span className="text-[14px] text-white/10">:</span>
              <span className="text-[36px] font-bold tabular-nums text-white">{fx.score.away ?? '-'}</span>
            </div>
            {isLive && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <div className="flex flex-col items-center gap-2 w-[100px]">
            <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={52} />
            <span className="text-[11px] font-bold text-white/50 text-center leading-tight">{fx.awayTeam.name}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.04]">
          <span className="text-[10px] text-white/25">{fx.league.name}</span>
          <div className="flex items-center gap-3">
            {isAdvanced && <span className="text-[8px] text-white/15 font-mono">{imp} · {reason}</span>}
            <span className="text-[10px] text-cyan-400/50 group-hover:text-cyan-400/90 font-bold transition-colors flex items-center gap-1">Analisar <TrendingUp size={10} /></span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MatchCard({ fixture: fx, openMatch, isAdvanced }: { fixture: LiveFixture; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean }) {
  const { isFavoriteTeam } = useFavorites()
  const isFav = isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const isLive = fx.status.short === 'LIVE' || fx.status.short === 'HT' || (fx as any).status?.state === 'in'
  const time = formatMatchTime(fx.date)
  const imp = getMatchImportanceScore(toScoring(fx))

  return (
    <div onClick={() => openMatch(fx)} className={`group rounded-[16px] border ${isFav ? 'border-cyan-500/15' : 'border-white/[0.05]'} bg-white/[0.015] p-4 cursor-pointer hover:border-white/[0.1] hover:bg-white/[0.025] transition-all`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-[9px] font-semibold ${isLive ? 'text-emerald-400' : 'text-white/20'}`}>{isLive ? `${fx.status.elapsed || ''}' Ao vivo` : time}</span>
        {isAdvanced && <span className="text-[8px] text-white/15 font-mono">{imp}</span>}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={24} />
          <span className="text-[11px] font-semibold text-white/70">{fx.homeTeam.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[16px] font-bold tabular-nums text-white">{fx.score.home ?? '-'}</span>
          <span className="text-[9px] text-white/10">:</span>
          <span className="text-[16px] font-bold tabular-nums text-white">{fx.score.away ?? '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-white/50">{fx.awayTeam.name}</span>
          <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={24} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[9px] text-white/20">{fx.league.name}</span>
        <span className="text-[9px] text-cyan-400/0 group-hover:text-cyan-400/60 font-medium transition-colors">Analisar →</span>
      </div>
    </div>
  )
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group">
      <span className="text-[11px] text-white/40 group-hover:text-white/60">{label}</span>
      <ChevronRight size={12} className="text-white/15 group-hover:text-white/40" />
    </button>
  )
}
