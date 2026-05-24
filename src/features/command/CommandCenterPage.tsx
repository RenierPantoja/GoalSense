/**
 * Command Center V2 — Cockpit de Decisão, Padrões e Automação.
 * Premium experience inspired by Resend, Apple, Linear, Vercel, Arc.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, ChevronRight, AlertCircle, Plus, Activity, Target, Eye, History, BarChart3, Sparkles, X } from 'lucide-react'
import { getLiveFixtures, type LiveFixture } from '@/lib/apiClient'
import { storeFixtureForNavigation } from '@/lib/matchNavigation'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { useFavorites } from '@/context/FavoritesContext'
import { useAlerts } from '@/context/AlertsContext'
import { useViewMode } from '@/context/ViewModeContext'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { getMatchImportanceScore } from '@/utils/matchImportance'
import { usePatterns } from './contexts/PatternContext'
import { evaluateAllPatterns } from './intelligence/patternEvaluator'
import { runAutoDiscovery, type AutoDiscovery } from './intelligence/autoDiscoveryEngine'
import { isLiveFx, detectChanges, type ChangeEvent } from './commandHelpers'
import type { Pattern, PatternTemplate, PatternHit, PatternCondition, FixtureStatsForPattern, ScannerEntry, TriggeredAlert } from './types/commandTypes'

function toScoring(fx: LiveFixture) {
  return { competition: { name: fx.league.name }, homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name }, awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name }, score: { fullTime: { home: fx.score.home, away: fx.score.away } }, status: fx.status.short === 'LIVE' || fx.status.short === 'HT' ? 'IN_PLAY' : fx.status.short === 'FT' ? 'FINISHED' : 'TIMED', utcDate: fx.date, area: { name: fx.league.country } }
}

type Tab = 'cockpit' | 'patterns' | 'scanner' | 'alerts' | 'performance'

export function CommandCenterPage() {
  const navigate = useNavigate()
  const [fixtures, setFixtures] = useState<LiveFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(() => { try { return localStorage.getItem('goalsense_command_autorefresh') !== 'false' } catch { return true } })
  const [changes, setChanges] = useState<ChangeEvent[]>([])
  const [statsMap, setStatsMap] = useState<Map<number, FixtureStatsForPattern>>(new Map())
  const [activeTab, setActiveTab] = useState<Tab>('cockpit')
  const [showBuilder, setShowBuilder] = useState(false)
  const prevFixturesRef = useRef<LiveFixture[] | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { enabledCount } = useAlerts()
  const { isAdvanced } = useViewMode()
  const { patterns, templates, createPattern, createFromTemplate, togglePattern, deletePattern, getActivePatterns, triggeredAlerts, triggerAlert, getRecentTriggered, activePatternCount, triggeredTodayCount } = usePatterns()

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try {
      const r = await getLiveFixtures()
      const newFixtures = r.fixtures || []
      const detected = detectChanges(newFixtures, prevFixturesRef.current)
      if (detected.length > 0) setChanges(prev => [...detected, ...prev].slice(0, 12))
      prevFixturesRef.current = newFixtures
      setFixtures(newFixtures)
      setLastUpdate(new Date())
      setError(null)
    } catch (e) { if (!silent) setError((e as Error).message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  const fetchStats = useCallback(async (fxList: LiveFixture[]) => {
    const live = fxList.filter(fx => isLiveFx(fx) && fx.provider === 'espn').slice(0, 15)
    if (live.length === 0) return
    const results = await Promise.allSettled(
      live.map(async (fx) => {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${fx.id}`)
        if (!res.ok) return null
        const json = await res.json()
        const homeS = json.boxscore?.teams?.[0]?.statistics || []
        const awayS = json.boxscore?.teams?.[1]?.statistics || []
        const get = (arr: any[], name: string) => { const s = arr.find((x: any) => x.name === name || x.label === name); return s ? parseFloat(s.displayValue) || 0 : 0 }
        return { id: fx.id, stats: { possession: { home: get(homeS, 'possessionPct') || get(homeS, 'POSSESSION'), away: get(awayS, 'possessionPct') || get(awayS, 'POSSESSION') }, shots: { home: get(homeS, 'totalShots') || get(homeS, 'SHOTS'), away: get(awayS, 'totalShots') || get(awayS, 'SHOTS') }, shotsOnTarget: { home: get(homeS, 'shotsOnTarget') || get(homeS, 'ON GOAL'), away: get(awayS, 'shotsOnTarget') || get(awayS, 'ON GOAL') }, corners: { home: get(homeS, 'wonCorners') || get(homeS, 'Corner Kicks'), away: get(awayS, 'wonCorners') || get(awayS, 'Corner Kicks') }, yellowCards: { home: get(homeS, 'yellowCards') || get(homeS, 'Yellow Cards'), away: get(awayS, 'yellowCards') || get(awayS, 'Yellow Cards') } } as FixtureStatsForPattern }
      })
    )
    const newMap = new Map<number, FixtureStatsForPattern>()
    for (const r of results) { if (r.status === 'fulfilled' && r.value) newMap.set(r.value.id, r.value.stats) }
    setStatsMap(newMap)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (fixtures.length > 0) fetchStats(fixtures) }, [fixtures, fetchStats])

  const liveMatches = useMemo(() => fixtures.filter(isLiveFx), [fixtures])

  useEffect(() => {
    if (!autoRefresh) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => fetchData(true), liveMatches.length > 0 ? 25000 : 60000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchData, liveMatches.length])

  const toggleAuto = () => { const n = !autoRefresh; setAutoRefresh(n); try { localStorage.setItem('goalsense_command_autorefresh', String(n)) } catch {} }

  // ─── Pattern Evaluation ────────────────────────────────────────────────────

  const patternHits = useMemo(() => {
    const active = getActivePatterns()
    if (active.length === 0 || fixtures.length === 0) return []
    return evaluateAllPatterns(active, fixtures, statsMap, isFavoriteTeam)
  }, [patterns, fixtures, statsMap, isFavoriteTeam, getActivePatterns])

  useEffect(() => {
    for (const hit of patternHits) {
      if (hit.confidence >= 60) {
        triggerAlert({ patternId: hit.patternId, patternName: hit.patternName, fixtureId: hit.fixtureId, homeTeam: hit.fixture.homeTeam.name, awayTeam: hit.fixture.awayTeam.name, league: hit.fixture.league.name, minute: hit.fixture.status.elapsed, confidence: hit.confidence, reasons: hit.reasons, timestamp: new Date().toISOString(), status: 'active', scoreAtTrigger: { home: hit.fixture.score.home ?? 0, away: hit.fixture.score.away ?? 0 } })
      }
    }
  }, [patternHits, triggerAlert])

  // ─── Auto Discovery ────────────────────────────────────────────────────────

  const discoveries = useMemo(() => runAutoDiscovery(fixtures, statsMap, isFavoriteTeam), [fixtures, statsMap, isFavoriteTeam])

  // ─── Scanner ───────────────────────────────────────────────────────────────

  const scannerEntries = useMemo((): ScannerEntry[] => {
    const relevant = [...liveMatches, ...fixtures.filter(fx => fx.status.short === 'NS' && new Date(fx.date).getTime() - Date.now() <= 3600000 && new Date(fx.date).getTime() > Date.now()).slice(0, 6)]
    const unique = Array.from(new Map(relevant.map(fx => [fx.id, fx])).values())
    return unique.map(fx => {
      const fxHits = patternHits.filter(h => h.fixtureId === fx.id)
      const topPattern = fxHits[0] || null
      const confidence = topPattern?.confidence || 0
      const priority: ScannerEntry['priority'] = confidence >= 75 ? 'critical' : confidence >= 50 ? 'attention' : confidence >= 30 ? 'watch' : 'low'
      return { fixture: fx, patterns: fxHits, topPattern, priority, confidence }
    }).sort((a, b) => b.confidence - a.confidence)
  }, [liveMatches, fixtures, patternHits])

  // ─── Decision ──────────────────────────────────────────────────────────────

  const decisionMatch = useMemo(() => {
    if (patternHits.length > 0) return patternHits[0].fixture
    if (liveMatches.length > 0) return [...liveMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a)))[0]
    return null
  }, [patternHits, liveMatches])
  const decisionHit = patternHits[0] || null

  // ─── Metrics ───────────────────────────────────────────────────────────────

  const metrics = useMemo(() => [
    { label: 'Analisados', value: fixtures.length, color: 'white' },
    { label: 'Ao vivo', value: liveMatches.length, color: 'emerald' },
    { label: 'Padrões', value: activePatternCount, color: 'cyan' },
    { label: 'Batendo', value: patternHits.length, color: 'amber' },
    { label: 'Disparados', value: triggeredTodayCount, color: 'rose' },
  ], [fixtures, liveMatches, activePatternCount, patternHits, triggeredTodayCount])

  const openMatch = (fx: LiveFixture) => { storeFixtureForNavigation(fx); navigate(`/app/matches/${fx.id}`, { state: { fixture: fx } }) }
  const timeSince = lastUpdate ? Math.round((Date.now() - lastUpdate.getTime()) / 1000) : null

  if (loading) return (
    <div className="max-w-[1200px] mx-auto flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-10 w-10"><div className="absolute inset-0 rounded-full border border-white/[0.06]" /><div className="absolute inset-0 rounded-full border border-transparent border-t-cyan-400/60 animate-spin" /></div>
        <span className="text-[10px] text-white/15 tracking-wider uppercase">Inicializando motor de decisão</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 animate-fadeIn">
      {/* ═══ HEADER ═══ */}
      <header className="relative rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#060a12] via-[#080d16] to-[#0a1018]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.02),transparent_50%)]" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        <div className="relative px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-semibold text-white tracking-tight">Command Center</h1>
                <span className={`text-[7px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full border ${error ? 'bg-rose-500/6 text-rose-400/60 border-rose-500/10' : 'bg-emerald-500/6 text-emerald-400/60 border-emerald-500/10'}`}>{error ? 'Erro parcial' : 'Online'}</span>
              </div>
              <p className="text-[10px] text-white/20 mt-0.5">
                Motor de decisão em tempo real
                {timeSince !== null && ` · ${timeSince < 60 ? `${timeSince}s` : `${Math.floor(timeSince / 60)}min`}`}
                {refreshing && <span className="text-cyan-400/30 ml-1 animate-pulse">●</span>}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={toggleAuto} className={`h-6 px-2 rounded-md text-[8px] font-medium uppercase tracking-wider transition-all ${autoRefresh ? 'bg-emerald-500/6 text-emerald-400/50 border border-emerald-500/8' : 'text-white/12 border border-white/[0.03]'}`} type="button">Auto</button>
              <button onClick={() => fetchData()} disabled={refreshing} className="h-6 w-6 rounded-md flex items-center justify-center text-white/15 border border-white/[0.04] hover:text-white/40 transition-all disabled:opacity-20" type="button" aria-label="Atualizar"><RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="flex gap-px rounded-lg overflow-hidden bg-white/[0.01] border border-white/[0.03]">
            {metrics.map(m => (
              <div key={m.label} className="flex-1 px-2.5 py-2 text-center">
                <span className={`text-[16px] font-bold tabular-nums block leading-none ${m.value > 0 ? (m.color === 'emerald' ? 'text-emerald-400' : m.color === 'cyan' ? 'text-cyan-400' : m.color === 'amber' ? 'text-amber-400' : m.color === 'rose' ? 'text-rose-400' : 'text-white/50') : 'text-white/10'}`}>{m.value}</span>
                <span className="text-[7px] text-white/15 uppercase tracking-[0.08em] mt-0.5 block">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {error && <div className="rounded-lg border border-rose-500/6 bg-rose-500/[0.01] px-3 py-2 text-[9px] text-rose-400/40 flex items-center gap-2"><AlertCircle size={10} />{error}</div>}

      {/* ═══ NAV ═══ */}
      <nav className="flex gap-0.5">
        {([
          { id: 'cockpit' as Tab, label: 'Cockpit', icon: Activity, badge: patternHits.length > 0 ? patternHits.length : 0 },
          { id: 'patterns' as Tab, label: 'Padrões', icon: Target, badge: activePatternCount },
          { id: 'scanner' as Tab, label: 'Scanner', icon: Eye, badge: 0 },
          { id: 'alerts' as Tab, label: 'Alertas', icon: Zap, badge: triggeredTodayCount },
          { id: 'performance' as Tab, label: 'Performance', icon: BarChart3, badge: 0 },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${activeTab === tab.id ? 'text-white/80 bg-white/[0.04] border border-white/[0.06]' : 'text-white/20 hover:text-white/40 border border-transparent'}`} type="button">
            <tab.icon size={11} />{tab.label}
            {tab.badge > 0 && <span className={`text-[7px] px-1 rounded-full ${activeTab === tab.id ? 'bg-cyan-500/15 text-cyan-400/70' : 'bg-white/[0.04] text-white/25'}`}>{tab.badge}</span>}
          </button>
        ))}
      </nav>

      {/* ═══ CONTENT ═══ */}
      {activeTab === 'cockpit' && <CockpitTab decisionMatch={decisionMatch} decisionHit={decisionHit} patternHits={patternHits} discoveries={discoveries} changes={changes} liveMatches={liveMatches} fixtures={fixtures} openMatch={openMatch} isAdvanced={isAdvanced} activePatternCount={activePatternCount} enabledCount={enabledCount} triggeredAlerts={getRecentTriggered(5)} onGoToPatterns={() => setActiveTab('patterns')} navigate={navigate} />}
      {activeTab === 'patterns' && <PatternsTab patterns={patterns} templates={templates} createFromTemplate={createFromTemplate} createPattern={createPattern} togglePattern={togglePattern} deletePattern={deletePattern} isAdvanced={isAdvanced} showBuilder={showBuilder} setShowBuilder={setShowBuilder} />}
      {activeTab === 'scanner' && <ScannerTab entries={scannerEntries} openMatch={openMatch} isAdvanced={isAdvanced} statsMap={statsMap} isFavoriteTeam={isFavoriteTeam} />}
      {activeTab === 'alerts' && <AlertsTab triggeredAlerts={getRecentTriggered(30)} isAdvanced={isAdvanced} openMatch={openMatch} fixtures={fixtures} navigate={navigate} />}
      {activeTab === 'performance' && <PerformanceTab patterns={patterns} triggeredAlerts={triggeredAlerts} isAdvanced={isAdvanced} />}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT TAB
// ═══════════════════════════════════════════════════════════════════════════════

function CockpitTab({ decisionMatch, decisionHit, patternHits, discoveries, changes, liveMatches, fixtures, openMatch, isAdvanced, activePatternCount, enabledCount, triggeredAlerts, onGoToPatterns, navigate }: { decisionMatch: LiveFixture | null; decisionHit: PatternHit | null; patternHits: PatternHit[]; discoveries: AutoDiscovery[]; changes: ChangeEvent[]; liveMatches: LiveFixture[]; fixtures: LiveFixture[]; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; activePatternCount: number; enabledCount: number; triggeredAlerts: TriggeredAlert[]; onGoToPatterns: () => void; navigate: (path: string) => void }) {
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { templates, createFromTemplate } = usePatterns()

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5">
      <div className="space-y-5">

        {/* ═══ DECISÃO AGORA ═══ */}
        {decisionMatch ? (
          <section className="group relative rounded-2xl overflow-hidden cursor-pointer" onClick={() => openMatch(decisionMatch)} role="button">
            <div className="absolute inset-0 bg-gradient-to-br from-[#070b13] via-[#090d17] to-[#0b101a]" />
            <div className="absolute inset-0 border border-white/[0.04] rounded-2xl group-hover:border-white/[0.08] transition-colors duration-300" />
            {decisionHit && <div className="absolute top-0 left-1/3 w-[180px] h-[50px] bg-amber-500/[0.015] rounded-full blur-[35px]" />}
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {decisionHit && <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.3)] animate-pulse" />}
                  <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/25">{decisionHit ? 'Padrão detectado' : 'Jogo prioritário'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FavoriteButton active={isFavoriteMatch(buildCanonicalMatchId(decisionMatch.homeTeam.name, decisionMatch.awayTeam.name, decisionMatch.date))} onClick={(e) => { e.stopPropagation(); toggleFavoriteMatch({ canonicalMatchId: buildCanonicalMatchId(decisionMatch.homeTeam.name, decisionMatch.awayTeam.name, decisionMatch.date), homeTeam: decisionMatch.homeTeam.name, awayTeam: decisionMatch.awayTeam.name, competition: decisionMatch.league.name, utcDate: decisionMatch.date }) }} size={11} />
                  <span className={`text-[9px] font-medium px-2 py-0.5 rounded-md ${isLiveFx(decisionMatch) ? 'bg-emerald-500/8 text-emerald-400 border border-emerald-500/8' : 'text-white/15'}`}>{isLiveFx(decisionMatch) ? `${decisionMatch.status.elapsed || ''}'` : new Date(decisionMatch.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col items-center gap-1.5 w-[90px]">
                  <ClubLogo src={decisionMatch.homeTeam.logo} name={decisionMatch.homeTeam.name} size={44} />
                  <span className="text-[9px] font-medium text-white/55 text-center leading-tight">{decisionMatch.homeTeam.name}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-baseline gap-2"><span className="text-[32px] font-bold tabular-nums text-white leading-none">{decisionMatch.score.home ?? '-'}</span><span className="text-[10px] text-white/8">:</span><span className="text-[32px] font-bold tabular-nums text-white leading-none">{decisionMatch.score.away ?? '-'}</span></div>
                  {isLiveFx(decisionMatch) && <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.3)] animate-pulse" />}
                  <span className="text-[8px] text-white/12 mt-0.5">{decisionMatch.league.name}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 w-[90px]">
                  <ClubLogo src={decisionMatch.awayTeam.logo} name={decisionMatch.awayTeam.name} size={44} />
                  <span className="text-[9px] font-medium text-white/35 text-center leading-tight">{decisionMatch.awayTeam.name}</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/[0.025]">
                {decisionHit ? (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${decisionHit.severity === 'critical' ? 'bg-rose-500/8 text-rose-400/60' : 'bg-amber-500/6 text-amber-400/50'}`}>{decisionHit.patternName}</span>
                      <span className="text-[8px] text-white/15 tabular-nums">{decisionHit.confidence}% confiança</span>
                    </div>
                    <p className="text-[9px] text-white/30 leading-relaxed mb-1.5">Evidências: {decisionHit.reasons.slice(0, 4).join(' · ')}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-white/15">Ação: Abrir análise detalhada</span>
                      <span className="text-[9px] text-cyan-400/40 group-hover:text-cyan-400/70 font-medium flex items-center gap-0.5 transition-colors">Abrir <ChevronRight size={9} /></span>
                    </div>
                    {isAdvanced && <div className="mt-1.5 text-[7px] text-white/8 font-mono">cond:{decisionHit.matchedConditions}/{decisionHit.totalConditions} · imp:{getMatchImportanceScore(toScoring(decisionMatch))} · {decisionHit.confidenceLevel}</div>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/15">Jogo mais relevante ao vivo</span>
                    <span className="text-[9px] text-cyan-400/35 group-hover:text-cyan-400/60 font-medium flex items-center gap-0.5 transition-colors">Abrir <ChevronRight size={9} /></span>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/[0.03] bg-white/[0.005] p-6 text-center">
            <p className="text-[11px] text-white/20">Nenhuma decisão crítica agora</p>
            <p className="text-[9px] text-white/10 mt-1">Monitorando {fixtures.length} partidas · {activePatternCount} padrões ativos</p>
          </section>
        )}

        {/* ═══ PADRÕES BATENDO ═══ */}
        {patternHits.length > 0 && (
          <section>
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-400/35 mb-2 flex items-center gap-1.5"><Zap size={9} />Padrões batendo</h3>
            <div className="space-y-1">
              {patternHits.slice(0, 5).map((hit, i) => (
                <div key={`${hit.patternId}-${hit.fixtureId}-${i}`} onClick={() => openMatch(hit.fixture)} className="group flex items-center gap-2.5 rounded-lg border border-white/[0.025] bg-white/[0.004] px-3 py-2 cursor-pointer hover:border-white/[0.06] transition-all" role="button">
                  <span className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${hit.severity === 'critical' ? 'bg-rose-500/8 text-rose-400/50' : hit.severity === 'attention' ? 'bg-amber-500/6 text-amber-400/40' : 'bg-white/[0.02] text-white/15'}`}>{hit.severity === 'critical' ? 'CRÍTICO' : hit.severity === 'attention' ? 'ATENÇÃO' : 'INFO'}</span>
                  <ClubLogo src={hit.fixture.homeTeam.logo} name={hit.fixture.homeTeam.name} size={14} />
                  <span className="text-[9px] text-white/45 truncate flex-1">{hit.fixture.homeTeam.name} {hit.fixture.score.home ?? '-'}:{hit.fixture.score.away ?? '-'} {hit.fixture.awayTeam.name}</span>
                  <span className="text-[8px] text-white/15 shrink-0">{hit.patternName}</span>
                  <span className="text-[7px] text-white/10 tabular-nums shrink-0">{hit.confidence}%</span>
                  <ChevronRight size={9} className="text-white/6 group-hover:text-white/20 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ DESCOBERTAS AUTOMÁTICAS ═══ */}
        {discoveries.length > 0 && (
          <section>
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-400/30 mb-2 flex items-center gap-1.5"><Sparkles size={9} />Descobertas automáticas</h3>
            <div className="space-y-1">
              {discoveries.slice(0, 4).map(d => (
                <div key={d.id} onClick={() => openMatch(d.fixture)} className="group flex items-center gap-2.5 rounded-lg border border-white/[0.02] bg-white/[0.003] px-3 py-2 cursor-pointer hover:border-white/[0.05] transition-all" role="button">
                  <span className="text-[9px] text-white/40 flex-1">{d.insight}</span>
                  <span className="text-[7px] text-white/12 shrink-0">{d.confidence}%</span>
                  <ChevronRight size={9} className="text-white/6 group-hover:text-white/15 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ ONBOARDING — no patterns ═══ */}
        {activePatternCount === 0 && patternHits.length === 0 && discoveries.length === 0 && (
          <section className="rounded-2xl border border-white/[0.03] bg-gradient-to-b from-white/[0.008] to-transparent p-5">
            <h3 className="text-[12px] font-medium text-white/50 mb-1">Ative seu primeiro radar</h3>
            <p className="text-[9px] text-white/18 mb-4 max-w-[360px]">Padrões monitoram jogos ao vivo e detectam oportunidades automaticamente. Ative um template para começar.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {templates.slice(0, 4).map(t => (
                <button key={t.id} onClick={(e) => { e.stopPropagation(); createFromTemplate(t.id) }} className="text-left rounded-lg border border-white/[0.03] bg-white/[0.003] px-3 py-2 hover:border-white/[0.07] hover:bg-white/[0.008] transition-all group" type="button">
                  <span className="text-[9px] text-white/40 group-hover:text-white/60 block">{t.name}</span>
                  <span className="text-[7px] text-white/12 block mt-0.5">{t.conditions.length} condições · {t.severity}</span>
                </button>
              ))}
            </div>
            <button onClick={onGoToPatterns} className="mt-3 text-[9px] text-cyan-400/40 hover:text-cyan-400/70 font-medium transition-colors" type="button">Ver todos os templates →</button>
          </section>
        )}
      </div>

      {/* RIGHT */}
      <aside className="space-y-3">
        {changes.length > 0 && (
          <div className="rounded-xl border border-white/[0.03] bg-white/[0.005] p-3">
            <h4 className="text-[7px] font-semibold uppercase tracking-[0.15em] text-amber-400/25 mb-2">Mudanças</h4>
            <div className="space-y-1">{changes.slice(0, 4).map(c => (<div key={c.id} className={`rounded px-2 py-1 border-l-2 ${c.type === 'score_change' ? 'border-l-emerald-400/30 bg-emerald-500/[0.01]' : c.type === 'final_phase' ? 'border-l-amber-400/25 bg-amber-500/[0.01]' : 'border-l-white/[0.06] bg-white/[0.003]'}`}><span className="text-[7px] text-white/25">{c.text}</span></div>))}</div>
          </div>
        )}
        {triggeredAlerts.length > 0 && (
          <div className="rounded-xl border border-white/[0.03] bg-white/[0.005] p-3">
            <h4 className="text-[7px] font-semibold uppercase tracking-[0.15em] text-rose-400/25 mb-2">Disparados</h4>
            <div className="space-y-1">{triggeredAlerts.slice(0, 3).map(t => (<div key={t.id} className="rounded px-2 py-1 bg-white/[0.003] border border-white/[0.015]"><span className="text-[7px] text-white/30 block">{t.patternName}</span><span className="text-[7px] text-white/12">{t.homeTeam} x {t.awayTeam} · {t.confidence}%</span></div>))}</div>
          </div>
        )}
        <div className="rounded-xl border border-white/[0.03] bg-white/[0.005] p-3">
          <h4 className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/12 mb-2">Ações</h4>
          <div className="space-y-0.5">
            {liveMatches.length > 0 && <SideBtn label="Ver ao vivo" onClick={() => navigate('/app/live')} />}
            <SideBtn label="Configurar padrões" onClick={onGoToPatterns} />
            {enabledCount === 0 && <SideBtn label="Criar alertas" onClick={() => navigate('/app/alerts')} />}
            <SideBtn label="Explorar partidas" onClick={() => navigate('/app/matches')} />
          </div>
        </div>
      </aside>
    </div>
  )
}

function SideBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center justify-between w-full px-2 py-1 rounded hover:bg-white/[0.01] transition-colors group" type="button"><span className="text-[8px] text-white/20 group-hover:text-white/40">{label}</span><ChevronRight size={8} className="text-white/6 group-hover:text-white/15" /></button>
}


// ═══════════════════════════════════════════════════════════════════════════════
// PATTERNS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function PatternsTab({ patterns, templates, createFromTemplate, createPattern, togglePattern, deletePattern, isAdvanced, showBuilder, setShowBuilder }: { patterns: Pattern[]; templates: PatternTemplate[]; createFromTemplate: (id: string) => Pattern | null; createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern; togglePattern: (id: string) => void; deletePattern: (id: string) => void; isAdvanced: boolean; showBuilder: boolean; setShowBuilder: (v: boolean) => void }) {
  return (
    <div className="space-y-6">
      {/* Pattern Builder */}
      {showBuilder && <PatternBuilder onSave={(p) => { createPattern(p); setShowBuilder(false) }} onCancel={() => setShowBuilder(false)} />}

      {/* Active patterns */}
      {patterns.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">Padrões configurados</h3>
            <button onClick={() => setShowBuilder(true)} className="text-[8px] text-cyan-400/40 hover:text-cyan-400/70 font-medium flex items-center gap-1 transition-colors" type="button"><Plus size={9} />Criar</button>
          </div>
          <div className="space-y-1.5">
            {patterns.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-white/[0.03] bg-white/[0.005] px-3.5 py-2.5">
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.status === 'active' ? 'bg-emerald-400/60' : 'bg-white/10'}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-white/55 block">{p.name}</span>
                  {isAdvanced && <span className="text-[7px] text-white/10 font-mono">{p.conditions.length} cond · {p.severity}</span>}
                </div>
                <button onClick={() => togglePattern(p.id)} className={`text-[7px] px-2 py-0.5 rounded border transition-all ${p.status === 'active' ? 'border-emerald-500/12 text-emerald-400/45' : 'border-white/[0.03] text-white/15'}`} type="button">{p.status === 'active' ? 'Ativo' : 'Pausado'}</button>
                <button onClick={() => deletePattern(p.id)} className="text-[8px] text-white/10 hover:text-rose-400/40 transition-colors" type="button">×</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Templates Library */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25">Biblioteca de padrões</h3>
          {!showBuilder && <button onClick={() => setShowBuilder(true)} className="text-[8px] text-cyan-400/40 hover:text-cyan-400/70 font-medium flex items-center gap-1 transition-colors" type="button"><Plus size={9} />Criar personalizado</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {templates.map(t => {
            const alreadyActive = patterns.some(p => p.templateId === t.id && p.status === 'active')
            return (
              <div key={t.id} className="rounded-xl border border-white/[0.03] bg-white/[0.004] p-3.5 hover:border-white/[0.06] transition-all">
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <span className="text-[10px] font-medium text-white/50 block">{t.name}</span>
                    <span className={`text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded mt-0.5 inline-block ${t.severity === 'critical' ? 'bg-rose-500/6 text-rose-400/40' : t.severity === 'attention' ? 'bg-amber-500/5 text-amber-400/35' : 'bg-white/[0.015] text-white/12'}`}>{t.severity}</span>
                  </div>
                  {alreadyActive ? <span className="text-[7px] text-emerald-400/35">✓ Ativo</span> : <button onClick={() => createFromTemplate(t.id)} className="text-[8px] text-cyan-400/45 hover:text-cyan-400/80 font-medium transition-colors" type="button">Ativar</button>}
                </div>
                <p className="text-[8px] text-white/18 leading-relaxed">{t.description}</p>
                {isAdvanced && <div className="mt-1.5 flex flex-wrap gap-0.5">{t.conditions.map((c, i) => <span key={i} className="text-[6px] text-white/8 bg-white/[0.015] px-1 py-0.5 rounded">{c.type}</span>)}</div>}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

const CONDITION_OPTIONS: { type: PatternCondition['type']; label: string; hasParam: boolean; paramLabel?: string; defaultValue?: number }[] = [
  { type: 'is_live', label: 'Jogo ao vivo', hasParam: false },
  { type: 'is_final_phase', label: 'Reta final (70\'+)', hasParam: false },
  { type: 'minute_between', label: 'Minuto entre', hasParam: true, paramLabel: 'min-max', defaultValue: 60 },
  { type: 'score_tied', label: 'Placar empatado', hasParam: false },
  { type: 'score_diff_lte', label: 'Diferença de gols ≤', hasParam: true, paramLabel: 'max', defaultValue: 1 },
  { type: 'favorite_involved', label: 'Favorito envolvido', hasParam: false },
  { type: 'shots_on_target_gte', label: 'Finalizações no alvo ≥', hasParam: true, paramLabel: 'min', defaultValue: 4 },
  { type: 'shots_recent_gte', label: 'Finalizações totais ≥', hasParam: true, paramLabel: 'min', defaultValue: 8 },
  { type: 'corners_gte', label: 'Escanteios ≥', hasParam: true, paramLabel: 'min', defaultValue: 6 },
  { type: 'possession_gte', label: 'Posse ≥', hasParam: true, paramLabel: '%', defaultValue: 60 },
  { type: 'cards_gte', label: 'Cartões ≥', hasParam: true, paramLabel: 'min', defaultValue: 3 },
  { type: 'goals_total_gte', label: 'Gols totais ≥', hasParam: true, paramLabel: 'min', defaultValue: 3 },
  { type: 'is_pre_live', label: 'Começa em breve', hasParam: false },
]

function PatternBuilder({ onSave, onCancel }: { onSave: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'critical' | 'attention' | 'info'>('attention')
  const [conditions, setConditions] = useState<PatternCondition[]>([{ type: 'is_live', params: {} }])

  const addCondition = (type: PatternCondition['type']) => {
    const opt = CONDITION_OPTIONS.find(o => o.type === type)
    const params: Record<string, number | string | boolean> = {}
    if (type === 'minute_between') { params.min = 60; params.max = 90 }
    else if (type === 'score_diff_lte') { params.maxDiff = 1 }
    else if (type === 'is_pre_live') { params.minutes = 60 }
    else if (opt?.hasParam && opt.defaultValue !== undefined) { params.value = opt.defaultValue }
    setConditions(prev => [...prev, { type, params }])
  }

  const removeCondition = (idx: number) => setConditions(prev => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    if (!name.trim() || conditions.length === 0) return
    onSave({ name: name.trim(), description: description.trim(), conditions, severity, status: 'active', isTemplate: false })
  }

  return (
    <div className="rounded-xl border border-cyan-500/10 bg-gradient-to-b from-cyan-500/[0.02] to-transparent p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-medium text-white/50">Criar padrão personalizado</h3>
        <button onClick={onCancel} className="text-white/15 hover:text-white/40 transition-colors" type="button"><X size={14} /></button>
      </div>
      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do padrão" className="w-full h-8 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 text-[10px] text-white placeholder:text-white/15 outline-none focus:border-white/[0.1]" />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)" className="w-full h-8 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 text-[10px] text-white placeholder:text-white/15 outline-none focus:border-white/[0.1]" />
        <div className="flex gap-1.5">
          {(['critical', 'attention', 'info'] as const).map(s => (
            <button key={s} onClick={() => setSeverity(s)} className={`text-[8px] px-2 py-1 rounded-md border transition-all ${severity === s ? 'border-white/[0.08] text-white/50 bg-white/[0.03]' : 'border-white/[0.03] text-white/15'}`} type="button">{s === 'critical' ? 'Crítico' : s === 'attention' ? 'Atenção' : 'Info'}</button>
          ))}
        </div>
        <div>
          <span className="text-[8px] text-white/20 block mb-1.5">Condições ({conditions.length})</span>
          <div className="space-y-1">
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-white/[0.015] px-2.5 py-1.5">
                <span className="text-[8px] text-white/35 flex-1">{CONDITION_OPTIONS.find(o => o.type === c.type)?.label || c.type}</span>
                <button onClick={() => removeCondition(i)} className="text-[8px] text-white/10 hover:text-rose-400/40" type="button">×</button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {CONDITION_OPTIONS.filter(o => !conditions.some(c => c.type === o.type)).slice(0, 6).map(o => (
              <button key={o.type} onClick={() => addCondition(o.type)} className="text-[7px] text-white/15 hover:text-white/35 bg-white/[0.01] hover:bg-white/[0.02] px-2 py-1 rounded border border-white/[0.02] transition-all" type="button">+ {o.label}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="text-[9px] text-white/20 hover:text-white/40 px-3 py-1.5 transition-colors" type="button">Cancelar</button>
          <button onClick={handleSave} disabled={!name.trim() || conditions.length === 0} className="text-[9px] text-cyan-400/60 hover:text-cyan-400/90 font-medium px-3 py-1.5 rounded-md border border-cyan-500/15 hover:border-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all" type="button">Salvar padrão</button>
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// SCANNER TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ScannerTab({ entries, openMatch, isAdvanced, statsMap, isFavoriteTeam }: { entries: ScannerEntry[]; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; statsMap: Map<number, FixtureStatsForPattern>; isFavoriteTeam: (name: string) => boolean }) {
  const [filter, setFilter] = useState<'all' | 'hitting' | 'critical' | 'favorites' | 'live' | 'soon' | 'rich'>('all')

  const filtered = useMemo(() => {
    switch (filter) {
      case 'hitting': return entries.filter(e => e.topPattern !== null)
      case 'critical': return entries.filter(e => e.priority === 'critical')
      case 'favorites': return entries.filter(e => isFavoriteTeam(e.fixture.homeTeam.name) || isFavoriteTeam(e.fixture.awayTeam.name))
      case 'live': return entries.filter(e => isLiveFx(e.fixture))
      case 'soon': return entries.filter(e => !isLiveFx(e.fixture))
      case 'rich': return entries.filter(e => statsMap.has(e.fixture.id))
      default: return entries
    }
  }, [entries, filter, isFavoriteTeam, statsMap])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {(['all', 'hitting', 'critical', 'favorites', 'live', 'soon', 'rich'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-md text-[9px] font-medium transition-all ${filter === f ? 'bg-white/[0.05] text-white/60 border border-white/[0.06]' : 'text-white/20 hover:text-white/35 border border-transparent'}`} type="button">
            {f === 'all' ? 'Todos' : f === 'hitting' ? 'Batendo' : f === 'critical' ? 'Críticos' : f === 'favorites' ? 'Favoritos' : f === 'live' ? 'Ao vivo' : f === 'soon' ? 'Em breve' : 'Dados ricos'}
            {f !== 'all' && <span className="ml-1 text-white/12 tabular-nums">{(f === 'hitting' ? entries.filter(e => e.topPattern !== null) : f === 'critical' ? entries.filter(e => e.priority === 'critical') : f === 'favorites' ? entries.filter(e => isFavoriteTeam(e.fixture.homeTeam.name) || isFavoriteTeam(e.fixture.awayTeam.name)) : f === 'live' ? entries.filter(e => isLiveFx(e.fixture)) : f === 'soon' ? entries.filter(e => !isLiveFx(e.fixture)) : entries.filter(e => statsMap.has(e.fixture.id))).length}</span>}
          </button>
        ))}
      </div>
      {filtered.length > 0 ? (
        <div className="space-y-1">
          {filtered.map(entry => {
            const fx = entry.fixture
            const stats = statsMap.get(fx.id)
            return (
              <div key={fx.id} onClick={() => openMatch(fx)} className="group flex items-center gap-2.5 rounded-lg border border-white/[0.025] bg-white/[0.003] px-3.5 py-2 cursor-pointer hover:border-white/[0.06] transition-all" role="button">
                <span className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${entry.priority === 'critical' ? 'bg-rose-500/8 text-rose-400/50' : entry.priority === 'attention' ? 'bg-amber-500/6 text-amber-400/40' : entry.priority === 'watch' ? 'bg-cyan-500/5 text-cyan-400/35' : 'bg-white/[0.015] text-white/12'}`}>{entry.priority === 'critical' ? 'CRÍT' : entry.priority === 'attention' ? 'ATEN' : entry.priority === 'watch' ? 'OBS' : '—'}</span>
                <span className={`text-[8px] font-medium tabular-nums w-7 shrink-0 ${isLiveFx(fx) ? 'text-emerald-400' : 'text-white/12'}`}>{isLiveFx(fx) ? `${fx.status.elapsed || ''}'` : ''}</span>
                <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={14} />
                <span className="text-[9px] text-white/45 truncate flex-1">{fx.homeTeam.name} {fx.score.home ?? '-'}:{fx.score.away ?? '-'} {fx.awayTeam.name}</span>
                <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={14} />
                {entry.topPattern && <span className="text-[7px] text-white/15 shrink-0 max-w-[70px] truncate">{entry.topPattern.patternName}</span>}
                {entry.confidence > 0 && <span className="text-[7px] text-white/10 tabular-nums shrink-0">{entry.confidence}%</span>}
                {isAdvanced && stats && <span className="text-[6px] text-white/6 font-mono shrink-0">{stats.shots ? `F${stats.shots.home + stats.shots.away}` : ''}</span>}
                <ChevronRight size={9} className="text-white/5 group-hover:text-white/15 shrink-0" />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-white/[0.02] border-dashed bg-white/[0.002] p-8 text-center">
          <p className="text-[9px] text-white/15">Nenhuma entrada para este filtro</p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function AlertsTab({ triggeredAlerts, isAdvanced, openMatch, fixtures, navigate }: { triggeredAlerts: TriggeredAlert[]; isAdvanced: boolean; openMatch: (fx: LiveFixture) => void; fixtures: LiveFixture[]; navigate: (path: string) => void }) {
  if (triggeredAlerts.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.02] border-dashed bg-white/[0.002] p-10 text-center">
        <Zap size={18} className="mx-auto text-white/8 mb-2" />
        <p className="text-[10px] text-white/18">Nenhum alerta disparado</p>
        <p className="text-[8px] text-white/10 mt-1">Quando padrões baterem em jogos ao vivo, os alertas aparecerão aqui</p>
        <button onClick={() => navigate('/app/alerts')} className="mt-3 text-[8px] text-cyan-400/35 hover:text-cyan-400/60 font-medium transition-colors" type="button">Gerenciar alertas →</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/20">Alertas disparados</h3>
        <button onClick={() => navigate('/app/alerts')} className="text-[8px] text-cyan-400/35 hover:text-cyan-400/60 font-medium transition-colors" type="button">Gerenciar →</button>
      </div>
      <div className="space-y-1.5">
        {triggeredAlerts.map(t => {
          const fx = fixtures.find(f => f.id === t.fixtureId)
          return (
            <div key={t.id} onClick={() => fx && openMatch(fx)} className={`rounded-lg border border-white/[0.03] bg-white/[0.004] px-3.5 py-2.5 ${fx ? 'cursor-pointer hover:border-white/[0.06]' : ''} transition-all`} role={fx ? 'button' : undefined}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-medium text-white/45">{t.patternName}</span>
                  <span className="text-[7px] text-white/12 tabular-nums">{t.confidence}%</span>
                </div>
                <span className={`text-[7px] px-1.5 py-0.5 rounded ${t.status === 'active' ? 'bg-amber-500/6 text-amber-400/40' : t.status === 'confirmed' ? 'bg-emerald-500/6 text-emerald-400/40' : 'bg-white/[0.02] text-white/12'}`}>{t.status === 'active' ? 'Ativo' : t.status === 'confirmed' ? 'Confirmado' : t.status === 'not_confirmed' ? 'Não confirmado' : 'Expirado'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[8px] text-white/20">
                <span>{t.homeTeam} x {t.awayTeam}</span>
                {t.minute && <span>· {t.minute}'</span>}
                <span>· {t.league}</span>
              </div>
              {isAdvanced && <div className="mt-1 text-[7px] text-white/8 font-mono">{t.reasons.slice(0, 3).join(' · ')} | {t.scoreAtTrigger.home}-{t.scoreAtTrigger.away}</div>}
              <span className="text-[6px] text-white/6 mt-0.5 block">{new Date(t.timestamp).toLocaleString('pt-BR')}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE TAB
// ═══════════════════════════════════════════════════════════════════════════════

function PerformanceTab({ patterns, triggeredAlerts, isAdvanced }: { patterns: Pattern[]; triggeredAlerts: TriggeredAlert[]; isAdvanced: boolean }) {
  const stats = useMemo(() => {
    return patterns.map(p => {
      const alerts = triggeredAlerts.filter(t => t.patternId === p.id)
      const confirmed = alerts.filter(t => t.status === 'confirmed').length
      const notConfirmed = alerts.filter(t => t.status === 'not_confirmed').length
      const total = alerts.length
      const hitRate = total > 0 ? Math.round((confirmed / total) * 100) : null
      const avgConf = total > 0 ? Math.round(alerts.reduce((s, a) => s + a.confidence, 0) / total) : null
      const lastHit = alerts[0]?.timestamp || null
      return { pattern: p, total, confirmed, notConfirmed, hitRate, avgConf, lastHit }
    })
  }, [patterns, triggeredAlerts])

  const totalDisparos = triggeredAlerts.length
  const totalConfirmed = triggeredAlerts.filter(t => t.status === 'confirmed').length

  if (patterns.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.02] border-dashed bg-white/[0.002] p-10 text-center">
        <BarChart3 size={18} className="mx-auto text-white/8 mb-2" />
        <p className="text-[10px] text-white/18">Sem dados de performance</p>
        <p className="text-[8px] text-white/10 mt-1">Ative padrões para começar a medir resultados</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex gap-3">
        <div className="rounded-lg border border-white/[0.03] bg-white/[0.005] px-4 py-3 flex-1 text-center">
          <span className="text-[16px] font-bold text-white/50 block tabular-nums">{patterns.length}</span>
          <span className="text-[7px] text-white/15 uppercase tracking-wider">Padrões</span>
        </div>
        <div className="rounded-lg border border-white/[0.03] bg-white/[0.005] px-4 py-3 flex-1 text-center">
          <span className="text-[16px] font-bold text-amber-400/60 block tabular-nums">{totalDisparos}</span>
          <span className="text-[7px] text-white/15 uppercase tracking-wider">Disparos</span>
        </div>
        <div className="rounded-lg border border-white/[0.03] bg-white/[0.005] px-4 py-3 flex-1 text-center">
          <span className="text-[16px] font-bold text-emerald-400/60 block tabular-nums">{totalConfirmed}</span>
          <span className="text-[7px] text-white/15 uppercase tracking-wider">Confirmados</span>
        </div>
      </div>

      {/* Per pattern */}
      <div className="space-y-1.5">
        {stats.map(s => (
          <div key={s.pattern.id} className="rounded-lg border border-white/[0.03] bg-white/[0.004] px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-white/45">{s.pattern.name}</span>
              <span className={`text-[7px] px-1.5 py-0.5 rounded ${s.pattern.status === 'active' ? 'bg-emerald-500/6 text-emerald-400/35' : 'bg-white/[0.015] text-white/10'}`}>{s.pattern.status}</span>
            </div>
            <div className="flex items-center gap-4 text-[8px] text-white/20">
              <span>{s.total} disparos</span>
              {s.hitRate !== null ? <span>Taxa: {s.hitRate}%</span> : <span className="text-white/10">Sem dados suficientes</span>}
              {s.avgConf !== null && <span>Conf. média: {s.avgConf}%</span>}
              {s.lastHit && <span>Último: {new Date(s.lastHit).toLocaleDateString('pt-BR')}</span>}
            </div>
            {isAdvanced && (
              <div className="mt-1 text-[7px] text-white/8 font-mono">
                confirmed:{s.confirmed} · not_confirmed:{s.notConfirmed} · pending:{s.total - s.confirmed - s.notConfirmed}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
