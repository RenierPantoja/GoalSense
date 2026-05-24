/**
 * Command Center — Motor de Decisão e Padrões GoalSense.
 * Premium experience: pattern detection, smart scanner, triggered alerts.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, ChevronRight, AlertCircle, Plus, Activity, Target, Eye, History } from 'lucide-react'
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
import { isLiveFx, detectChanges, type ChangeEvent } from './commandHelpers'
import type { Pattern, PatternTemplate, PatternHit, FixtureStatsForPattern, ScannerEntry, TriggeredAlert } from './types/commandTypes'

function toScoring(fx: LiveFixture) {
  return { competition: { name: fx.league.name }, homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name }, awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name }, score: { fullTime: { home: fx.score.home, away: fx.score.away } }, status: fx.status.short === 'LIVE' || fx.status.short === 'HT' ? 'IN_PLAY' : fx.status.short === 'FT' ? 'FINISHED' : 'TIMED', utcDate: fx.date, area: { name: fx.league.country } }
}

type Tab = 'overview' | 'patterns' | 'scanner' | 'history'

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
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const prevFixturesRef = useRef<LiveFixture[] | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { enabledCount } = useAlerts()
  const { isAdvanced } = useViewMode()
  const { patterns, templates, createFromTemplate, togglePattern, deletePattern, getActivePatterns, triggeredAlerts, triggerAlert, getRecentTriggered, activePatternCount, triggeredTodayCount } = usePatterns()

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

  // Fetch stats for live fixtures (ESPN summary)
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
        return {
          id: fx.id,
          stats: {
            possession: { home: get(homeS, 'possessionPct') || get(homeS, 'POSSESSION'), away: get(awayS, 'possessionPct') || get(awayS, 'POSSESSION') },
            shots: { home: get(homeS, 'totalShots') || get(homeS, 'SHOTS'), away: get(awayS, 'totalShots') || get(awayS, 'SHOTS') },
            shotsOnTarget: { home: get(homeS, 'shotsOnTarget') || get(homeS, 'ON GOAL'), away: get(awayS, 'shotsOnTarget') || get(awayS, 'ON GOAL') },
            corners: { home: get(homeS, 'wonCorners') || get(homeS, 'Corner Kicks'), away: get(awayS, 'wonCorners') || get(awayS, 'Corner Kicks') },
            yellowCards: { home: get(homeS, 'yellowCards') || get(homeS, 'Yellow Cards'), away: get(awayS, 'yellowCards') || get(awayS, 'Yellow Cards') },
          } as FixtureStatsForPattern,
        }
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

  // Trigger alerts for new pattern hits
  useEffect(() => {
    for (const hit of patternHits) {
      if (hit.confidence >= 60) {
        triggerAlert({
          patternId: hit.patternId,
          patternName: hit.patternName,
          fixtureId: hit.fixtureId,
          homeTeam: hit.fixture.homeTeam.name,
          awayTeam: hit.fixture.awayTeam.name,
          league: hit.fixture.league.name,
          minute: hit.fixture.status.elapsed,
          confidence: hit.confidence,
          reasons: hit.reasons,
          timestamp: new Date().toISOString(),
          status: 'active',
          scoreAtTrigger: { home: hit.fixture.score.home ?? 0, away: hit.fixture.score.away ?? 0 },
        })
      }
    }
  }, [patternHits, triggerAlert])

  // ─── Scanner Entries ───────────────────────────────────────────────────────

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

  // ─── Decision Now ──────────────────────────────────────────────────────────

  const decisionMatch = useMemo(() => {
    // Priority: pattern hit with highest confidence, then operational decision
    if (patternHits.length > 0) return patternHits[0].fixture
    if (liveMatches.length > 0) {
      const sorted = [...liveMatches].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a)))
      return sorted[0]
    }
    return null
  }, [patternHits, liveMatches])

  const decisionHit = patternHits.length > 0 ? patternHits[0] : null

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

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="max-w-[1200px] mx-auto flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border border-white/[0.06]" />
          <div className="absolute inset-0 rounded-full border border-transparent border-t-cyan-400/60 animate-spin" />
        </div>
        <span className="text-[10px] text-white/15 tracking-wider uppercase">Inicializando motor de decisão</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 animate-fadeIn">

      {/* ═══ HEADER ═══ */}
      <header className="relative">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-white tracking-tight">Command Center</h1>
            <p className="text-[11px] text-white/25 mt-0.5">
              Motor de decisão em tempo real
              {timeSince !== null && <span className="text-white/15"> · {timeSince < 60 ? `${timeSince}s` : `${Math.floor(timeSince / 60)}min`}</span>}
              {refreshing && <span className="text-cyan-400/40 ml-1.5 animate-pulse">●</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleAuto} className={`h-7 px-2.5 rounded-lg text-[9px] font-medium uppercase tracking-wider transition-all ${autoRefresh ? 'bg-emerald-500/8 text-emerald-400/60 border border-emerald-500/10' : 'text-white/15 border border-white/[0.04]'}`} type="button">Auto</button>
            <button onClick={() => fetchData()} disabled={refreshing} className="h-7 w-7 rounded-lg flex items-center justify-center text-white/20 border border-white/[0.05] hover:text-white/50 transition-all disabled:opacity-20" type="button" aria-label="Atualizar"><RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /></button>
          </div>
        </div>

        {/* Metrics strip */}
        <div className="flex gap-px mt-4 rounded-xl overflow-hidden border border-white/[0.04] bg-white/[0.01]">
          {metrics.map(m => (
            <div key={m.label} className="flex-1 px-3 py-2.5 text-center">
              <span className={`text-[18px] font-bold tabular-nums block leading-none ${m.value > 0 ? (m.color === 'emerald' ? 'text-emerald-400' : m.color === 'cyan' ? 'text-cyan-400' : m.color === 'amber' ? 'text-amber-400' : m.color === 'rose' ? 'text-rose-400' : 'text-white/60') : 'text-white/12'}`}>{m.value}</span>
              <span className="text-[8px] text-white/20 uppercase tracking-[0.1em] mt-1 block">{m.label}</span>
            </div>
          ))}
        </div>
      </header>

      {error && <div className="rounded-lg border border-rose-500/8 bg-rose-500/[0.02] px-3 py-2 text-[10px] text-rose-400/50 flex items-center gap-2"><AlertCircle size={11} />{error}</div>}

      {/* ═══ TABS ═══ */}
      <nav className="flex gap-1 border-b border-white/[0.04] pb-px">
        {([
          { id: 'overview' as Tab, label: 'Visão geral', icon: Activity },
          { id: 'patterns' as Tab, label: 'Padrões', icon: Target },
          { id: 'scanner' as Tab, label: 'Scanner', icon: Eye },
          { id: 'history' as Tab, label: 'Histórico', icon: History },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-[11px] font-medium transition-all ${activeTab === tab.id ? 'text-white/80 bg-white/[0.03] border-b-2 border-cyan-400/40' : 'text-white/25 hover:text-white/45'}`} type="button">
            <tab.icon size={12} />{tab.label}
            {tab.id === 'patterns' && activePatternCount > 0 && <span className="text-[8px] bg-cyan-500/10 text-cyan-400/60 px-1.5 rounded-full">{activePatternCount}</span>}
            {tab.id === 'scanner' && patternHits.length > 0 && <span className="text-[8px] bg-amber-500/10 text-amber-400/60 px-1.5 rounded-full">{patternHits.length}</span>}
          </button>
        ))}
      </nav>

      {/* ═══ TAB CONTENT ═══ */}
      {activeTab === 'overview' && (
        <OverviewTab
          decisionMatch={decisionMatch}
          decisionHit={decisionHit}
          patternHits={patternHits}
          scannerEntries={scannerEntries}
          changes={changes}
          liveMatches={liveMatches}
          fixtures={fixtures}
          openMatch={openMatch}
          isFavoriteTeam={isFavoriteTeam}
          isAdvanced={isAdvanced}
          activePatternCount={activePatternCount}
          enabledCount={enabledCount}
          triggeredAlerts={getRecentTriggered(5)}
          onGoToPatterns={() => setActiveTab('patterns')}
          navigate={navigate}
        />
      )}

      {activeTab === 'patterns' && (
        <PatternsTab
          patterns={patterns}
          templates={templates}
          createFromTemplate={createFromTemplate}
          togglePattern={togglePattern}
          deletePattern={deletePattern}
          isAdvanced={isAdvanced}
        />
      )}

      {activeTab === 'scanner' && (
        <ScannerTab
          entries={scannerEntries}
          openMatch={openMatch}
          isAdvanced={isAdvanced}
          statsMap={statsMap}
        />
      )}

      {activeTab === 'history' && (
        <HistoryTab
          triggeredAlerts={getRecentTriggered(20)}
          isAdvanced={isAdvanced}
        />
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface OverviewTabProps {
  decisionMatch: LiveFixture | null
  decisionHit: PatternHit | null
  patternHits: PatternHit[]
  scannerEntries: ScannerEntry[]
  changes: ChangeEvent[]
  liveMatches: LiveFixture[]
  fixtures: LiveFixture[]
  openMatch: (fx: LiveFixture) => void
  isFavoriteTeam: (name: string) => boolean
  isAdvanced: boolean
  activePatternCount: number
  enabledCount: number
  triggeredAlerts: TriggeredAlert[]
  onGoToPatterns: () => void
  navigate: (path: string) => void
}

function OverviewTab({ decisionMatch, decisionHit, patternHits, scannerEntries, changes, liveMatches, fixtures, openMatch, isFavoriteTeam, isAdvanced, activePatternCount, enabledCount, triggeredAlerts, onGoToPatterns, navigate }: OverviewTabProps) {
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorites()

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-6">

        {/* ═══ DECISÃO AGORA ═══ */}
        {decisionMatch ? (
          <section className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-[0_0_40px_-15px_rgba(34,211,238,0.04)]" onClick={() => openMatch(decisionMatch)} role="button">
            <div className="absolute inset-0 bg-gradient-to-br from-[#080c14] via-[#0a0e18] to-[#0c1020]" />
            <div className="absolute inset-0 border border-white/[0.05] rounded-2xl group-hover:border-white/[0.09] transition-colors" />
            <div className="absolute top-0 left-1/4 w-[200px] h-[60px] bg-cyan-500/[0.015] rounded-full blur-[40px]" />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {decisionHit && <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.4)] animate-pulse" />}
                  <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/30">
                    {decisionHit ? 'Padrão detectado' : 'Decisão agora'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <FavoriteButton
                    active={isFavoriteMatch(buildCanonicalMatchId(decisionMatch.homeTeam.name, decisionMatch.awayTeam.name, decisionMatch.date))}
                    onClick={(e) => { e.stopPropagation(); toggleFavoriteMatch({ canonicalMatchId: buildCanonicalMatchId(decisionMatch.homeTeam.name, decisionMatch.awayTeam.name, decisionMatch.date), homeTeam: decisionMatch.homeTeam.name, awayTeam: decisionMatch.awayTeam.name, competition: decisionMatch.league.name, utcDate: decisionMatch.date }) }}
                    size={12}
                  />
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${isLiveFx(decisionMatch) ? 'bg-emerald-500/8 text-emerald-400 border border-emerald-500/10' : 'text-white/20'}`}>
                    {isLiveFx(decisionMatch) ? `${decisionMatch.status.elapsed || ''}'` : new Date(decisionMatch.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col items-center gap-2 w-[100px]">
                  <ClubLogo src={decisionMatch.homeTeam.logo} name={decisionMatch.homeTeam.name} size={48} />
                  <span className="text-[10px] font-medium text-white/60 text-center leading-tight">{decisionMatch.homeTeam.name}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[36px] font-bold tabular-nums text-white leading-none">{decisionMatch.score.home ?? '-'}</span>
                    <span className="text-[12px] text-white/10">:</span>
                    <span className="text-[36px] font-bold tabular-nums text-white leading-none">{decisionMatch.score.away ?? '-'}</span>
                  </div>
                  {isLiveFx(decisionMatch) && <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)] animate-pulse" />}
                </div>
                <div className="flex flex-col items-center gap-2 w-[100px]">
                  <ClubLogo src={decisionMatch.awayTeam.logo} name={decisionMatch.awayTeam.name} size={48} />
                  <span className="text-[10px] font-medium text-white/40 text-center leading-tight">{decisionMatch.awayTeam.name}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.03]">
                {decisionHit ? (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${decisionHit.severity === 'critical' ? 'bg-rose-500/10 text-rose-400/70' : decisionHit.severity === 'attention' ? 'bg-amber-500/8 text-amber-400/60' : 'bg-white/[0.03] text-white/25'}`}>{decisionHit.patternName}</span>
                        <span className="text-[8px] text-white/15">{decisionHit.confidence}%</span>
                      </div>
                      <p className="text-[10px] text-white/35 leading-relaxed">{decisionHit.reasons.slice(0, 3).join(' · ')}</p>
                    </div>
                    <span className="text-[9px] text-cyan-400/50 group-hover:text-cyan-400/80 font-medium shrink-0 flex items-center gap-1 transition-colors">Abrir <ChevronRight size={10} /></span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/20">{decisionMatch.league.name}</span>
                    <span className="text-[9px] text-cyan-400/40 group-hover:text-cyan-400/70 font-medium flex items-center gap-1 transition-colors">Abrir análise <ChevronRight size={10} /></span>
                  </div>
                )}
                {isAdvanced && decisionHit && (
                  <div className="mt-2 flex items-center gap-3 text-[8px] text-white/10 font-mono">
                    <span>conf:{decisionHit.confidence}</span>
                    <span>cond:{decisionHit.matchedConditions}/{decisionHit.totalConditions}</span>
                    <span>imp:{getMatchImportanceScore(toScoring(decisionMatch))}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/[0.04] bg-white/[0.008] p-6 text-center">
            <p className="text-[11px] text-white/25">Nenhuma decisão crítica agora</p>
            <p className="text-[9px] text-white/12 mt-1">O GoalSense está monitorando {fixtures.length} partidas</p>
          </section>
        )}

        {/* ═══ PADRÕES BATENDO ═══ */}
        {patternHits.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400/40 flex items-center gap-1.5"><Zap size={10} className="text-amber-400/40" />Padrões batendo agora</h3>
              <span className="text-[8px] text-white/15 tabular-nums">{patternHits.length} {patternHits.length === 1 ? 'hit' : 'hits'}</span>
            </div>
            <div className="space-y-1.5">
              {patternHits.slice(0, 5).map((hit, i) => (
                <div key={`${hit.patternId}-${hit.fixtureId}-${i}`} onClick={() => openMatch(hit.fixture)} className="group flex items-center gap-3 rounded-xl border border-white/[0.03] bg-white/[0.006] px-3.5 py-2.5 cursor-pointer hover:border-white/[0.07] hover:bg-white/[0.012] transition-all" role="button">
                  <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${hit.severity === 'critical' ? 'bg-rose-500/10 text-rose-400/60' : hit.severity === 'attention' ? 'bg-amber-500/8 text-amber-400/50' : 'bg-white/[0.03] text-white/20'}`}>{hit.severity === 'critical' ? 'CRÍTICO' : hit.severity === 'attention' ? 'ATENÇÃO' : 'INFO'}</span>
                  <ClubLogo src={hit.fixture.homeTeam.logo} name={hit.fixture.homeTeam.name} size={16} />
                  <span className="text-[10px] text-white/50 truncate flex-1">{hit.fixture.homeTeam.name} {hit.fixture.score.home ?? '-'}:{hit.fixture.score.away ?? '-'} {hit.fixture.awayTeam.name}</span>
                  <span className="text-[8px] text-white/20 shrink-0">{hit.patternName}</span>
                  <span className="text-[8px] text-white/12 tabular-nums shrink-0">{hit.confidence}%</span>
                  <ChevronRight size={10} className="text-white/8 group-hover:text-white/25 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ SCANNER RESUMO ═══ */}
        {scannerEntries.length > 0 && patternHits.length === 0 && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/20 mb-3">Monitoramento ativo</h3>
            <div className="space-y-1">
              {scannerEntries.slice(0, 4).map(entry => (
                <div key={entry.fixture.id} onClick={() => openMatch(entry.fixture)} className="group flex items-center gap-3 rounded-xl border border-white/[0.03] bg-white/[0.005] px-3.5 py-2 cursor-pointer hover:border-white/[0.06] transition-all" role="button">
                  <span className={`text-[9px] font-medium tabular-nums w-8 shrink-0 ${isLiveFx(entry.fixture) ? 'text-emerald-400' : 'text-white/15'}`}>{isLiveFx(entry.fixture) ? `${entry.fixture.status.elapsed || ''}'` : ''}</span>
                  <ClubLogo src={entry.fixture.homeTeam.logo} name={entry.fixture.homeTeam.name} size={14} />
                  <span className="text-[10px] text-white/45 truncate flex-1">{entry.fixture.homeTeam.name} vs {entry.fixture.awayTeam.name}</span>
                  <span className="text-[8px] text-white/12">{entry.fixture.league.name}</span>
                  <ChevronRight size={9} className="text-white/8 group-hover:text-white/20 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state — no patterns configured */}
        {activePatternCount === 0 && patternHits.length === 0 && (
          <section className="rounded-2xl border border-dashed border-white/[0.05] bg-white/[0.005] p-6 text-center">
            <Target size={20} className="mx-auto text-white/10 mb-2" />
            <p className="text-[11px] text-white/25">Nenhum padrão ativo</p>
            <p className="text-[9px] text-white/12 mt-1 max-w-[280px] mx-auto">Crie padrões para detectar oportunidades automaticamente nos jogos ao vivo</p>
            <button onClick={onGoToPatterns} className="mt-3 text-[9px] text-cyan-400/50 hover:text-cyan-400/80 font-medium transition-colors" type="button">Configurar padrões →</button>
          </section>
        )}
      </div>

      {/* RIGHT SIDEBAR */}
      <aside className="space-y-4">
        {/* Changes */}
        {changes.length > 0 && (
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-3.5">
            <h4 className="text-[8px] font-semibold uppercase tracking-[0.15em] text-amber-400/30 mb-2">Mudanças</h4>
            <div className="space-y-1.5">
              {changes.slice(0, 5).map(c => (
                <div key={c.id} className={`rounded-md px-2.5 py-1.5 border-l-2 ${c.type === 'score_change' ? 'border-l-emerald-400/40 bg-emerald-500/[0.015]' : c.type === 'final_phase' ? 'border-l-amber-400/30 bg-amber-500/[0.015]' : 'border-l-white/[0.08] bg-white/[0.005]'}`}>
                  <span className="text-[8px] text-white/30 leading-relaxed">{c.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent triggered */}
        {triggeredAlerts.length > 0 && (
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-3.5">
            <h4 className="text-[8px] font-semibold uppercase tracking-[0.15em] text-rose-400/30 mb-2">Alertas disparados</h4>
            <div className="space-y-1.5">
              {triggeredAlerts.slice(0, 4).map(t => (
                <div key={t.id} className="rounded-md px-2.5 py-1.5 bg-white/[0.005] border border-white/[0.02]">
                  <span className="text-[8px] text-white/35 block">{t.patternName}</span>
                  <span className="text-[7px] text-white/15">{t.homeTeam} x {t.awayTeam} · {t.minute ? `${t.minute}'` : ''} · {t.confidence}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-3.5">
          <h4 className="text-[8px] font-semibold uppercase tracking-[0.15em] text-white/15 mb-2">Ações</h4>
          <div className="space-y-0.5">
            {liveMatches.length > 0 && <ActionBtn label="Ver jogos ao vivo" onClick={() => navigate('/app/live')} />}
            <ActionBtn label="Configurar padrões" onClick={onGoToPatterns} />
            {enabledCount === 0 && <ActionBtn label="Criar alertas" onClick={() => navigate('/app/alerts')} />}
            <ActionBtn label="Explorar partidas" onClick={() => navigate('/app/matches')} />
          </div>
        </div>
      </aside>
    </div>
  )
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-white/[0.015] transition-colors group" type="button">
      <span className="text-[9px] text-white/25 group-hover:text-white/45">{label}</span>
      <ChevronRight size={9} className="text-white/8 group-hover:text-white/20" />
    </button>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// PATTERNS TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface PatternsTabProps {
  patterns: Pattern[]
  templates: PatternTemplate[]
  createFromTemplate: (id: string) => Pattern | null
  togglePattern: (id: string) => void
  deletePattern: (id: string) => void
  isAdvanced: boolean
}

function PatternsTab({ patterns, templates, createFromTemplate, togglePattern, deletePattern, isAdvanced }: PatternsTabProps) {
  return (
    <div className="space-y-6">
      {/* Active patterns */}
      {patterns.length > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mb-3">Padrões ativos</h3>
          <div className="space-y-1.5">
            {patterns.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.008] px-4 py-3">
                <div className={`h-2 w-2 rounded-full shrink-0 ${p.status === 'active' ? 'bg-emerald-400/60' : 'bg-white/10'}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-white/60 block">{p.name}</span>
                  <span className="text-[9px] text-white/20 block mt-0.5">{p.description}</span>
                  {isAdvanced && (
                    <span className="text-[8px] text-white/10 font-mono mt-1 block">{p.conditions.length} condições · {p.severity} · {p.status}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => togglePattern(p.id)} className={`text-[8px] px-2 py-1 rounded-md border transition-all ${p.status === 'active' ? 'border-emerald-500/15 text-emerald-400/50 hover:text-emerald-400/80' : 'border-white/[0.04] text-white/20 hover:text-white/40'}`} type="button">{p.status === 'active' ? 'Ativo' : 'Pausado'}</button>
                  <button onClick={() => deletePattern(p.id)} className="text-[8px] px-2 py-1 rounded-md border border-white/[0.03] text-white/15 hover:text-rose-400/50 hover:border-rose-500/15 transition-all" type="button">×</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Templates */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">Templates disponíveis</h3>
          <span className="text-[8px] text-white/12">{templates.length} templates</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {templates.map(t => {
            const alreadyActive = patterns.some(p => p.templateId === t.id && p.status === 'active')
            return (
              <div key={t.id} className="rounded-xl border border-white/[0.04] bg-white/[0.006] p-4 hover:border-white/[0.07] transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-[11px] font-medium text-white/55 block">{t.name}</span>
                    <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1 inline-block ${t.severity === 'critical' ? 'bg-rose-500/8 text-rose-400/50' : t.severity === 'attention' ? 'bg-amber-500/6 text-amber-400/40' : 'bg-white/[0.02] text-white/15'}`}>{t.severity}</span>
                  </div>
                  {alreadyActive ? (
                    <span className="text-[8px] text-emerald-400/40">Ativo</span>
                  ) : (
                    <button onClick={() => createFromTemplate(t.id)} className="text-[9px] text-cyan-400/50 hover:text-cyan-400/80 font-medium flex items-center gap-1 transition-colors" type="button"><Plus size={10} />Ativar</button>
                  )}
                </div>
                <p className="text-[9px] text-white/20 leading-relaxed">{t.description}</p>
                {isAdvanced && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.conditions.map((c, i) => (
                      <span key={i} className="text-[7px] text-white/10 bg-white/[0.02] px-1.5 py-0.5 rounded">{c.type}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCANNER TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface ScannerTabProps {
  entries: ScannerEntry[]
  openMatch: (fx: LiveFixture) => void
  isAdvanced: boolean
  statsMap: Map<number, FixtureStatsForPattern>
}

function ScannerTab({ entries, openMatch, isAdvanced, statsMap }: ScannerTabProps) {
  const [filter, setFilter] = useState<'all' | 'critical' | 'attention' | 'live' | 'soon'>('all')

  const filtered = useMemo(() => {
    switch (filter) {
      case 'critical': return entries.filter(e => e.priority === 'critical')
      case 'attention': return entries.filter(e => e.priority === 'attention')
      case 'live': return entries.filter(e => isLiveFx(e.fixture))
      case 'soon': return entries.filter(e => !isLiveFx(e.fixture))
      default: return entries
    }
  }, [entries, filter])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-1.5">
        {(['all', 'critical', 'attention', 'live', 'soon'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${filter === f ? 'bg-white/[0.06] text-white/70 border border-white/[0.08]' : 'text-white/25 hover:text-white/40 border border-transparent'}`} type="button">
            {f === 'all' ? 'Todos' : f === 'critical' ? 'Críticos' : f === 'attention' ? 'Atenção' : f === 'live' ? 'Ao vivo' : 'Em breve'}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="space-y-1">
          {filtered.map(entry => {
            const fx = entry.fixture
            const stats = statsMap.get(fx.id)
            return (
              <div key={fx.id} onClick={() => openMatch(fx)} className="group flex items-center gap-3 rounded-xl border border-white/[0.03] bg-white/[0.005] px-4 py-2.5 cursor-pointer hover:border-white/[0.07] hover:bg-white/[0.01] transition-all" role="button">
                <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${entry.priority === 'critical' ? 'bg-rose-500/10 text-rose-400/60' : entry.priority === 'attention' ? 'bg-amber-500/8 text-amber-400/50' : entry.priority === 'watch' ? 'bg-cyan-500/6 text-cyan-400/40' : 'bg-white/[0.02] text-white/15'}`}>
                  {entry.priority === 'critical' ? 'CRÍTICO' : entry.priority === 'attention' ? 'ATENÇÃO' : entry.priority === 'watch' ? 'OBSERVAR' : 'BAIXO'}
                </span>
                <span className={`text-[9px] font-medium tabular-nums w-8 shrink-0 ${isLiveFx(fx) ? 'text-emerald-400' : 'text-white/15'}`}>{isLiveFx(fx) ? `${fx.status.elapsed || ''}'` : ''}</span>
                <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={16} />
                <span className="text-[10px] text-white/50 truncate flex-1">{fx.homeTeam.name} {fx.score.home ?? '-'}:{fx.score.away ?? '-'} {fx.awayTeam.name}</span>
                <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={16} />
                {entry.topPattern && <span className="text-[8px] text-white/20 shrink-0 max-w-[80px] truncate">{entry.topPattern.patternName}</span>}
                {entry.confidence > 0 && <span className="text-[8px] text-white/12 tabular-nums shrink-0">{entry.confidence}%</span>}
                {isAdvanced && stats && (
                  <span className="text-[7px] text-white/8 font-mono shrink-0">
                    {stats.shots ? `F${stats.shots.home + stats.shots.away}` : ''}{stats.corners ? ` E${stats.corners.home + stats.corners.away}` : ''}
                  </span>
                )}
                <ChevronRight size={10} className="text-white/8 group-hover:text-white/20 shrink-0" />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.03] border-dashed bg-white/[0.003] p-8 text-center">
          <p className="text-[10px] text-white/20">Nenhuma entrada no scanner</p>
          <p className="text-[8px] text-white/10 mt-1">Jogos ao vivo e em breve aparecerão aqui</p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface HistoryTabProps {
  triggeredAlerts: TriggeredAlert[]
  isAdvanced: boolean
}

function HistoryTab({ triggeredAlerts, isAdvanced }: HistoryTabProps) {
  if (triggeredAlerts.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.03] border-dashed bg-white/[0.003] p-10 text-center">
        <History size={20} className="mx-auto text-white/10 mb-2" />
        <p className="text-[11px] text-white/20">Nenhum alerta disparado ainda</p>
        <p className="text-[9px] text-white/10 mt-1">Quando padrões baterem em jogos ao vivo, os alertas aparecerão aqui</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">Alertas disparados recentes</h3>
      <div className="space-y-1.5">
        {triggeredAlerts.map(t => (
          <div key={t.id} className="rounded-xl border border-white/[0.04] bg-white/[0.006] px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-white/50">{t.patternName}</span>
              <span className={`text-[8px] px-1.5 py-0.5 rounded ${t.status === 'active' ? 'bg-amber-500/8 text-amber-400/50' : t.status === 'confirmed' ? 'bg-emerald-500/8 text-emerald-400/50' : t.status === 'not_confirmed' ? 'bg-white/[0.03] text-white/20' : 'bg-white/[0.02] text-white/12'}`}>{t.status === 'active' ? 'Ativo' : t.status === 'confirmed' ? 'Confirmado' : t.status === 'not_confirmed' ? 'Não confirmado' : 'Expirado'}</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-white/25">
              <span>{t.homeTeam} x {t.awayTeam}</span>
              <span>·</span>
              <span>{t.minute ? `${t.minute}'` : ''}</span>
              <span>·</span>
              <span>{t.confidence}%</span>
              <span>·</span>
              <span>{t.league}</span>
            </div>
            {isAdvanced && (
              <div className="mt-1.5 text-[7px] text-white/10 font-mono">
                {t.reasons.join(' · ')} | score: {t.scoreAtTrigger.home}-{t.scoreAtTrigger.away}
                {t.scoreAtResolution && ` → ${t.scoreAtResolution.home}-${t.scoreAtResolution.away}`}
              </div>
            )}
            <span className="text-[7px] text-white/8 mt-1 block">{new Date(t.timestamp).toLocaleString('pt-BR')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
