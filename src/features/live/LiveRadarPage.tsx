import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { RefreshCw, X, LayoutList, TableProperties, Eye } from 'lucide-react'
import { getLiveFixtures, type LiveFixture } from '@/lib/apiClient'
import { storeFixtureForNavigation } from '@/lib/matchNavigation'
import { useFavorites } from '@/context/FavoritesContext'
import { useViewMode } from '@/context/ViewModeContext'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { isLiveStatus } from '@/lib/footballStatus'
import { translateStage } from '@/lib/competitionLabels'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { ScoreDebugBadge } from '@/components/ui/ScoreDebugBadge'
import { isPenaltyShootout } from '@/lib/penaltyShootout'
import { LoadingState } from '@/components/ui/LoadingState'
import { sortByAttention, calculateAttention } from './attentionQueue'
import { sortByFeaturedRanking, scoreLiveMatchForFeature, getClubAnchorExported } from './liveMatchRanking'
import { isTrulyLiveFixture, filterTrulyLiveFixtures } from '@/lib/liveFixtureGuard'
import { getAdaptivePollingInterval } from '@/lib/liveFreshness'
import { feedScoreCacheFromEvents } from '@/lib/liveScoreCache'
import { LiveScannerTable, type FixtureStats } from './LiveScannerTable'
import { QUICK_SCANNERS } from './liveQuickScanners'
import { useLiveWatchlist } from './useLiveWatchlist'
import { detectChanges, type ChangeEvent } from './liveChangeRadar'
import { InspectorPanel } from '@/components/live/InspectorPanel'
import { LiveEventTicker } from '@/components/live/LiveEventTicker'
import { RefreshProgressBar } from '@/components/live/RefreshProgressBar'
import { LiveRadarSummary } from '@/components/live/LiveRadarSummary'
import { LiveMatchDetailView } from './LiveMatchDetailView'
import { recordScopeEntities } from '@/services/intelligence/scopeKnowledgeBase'

export function LiveRadarPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // Expanded match detail (inline, no navigation)
  const [expandedFixture, setExpandedFixture] = useState<LiveFixture | null>(() => {
    // Check if navigated from Matches with a fixture to open
    const fromState = (location.state as any)?.openFixture as LiveFixture | undefined
    return fromState || null
  })

  // Helper: open match detail inline
  const openMatch = useCallback((fixture: LiveFixture) => {
    setExpandedFixture(fixture)
  }, [])

  const allFixturesRef = useRef<LiveFixture[] | null>(null)
  const fetcher = useCallback(async () => (await getLiveFixtures()).fixtures, [])
  const pollingInterval = allFixturesRef.current ? getAdaptivePollingInterval(allFixturesRef.current) : 15_000
  const { data: allFixtures, loading, error, lastUpdate, refreshing, refresh } = useAutoRefresh(fetcher, { intervalMs: pollingInterval })

  // Keep ref in sync for the navigate helpers + feed scope KB
  useEffect(() => {
    allFixturesRef.current = allFixtures || null
    if (allFixtures && allFixtures.length > 0) {
      try { recordScopeEntities(allFixtures) } catch { /* */ }
    }
  }, [allFixtures])

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(15)
  const [mode, setMode] = useState<'focus' | 'scanner'>('focus')
  const [scannerStats, setScannerStats] = useState<Map<number, FixtureStats>>(new Map())
  const [activeScanner, setActiveScanner] = useState('all')
  const [changes, setChanges] = useState<ChangeEvent[]>([])
  const { watchlist, toggle: toggleWatch, isWatching } = useLiveWatchlist()
  const [summaryFilter, setSummaryFilter] = useState('')
  const { isFavoriteTeam: isFavTeamLive, isFavoriteMatch: isFavMatchLive, hasAnyFavorite } = useFavorites()
  const { isAdvanced: isAdvancedMode } = useViewMode()

  // Countdown
  useEffect(() => {
    const id = setInterval(() => setCountdown(c => c <= 1 ? 15 : c - 1), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { setCountdown(15) }, [lastUpdate])

  // Change radar: detect changes between refreshes
  useEffect(() => {
    if (allFixtures && allFixtures.length > 0) {
      const newChanges = detectChanges(allFixtures)
      if (newChanges.length > 0) {
        setChanges(prev => [...newChanges, ...prev].slice(0, 20))
      }
    }
  }, [lastUpdate])

  // Fetch stats for all live fixtures (used by Summary, Scanner, Inspector, Foco)
  useEffect(() => {
    const lf = (allFixtures || []).filter((fx: LiveFixture) => isTrulyLiveFixture(fx))
    if (lf.length === 0) return
    const fetchStats = async () => {
      const batch = lf.slice(0, 20)
      const results = await Promise.allSettled(
        batch.map(async (fx) => {
          // Only fetch ESPN summary for ESPN-provider fixtures
          if (fx.provider !== 'espn') return null
          const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${fx.id}`)
          if (!res.ok) return null
          const json = await res.json()
          const homeS = json.boxscore?.teams?.[0]?.statistics || []
          const awayS = json.boxscore?.teams?.[1]?.statistics || []
          const get = (arr: any[], name: string) => {
            const s = arr.find((x: any) => x.name === name || x.label === name)
            return s ? parseFloat(s.displayValue) || 0 : undefined
          }
          return {
            id: fx.id,
            stats: {
              possession: { home: get(homeS, 'possessionPct') || get(homeS, 'POSSESSION') || 0, away: get(awayS, 'possessionPct') || get(awayS, 'POSSESSION') || 0 },
              shots: { home: get(homeS, 'totalShots') || get(homeS, 'SHOTS') || 0, away: get(awayS, 'totalShots') || get(awayS, 'SHOTS') || 0 },
              shotsOnTarget: { home: get(homeS, 'shotsOnTarget') || get(homeS, 'ON GOAL') || 0, away: get(awayS, 'shotsOnTarget') || get(awayS, 'ON GOAL') || 0 },
              corners: { home: get(homeS, 'wonCorners') || get(homeS, 'Corner Kicks') || 0, away: get(awayS, 'wonCorners') || get(awayS, 'Corner Kicks') || 0 },
              yellowCards: { home: get(homeS, 'yellowCards') || get(homeS, 'Yellow Cards') || 0, away: get(awayS, 'yellowCards') || get(awayS, 'Yellow Cards') || 0 },
            } as FixtureStats,
            // V15: Extract goal events to feed global score cache
            goalEvents: (json.keyEvents || [])
              .filter((ev: any) => {
                const t = (ev.type?.text || '').toLowerCase()
                return t.includes('goal') || (t.includes('penalty') && !t.includes('missed') && !t.includes('saved'))
              })
              .map((ev: any) => ({
                type: (ev.type?.text || '').toLowerCase().includes('own goal') ? 'own_goal'
                  : (ev.type?.text || '').toLowerCase().includes('penalty') ? 'penalty_scored' : 'goal',
                side: ev.team?.displayName === fx.homeTeam.name ? 'home' : 'away',
                minute: ev.clock?.value ? Math.floor(ev.clock.value / 60) : undefined,
                playerName: ev.athletesInvolved?.[0]?.displayName || '',
              })),
          }
        })
      )
      const newStats = new Map<number, FixtureStats>()
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          newStats.set(r.value.id, r.value.stats)
          // V15: Feed global score cache from goal events
          if (r.value.goalEvents && r.value.goalEvents.length > 0) {
            const fx = batch.find(f => f.id === r.value!.id)
            if (fx) {
              feedScoreCacheFromEvents(fx.id, fx.score.home ?? 0, fx.score.away ?? 0, r.value.goalEvents)
            }
          }
        }
      }
      setScannerStats(newStats)
    }
    fetchStats()
  }, [allFixtures, lastUpdate])

  const fixtures = allFixtures || []

  const { liveFixtures, rejectedCount } = useMemo(() => {
    // V2.6 integrity: use central guard that validates both status AND date
    const { live, rejected } = filterTrulyLiveFixtures(fixtures)
    if (rejected.length > 0 && import.meta.env.DEV) {
      console.debug(`[LiveRadar] Rejected ${rejected.length} fixtures:`, rejected.map(r => ({ name: `${r.fixture.homeTeam.name} vs ${r.fixture.awayTeam.name}`, reasons: r.reasons })))
    }
    return { liveFixtures: live, rejectedCount: rejected.length }
  }, [fixtures])

  const upcomingFixtures = useMemo(() => {
    const now = Date.now()
    return fixtures
      .filter((fx) => {
        if (isLiveStatus(fx.status.short) || fx.status.short === 'LIVE' || fx.status.short === 'HT') return false
        if (fx.status.short === 'FT' || fx.raw?.includes('FULL_TIME')) return false
        if (fx.status.short !== 'NS') return false
        const k = new Date(fx.date).getTime()
        return !isNaN(k) && k > now && k < now + 3 * 3600_000
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 6)
  }, [fixtures])

  // Smart search with commands
  const filtered = useMemo(() => {
    let list = liveFixtures
    if (search.trim()) {
      const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      list = list.filter((fx) => {
        if (q === 'ao vivo' || q === 'live') return true
        if (q.includes('com stats') || q.includes('com estat')) { const s = scannerStats.get(fx.id); return Boolean(s && (((s.shots?.home || 0) + (s.shots?.away || 0)) > 0 || ((s.possession?.home || 0) + (s.possession?.away || 0)) > 10)) }
        if (q.includes('alta aten') || q.includes('critica')) { const a = calculateAttention(fx); return a.level === 'critical' || a.level === 'high' }
        if (q.includes('2 tempo') || q.includes('segundo tempo')) return (fx.status.elapsed || 0) > 45
        if (q.includes('com gol')) return ((fx.score.home ?? 0) + (fx.score.away ?? 0)) > 0
        if (q.includes('empate')) return (fx.score.home ?? 0) === (fx.score.away ?? 0)
        const fields = [fx.homeTeam.name, fx.awayTeam.name, fx.league.name, fx.league.country, fx.provider].map(s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
        return fields.some(f => f.includes(q))
      })
    }
    // Apply summary filter
    if (summaryFilter === 'high_attention') list = list.filter(fx => calculateAttention(fx, scannerStats.get(fx.id)).score >= 60)
    else if (summaryFilter === 'final_phase') list = list.filter(fx => (fx.status.elapsed || 0) >= 75)
    else if (summaryFilter === 'with_stats') list = list.filter(fx => { const s = scannerStats.get(fx.id); if (!s) return false; const poss = (s.possession?.home || 0) + (s.possession?.away || 0); const shots = (s.shots?.home || 0) + (s.shots?.away || 0); return poss > 10 || shots > 0 })
    else if (summaryFilter === 'open_games') list = list.filter(fx => { const g = (fx.score.home ?? 0) + (fx.score.away ?? 0); const s = scannerStats.get(fx.id); return g >= 3 || ((s?.shots?.home || 0) + (s?.shots?.away || 0)) >= 16 })
    else if (summaryFilter === 'favorites') list = list.filter(fx => isFavTeamLive(fx.homeTeam.name) || isFavTeamLive(fx.awayTeam.name) || isFavMatchLive(buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)))
    return sortByAttention(list, scannerStats)
  }, [liveFixtures, search, scannerStats, summaryFilter])

  // V2.7 FINAL: Hero is computed from ALL live fixtures (not filtered by search/summary).
  // Includes audience anchor override: a fixture with anchor >= 90 always beats
  // one with anchor < 90 unless the score difference exceeds 40 points.
  const { heroFixture, heroRanking, heroOverrideInfo } = useMemo(() => {
    if (liveFixtures.length === 0) return { heroFixture: null, heroRanking: [], heroOverrideInfo: null }
    const ranked = sortByFeaturedRanking(liveFixtures, { isFavoriteTeam: isFavTeamLive, statsMap: scannerStats })

    // Build ranking items for debug
    const items = ranked.map((fx, i) => {
      const result = scoreLiveMatchForFeature(fx, { isFavoriteTeam: isFavTeamLive, stats: scannerStats.get(fx.id), allFixtures: ranked })
      const homeAnchor = getClubAnchorExported(fx.homeTeam.name)
      const awayAnchor = getClubAnchorExported(fx.awayTeam.name)
      return { fx, rank: i + 1, score: result.score, maxAnchor: Math.max(homeAnchor, awayAnchor), reasons: result.reasons }
    })

    // Audience anchor override
    let finalHero = items[0]?.fx || null
    let overrideInfo: { wasOverridden: boolean; rawTop1Label: string; promotedLabel: string; reason: string; scoreDiff: number } | null = null

    if (items.length >= 2 && items[0]) {
      const top1 = items[0]
      if (top1.maxAnchor < 90) {
        const betterAnchor = items.find(it => it.maxAnchor >= 90 && (top1.score - it.score) <= 40)
        if (betterAnchor) {
          finalHero = betterAnchor.fx
          overrideInfo = {
            wasOverridden: true,
            rawTop1Label: `${top1.fx.homeTeam.name} x ${top1.fx.awayTeam.name}`,
            promotedLabel: `${betterAnchor.fx.homeTeam.name} x ${betterAnchor.fx.awayTeam.name}`,
            reason: `Anchor ${betterAnchor.maxAnchor} > ${top1.maxAnchor}, diff ${top1.score - betterAnchor.score} pts`,
            scoreDiff: top1.score - betterAnchor.score,
          }
        }
      }
    }

    if (import.meta.env.DEV && items.length > 0) {
      console.debug('[GoalSense][LiveHeroSelected]', {
        finalHero: finalHero ? `${finalHero.homeTeam.name} x ${finalHero.awayTeam.name}` : 'none',
        rawTop1: items[0] ? `${items[0].fx.homeTeam.name} x ${items[0].fx.awayTeam.name}` : 'none',
        wasOverridden: !!overrideInfo,
        overrideReason: overrideInfo?.reason || 'n/a',
      })
    }

    return { heroFixture: finalHero, heroRanking: items.slice(0, 8), heroOverrideInfo: overrideInfo }
  }, [liveFixtures, scannerStats, isFavTeamLive])

  const hero = heroFixture
  const rest = filtered.filter(fx => fx.id !== hero?.id)
  const selectedFixture = fixtures.find(f => f.id === selectedId) || null

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') { setSelectedId(null); return }
      if (e.key === 'Enter' && selectedId) { const fx = filtered.find(f => f.id === selectedId) || allFixtures?.find(f => f.id === selectedId); if (fx) openMatch(fx); return }
      if (e.key === '/' && !e.metaKey) { e.preventDefault(); document.querySelector<HTMLInputElement>('[data-search]')?.focus(); return }
      if (e.key === 'f' && !e.metaKey) { setMode('focus'); return }
      if (e.key === 's' && !e.metaKey && !e.ctrlKey) { setMode('scanner'); return }
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { refresh(); return }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && filtered.length > 0) {
        e.preventDefault()
        const idx = filtered.findIndex(f => f.id === selectedId)
        const next = e.key === 'ArrowDown' ? (idx < filtered.length - 1 ? idx + 1 : 0) : (idx > 0 ? idx - 1 : filtered.length - 1)
        setSelectedId(filtered[next].id)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedId, filtered, navigate, refresh])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><LoadingState message="" /></div>

  // If a match is expanded, show its detail inline
  if (expandedFixture) {
    return <LiveMatchDetailView fixture={expandedFixture} onBack={() => setExpandedFixture(null)} />
  }

  return (
    <div className="flex gap-5">
      {/* Main Board */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-white">Ao vivo</h1>
              <p className="text-[12px] text-white/35 mt-0.5">
                {liveFixtures.length > 0 ? `${liveFixtures.length} partidas ao vivo` : 'Nenhuma partida ao vivo agora.'}
                {lastUpdate && ` · ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-0.5">
                <button onClick={() => setMode('focus')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${mode === 'focus' ? 'bg-white/[0.08] text-white/80' : 'text-white/30 hover:text-white/50'}`}>
                  <LayoutList size={12} /> Foco
                </button>
                <button onClick={() => setMode('scanner')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${mode === 'scanner' ? 'bg-white/[0.08] text-white/80' : 'text-white/30 hover:text-white/50'}`}>
                  <TableProperties size={12} /> Scanner
                </button>
              </div>
              <button onClick={refresh} disabled={refreshing} className="group flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-white/40 transition-all hover:border-white/[0.12] hover:text-white/70 disabled:opacity-30" aria-label="Atualizar">
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : 'group-hover:rotate-45 transition-transform'} />
              </button>
            </div>
          </div>
          <RefreshProgressBar countdown={countdown} total={15} />
          {/* V1.1: diagnostic strip in advanced mode */}
          {isAdvancedMode && fixtures.length > 0 && (
            <p className="text-[9px] text-white/15 tabular-nums">
              Live filter: {fixtures.length} recebidas · {rejectedCount} rejeitadas · {liveFixtures.length} ao vivo
            </p>
          )}
        </header>

        {/* Radar Summary */}
        <LiveRadarSummary fixtures={liveFixtures} stats={scannerStats} onFilter={setSummaryFilter} activeFilter={summaryFilter} />

        {/* Search */}
        <div className="relative">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} data-search
            placeholder="Buscar time, liga ou comando"
            className="w-full h-11 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 text-[13px] text-white placeholder:text-white/20 outline-none transition-all focus:border-white/[0.12] focus:bg-white/[0.03]" />
          {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X size={14} /></button>}
        </div>

        {/* Error */}
        {error && <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-5 text-center text-[12px] text-white/40">{error}</div>}

        {/* Scanner Mode */}
        {mode === 'scanner' && (
          <>
            {/* Ticker in scanner */}
            <LiveEventTicker fixtures={liveFixtures} onSelect={(id) => setSelectedId(id)} />

            <div className="flex flex-wrap gap-1.5">
              {QUICK_SCANNERS.map(qs => {
                const count = qs.id === 'all' ? filtered.length : filtered.filter(fx => qs.filter(fx, scannerStats.get(fx.id))).length
                return (
                  <button key={qs.id} onClick={() => setActiveScanner(qs.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${activeScanner === qs.id ? 'bg-white/[0.08] text-white/80 border border-white/[0.1]' : 'text-white/30 hover:text-white/50 border border-transparent'}`}>
                    {qs.label} <span className={`ml-1 tabular-nums ${count > 0 ? 'text-white/40' : 'text-white/15'}`}>{count}</span>
                  </button>
                )
              })}
              <button onClick={() => setActiveScanner('watchlist')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${activeScanner === 'watchlist' ? 'bg-white/[0.08] text-white/80 border border-white/[0.1]' : 'text-white/30 hover:text-white/50 border border-transparent'}`}>
                <Eye size={11} /> Observando <span className="tabular-nums text-white/40">{watchlist.size}</span>
              </button>
            </div>
            <LiveScannerTable
              fixtures={filtered.filter(fx => {
                const scanner = QUICK_SCANNERS.find(q => q.id === activeScanner)
                if (activeScanner === 'watchlist') return isWatching(fx.id)
                if (!scanner || scanner.id === 'all') return true
                return scanner.filter(fx, scannerStats.get(fx.id))
              })}
              stats={scannerStats}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              onOpen={(id) => { const fx = filtered.find(f => f.id === id) || allFixtures?.find(f => f.id === id); if (fx) openMatch(fx) }}
            />
          </>
        )}

        {/* Focus Mode */}
        {mode === 'focus' && (
          <>
            {/* Ticker */}
            <LiveEventTicker fixtures={liveFixtures} onSelect={(id) => setSelectedId(id)} />

            {/* Hero */}
            {hero && (
          <section onClick={() => setSelectedId(hero.id)} onDoubleClick={() => { openMatch(hero) }}
            className="group relative rounded-[28px] border border-white/[0.06] bg-gradient-to-b from-white/[0.025] to-transparent p-8 cursor-pointer transition-all duration-300 hover:border-white/[0.1] hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] animate-slideUp">
            <div className="absolute inset-0 rounded-[28px] bg-gradient-to-b from-cyan-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <HeroContent fixture={hero} stats={scannerStats.get(hero.id)} rankingReasons={scoreLiveMatchForFeature(hero, { isFavoriteTeam: isFavTeamLive, stats: scannerStats.get(hero.id) }).reasons} />
          </section>
        )}

            {/* Debug panel: hero ranking in advanced mode */}
            {isAdvancedMode && heroRanking.length > 0 && (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-3 mt-2">
                {/* Override explanation */}
                {heroOverrideInfo && (
                  <div className="mb-2 pb-2 border-b border-white/[0.04]">
                    <p className="text-[9px] font-bold text-cyan-400/60 uppercase tracking-wider">Destaque por audiência</p>
                    <p className="text-[9px] text-white/35 mt-0.5">
                      {heroOverrideInfo.promotedLabel} promovido sobre {heroOverrideInfo.rawTop1Label}
                    </p>
                    <p className="text-[8px] text-white/20 mt-0.5">{heroOverrideInfo.reason}</p>
                  </div>
                )}
                <p className="text-[9px] font-bold uppercase tracking-wider text-white/20 mb-2">Ranking bruto</p>
                <div className="space-y-1">
                  {heroRanking.slice(0, 6).map(it => {
                    const isHero = it.fx.id === hero?.id
                    const wasRawTop1 = it.rank === 1 && heroOverrideInfo
                    return (
                      <div key={it.fx.id} className={`flex items-center gap-2 text-[9px] tabular-nums ${isHero ? 'text-cyan-400/70' : 'text-white/30'}`}>
                        <span className="w-4 text-right font-bold">{it.rank}.</span>
                        <span className="flex-1 truncate min-w-0">{it.fx.homeTeam.name} x {it.fx.awayTeam.name}</span>
                        <span className="shrink-0">s:{it.score}</span>
                        <span className="shrink-0">a:{it.maxAnchor}</span>
                        {isHero && <span className="shrink-0 text-[8px] text-cyan-400/50 font-bold">HERO</span>}
                        {wasRawTop1 && !isHero && <span className="shrink-0 text-[8px] text-amber-400/50">anchor&lt;90</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

        {/* Attention Queue */}
        {rest.length > 0 && (
          <section className="space-y-1">
            {rest.map((fx) => (
              <MatchRow key={fx.id} fixture={fx} selected={fx.id === selectedId}
                onSelect={() => setSelectedId(fx.id)}
                onOpen={() => { openMatch(fx) }} />
            ))}
          </section>
        )}

        {/* Empty */}
        {filtered.length === 0 && !error && (
          <div className="rounded-[28px] border border-white/[0.04] bg-white/[0.01] py-20 text-center">
            <p className="text-[14px] text-white/40">Nenhuma partida ao vivo</p>
            <p className="text-[12px] text-white/20 mt-1">As partidas aparecerão quando iniciarem</p>
          </div>
        )}

        {/* Upcoming */}
        {upcomingFixtures.length > 0 && (
          <section className="space-y-2 pt-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/20">Em breve</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {upcomingFixtures.map(fx => <UpcomingTile key={fx.id} fixture={fx} />)}
            </div>
          </section>
        )}
          </>
        )}
      </div>

      {/* Inspector — desktop, only in focus mode */}
      {mode === 'focus' && (
        <aside className="hidden xl:block w-[440px] shrink-0 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
          <InspectorPanel fixture={selectedFixture} liveCount={liveFixtures.length} allFixtures={liveFixtures} onSelectBest={() => { if (filtered[0]) setSelectedId(filtered[0].id) }} onOpenDetail={() => { if (selectedFixture) openMatch(selectedFixture) }} />
        </aside>
      )}
    </div>
  )
}

// --- Sub-components ---

function HeroContent({ fixture, stats, rankingReasons }: { fixture: LiveFixture; stats?: FixtureStats; rankingReasons?: string[] }) {
  const elapsed = fixture.status.elapsed
  const { level, reasons } = calculateAttention(fixture, stats)
  const { isAdvanced } = useViewMode()

  return (
    <div className="relative flex flex-col items-center">
      <div className="flex items-center justify-between w-full">
        <div className="flex flex-col items-center gap-4 flex-1">
          <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={88} />
          <span className="text-[16px] font-semibold text-white text-center max-w-[180px] leading-tight">{fixture.homeTeam.name}</span>
        </div>
        <div className="flex flex-col items-center gap-4 px-8">
          <div className="flex items-baseline gap-5">
            <span className="text-[72px] font-bold tabular-nums text-white leading-none">{fixture.score.home ?? 0}</span>
            <span className="text-[24px] text-white/15">:</span>
            <span className="text-[72px] font-bold tabular-nums text-white leading-none">{fixture.score.away ?? 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full animate-pulse ${isPenaltyShootout(fixture.status.short) ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]' : level === 'critical' ? 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.5)]' : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)]'}`} />
            <span className={`text-[14px] font-semibold ${isPenaltyShootout(fixture.status.short) ? 'text-amber-400' : level === 'critical' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isPenaltyShootout(fixture.status.short) ? 'Pênaltis' : elapsed ? `${elapsed}'` : 'Ao vivo'}
            </span>
          </div>
          {fixture.penaltyScore && fixture.penaltyScore.home !== null && fixture.penaltyScore.away !== null && (
            <span className="text-[13px] font-bold tabular-nums text-amber-300/80">Pên. {fixture.penaltyScore.home} - {fixture.penaltyScore.away}</span>
          )}
          <span className="text-[12px] text-white/25">{fixture.league.name}</span>
          <ScoreDebugBadge fixture={fixture} />
        </div>
        <div className="flex flex-col items-center gap-4 flex-1">
          <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={88} />
          <span className="text-[16px] font-semibold text-white text-center max-w-[180px] leading-tight">{fixture.awayTeam.name}</span>
        </div>
      </div>

      {/* Mini insight + stats */}
      <div className="mt-6 flex flex-col items-center gap-3">
        {/* Reasons */}
        {reasons.length > 0 && (
          <div className="flex items-center gap-3 text-[11px] text-white/30">
            {reasons.slice(0, 2).map((r, i) => (
              <span key={i} className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-white/20" />{r}</span>
            ))}
          </div>
        )}
        {/* Stats */}
        {stats && ((stats.shots?.home ?? 0) > 0 || (stats.shotsOnTarget?.home ?? 0) > 0 || (stats.corners?.home ?? 0) > 0 || (stats.corners?.away ?? 0) > 0) && (
          <div className="flex items-center gap-5 text-[12px] text-white/30">
            {stats.shots && (stats.shots.home > 0 || stats.shots.away > 0) && <span>Finalizações <b className="text-white/55">{stats.shots.home}–{stats.shots.away}</b></span>}
            {stats.shotsOnTarget && (stats.shotsOnTarget.home > 0 || stats.shotsOnTarget.away > 0) && <span>No alvo <b className="text-white/55">{stats.shotsOnTarget.home}–{stats.shotsOnTarget.away}</b></span>}
            {stats.corners && (stats.corners.home > 0 || stats.corners.away > 0) && <span>Escanteios <b className="text-white/55">{stats.corners.home}–{stats.corners.away}</b></span>}
            {stats.possession && (stats.possession.home > 0) && <span>Posse <b className="text-white/55">{stats.possession.home.toFixed(0)}%–{stats.possession.away.toFixed(0)}%</b></span>}
          </div>
        )}
        {/* V2.6: ranking reasons in advanced mode */}
        {isAdvanced && rankingReasons && rankingReasons.length > 0 && (
          <p className="text-[9px] text-white/20 mt-1">Destaque: {rankingReasons.join(' · ')}</p>
        )}
      </div>
    </div>
  )
}

function MatchRow({ fixture, selected, onSelect, onOpen }: { fixture: LiveFixture; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const elapsed = fixture.status.elapsed
  const { level } = calculateAttention(fixture)
  const dotColor = level === 'critical' ? 'bg-rose-400' : level === 'high' ? 'bg-amber-400' : 'bg-emerald-400'
  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const matchId = buildCanonicalMatchId(fixture.homeTeam.name, fixture.awayTeam.name, fixture.date)
  const isFav = isFavoriteMatch(matchId) || isFavoriteTeam(fixture.homeTeam.name) || isFavoriteTeam(fixture.awayTeam.name)

  return (
    <div onClick={onSelect} onDoubleClick={onOpen}
      className={`group flex items-center rounded-2xl px-6 py-5 cursor-pointer transition-all duration-200 border ${selected ? 'border-white/[0.08] bg-white/[0.03]' : isFav ? 'border-cyan-500/15 hover:bg-white/[0.02]' : 'border-transparent hover:bg-white/[0.02] hover:border-white/[0.04]'}`}>
      <div className="w-16 shrink-0">
        <span className="flex items-center gap-2 text-[12px] font-semibold tabular-nums text-emerald-400">
          <span className={`h-2 w-2 rounded-full ${isPenaltyShootout(fixture.status.short) ? 'bg-amber-400' : dotColor} animate-pulse`} />
          {isPenaltyShootout(fixture.status.short) ? 'Pên.' : elapsed ? `${elapsed}'` : 'LIVE'}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
        <span className="truncate text-[14px] font-medium text-white/90">{fixture.homeTeam.name}</span>
        <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={36} />
      </div>
      <div className="flex items-center gap-3 px-6 shrink-0">
        <span className="text-[22px] font-bold tabular-nums text-white w-6 text-right">{fixture.score.home ?? 0}</span>
        <span className="text-[14px] text-white/15">-</span>
        <span className="text-[22px] font-bold tabular-nums text-white w-6">{fixture.score.away ?? 0}</span>
      </div>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={36} />
        <span className="truncate text-[14px] font-medium text-white/60">{fixture.awayTeam.name}</span>
      </div>
      <div className="hidden lg:flex items-center gap-2 w-40 justify-end shrink-0">
        <ScoreDebugBadge fixture={fixture} compact />
        <span className="text-[11px] text-white/15 truncate">{fixture.league.name}</span>
        <FavoriteButton active={isFav} onClick={() => toggleFavoriteMatch({ canonicalMatchId: matchId, homeTeam: fixture.homeTeam.name, awayTeam: fixture.awayTeam.name, competition: fixture.league.name, utcDate: fixture.date })} size={13} />
      </div>
    </div>
  )
}

function UpcomingTile({ fixture }: { fixture: LiveFixture }) {
  const diff = Math.max(0, Math.round((new Date(fixture.date).getTime() - Date.now()) / 60000))
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/20 truncate">{fixture.league.name}</span>
        <span className="text-[10px] tabular-nums text-white/25">{diff <= 90 ? `${diff} min` : new Date(fixture.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="flex items-center gap-2">
        <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={18} />
        <span className="text-[11px] text-white/45 truncate flex-1">{fixture.homeTeam.name}</span>
        <span className="text-[9px] text-white/15">vs</span>
        <span className="text-[11px] text-white/45 truncate flex-1 text-right">{fixture.awayTeam.name}</span>
        <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={18} />
      </div>
    </div>
  )
}
