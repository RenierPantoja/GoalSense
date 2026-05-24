/**
 * Command Center V3.1 — Cockpit de Decisão, Padrões e Automação.
 * Only shows matches with real signals. No generic game lists.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, ChevronRight, AlertCircle, Plus, Activity, Target, Eye, BarChart3, Sparkles, X, Settings2 } from 'lucide-react'
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
import { resolveTriggeredAlert as resolveTriggeredAlertFn } from './intelligence/patternResolutionEngine'
import { isLiveFx, detectChanges, type ChangeEvent } from './commandHelpers'
import type { Pattern, PatternTemplate, PatternHit, PatternCondition, PatternConditionType, FixtureStatsForPattern, ScannerEntry, TriggeredAlert, AutoDiscoveryConfig } from './types/commandTypes'

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
  const [autoRefresh, setAutoRefresh] = useState(() => { try { return localStorage.getItem('goalsense_cmd_auto') !== 'false' } catch { return true } })
  const [changes, setChanges] = useState<ChangeEvent[]>([])
  const [statsMap, setStatsMap] = useState<Map<number, FixtureStatsForPattern>>(new Map())
  const [activeTab, setActiveTab] = useState<Tab>('cockpit')
  const [showBuilder, setShowBuilder] = useState(false)
  const prevRef = useRef<LiveFixture[] | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { enabledCount, registerCommandAlert, updateCommandAlertStatus, commandAlerts } = useAlerts()
  const { isAdvanced } = useViewMode()
  const { patterns, templates, createPattern, createFromTemplate, updatePattern, togglePattern, deletePattern, getActivePatterns, triggeredAlerts, triggerAlert, getRecentTriggered, resolveExpired, discoveryConfig, updateDiscoveryConfig, activePatternCount, triggeredTodayCount } = usePatterns()

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try {
      const r = await getLiveFixtures()
      const fx = r.fixtures || []
      const det = detectChanges(fx, prevRef.current)
      if (det.length > 0) setChanges(prev => [...det, ...prev].slice(0, 12))
      prevRef.current = fx
      setFixtures(fx); setLastUpdate(new Date()); setError(null)
    } catch (e) { if (!silent) setError((e as Error).message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  const fetchStats = useCallback(async (fxList: LiveFixture[]) => {
    const live = fxList.filter(fx => isLiveFx(fx) && fx.provider === 'espn').slice(0, 15)
    if (live.length === 0) return
    const results = await Promise.allSettled(live.map(async (fx) => {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${fx.id}`)
      if (!res.ok) return null
      const json = await res.json()
      const hS = json.boxscore?.teams?.[0]?.statistics || []
      const aS = json.boxscore?.teams?.[1]?.statistics || []
      const g = (arr: any[], n: string) => { const s = arr.find((x: any) => x.name === n || x.label === n); return s ? parseFloat(s.displayValue) || 0 : 0 }
      return { id: fx.id, stats: { possession: { home: g(hS, 'possessionPct') || g(hS, 'POSSESSION'), away: g(aS, 'possessionPct') || g(aS, 'POSSESSION') }, shots: { home: g(hS, 'totalShots') || g(hS, 'SHOTS'), away: g(aS, 'totalShots') || g(aS, 'SHOTS') }, shotsOnTarget: { home: g(hS, 'shotsOnTarget') || g(hS, 'ON GOAL'), away: g(aS, 'shotsOnTarget') || g(aS, 'ON GOAL') }, corners: { home: g(hS, 'wonCorners') || g(hS, 'Corner Kicks'), away: g(aS, 'wonCorners') || g(aS, 'Corner Kicks') }, yellowCards: { home: g(hS, 'yellowCards') || g(hS, 'Yellow Cards'), away: g(aS, 'yellowCards') || g(aS, 'Yellow Cards') } } as FixtureStatsForPattern }
    }))
    const m = new Map<number, FixtureStatsForPattern>()
    for (const r of results) { if (r.status === 'fulfilled' && r.value) m.set(r.value.id, r.value.stats) }
    setStatsMap(m)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (fixtures.length > 0) fetchStats(fixtures) }, [fixtures, fetchStats])
  const liveMatches = useMemo(() => fixtures.filter(isLiveFx), [fixtures])

  useEffect(() => {
    if (!autoRefresh) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => { fetchData(true); resolveExpired() }, liveMatches.length > 0 ? 25000 : 60000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchData, liveMatches.length, resolveExpired])

  const toggleAuto = () => { const n = !autoRefresh; setAutoRefresh(n); try { localStorage.setItem('goalsense_cmd_auto', String(n)) } catch {} }

  // ─── Pattern Evaluation ────────────────────────────────────────────────────
  const patternHits = useMemo(() => {
    const active = getActivePatterns()
    if (active.length === 0 || fixtures.length === 0) return []
    return evaluateAllPatterns(active, fixtures, statsMap, isFavoriteTeam)
  }, [patterns, fixtures, statsMap, isFavoriteTeam, getActivePatterns])

  useEffect(() => {
    for (const hit of patternHits) {
      if (hit.confidence >= 50) {
        const pat = patterns.find(p => p.id === hit.patternId)
        if (pat && pat.action !== 'suggest_only') {
          triggerAlert({ patternId: hit.patternId, patternName: hit.patternName, fixtureId: hit.fixtureId, homeTeam: hit.fixture.homeTeam.name, awayTeam: hit.fixture.awayTeam.name, league: hit.fixture.league.name, minute: hit.fixture.status.elapsed, confidence: hit.confidence, reasons: hit.reasons, timestamp: new Date().toISOString(), status: 'pending', scoreAtTrigger: { home: hit.fixture.score.home ?? 0, away: hit.fixture.score.away ?? 0 } })
          // Bridge: also register in /app/alerts via AlertsContext
          registerCommandAlert({ source: 'command_center', patternId: hit.patternId, patternName: hit.patternName, fixtureId: hit.fixtureId, homeTeam: hit.fixture.homeTeam.name, awayTeam: hit.fixture.awayTeam.name, competition: hit.fixture.league.name, minuteAtTrigger: hit.fixture.status.elapsed, scoreAtTrigger: { home: hit.fixture.score.home ?? 0, away: hit.fixture.score.away ?? 0 }, confidence: hit.confidence, severity: hit.severity, evidences: hit.reasons, status: 'pending' })
        }
      }
    }
  }, [patternHits, triggerAlert, patterns, registerCommandAlert])

  // ─── Resolution Engine ─────────────────────────────────────────────────────
  useEffect(() => {
    if (fixtures.length === 0 || commandAlerts.length === 0) return
    const pending = commandAlerts.filter(a => a.status === 'pending')
    if (pending.length === 0) return
    const fixtureMap = new Map(fixtures.map(f => [f.id, f]))
    for (const alert of pending) {
      const fx = fixtureMap.get(alert.fixtureId)
      if (!fx) continue
      const trigAlert: TriggeredAlert = { id: alert.id, patternId: alert.patternId, patternName: alert.patternName, fixtureId: alert.fixtureId, homeTeam: alert.homeTeam, awayTeam: alert.awayTeam, league: alert.competition, minute: alert.minuteAtTrigger, confidence: alert.confidence, reasons: alert.evidences, timestamp: alert.createdAt, status: 'pending', scoreAtTrigger: alert.scoreAtTrigger }
      const result = resolveTriggeredAlertFn(trigAlert, fx)
      if (result) {
        updateCommandAlertStatus(alert.id, result.status, { score: result.scoreAtResolution, reason: result.resolutionReason })
      }
    }
  }, [fixtures, commandAlerts, updateCommandAlertStatus])

  // ─── Auto Discovery ────────────────────────────────────────────────────────
  const discoveries = useMemo(() => runAutoDiscovery(fixtures, statsMap, isFavoriteTeam, discoveryConfig), [fixtures, statsMap, isFavoriteTeam, discoveryConfig])

  // ─── Scanner (ONLY matches with signals) ───────────────────────────────────
  const scannerEntries = useMemo((): ScannerEntry[] => {
    const hitFixtureIds = new Set(patternHits.map(h => h.fixtureId))
    const discoveryFixtureIds = new Set(discoveries.map(d => d.fixtureId))
    const entries: ScannerEntry[] = []

    for (const fx of fixtures) {
      const fxHits = patternHits.filter(h => h.fixtureId === fx.id)
      const hasDiscovery = discoveryFixtureIds.has(fx.id)
      const hasHit = hitFixtureIds.has(fx.id)

      if (!hasHit && !hasDiscovery) continue // ONLY show matches with real signals

      const topPattern = fxHits[0] || null
      const confidence = topPattern?.confidence || 0
      const disc = discoveries.find(d => d.fixtureId === fx.id)
      const priority: ScannerEntry['priority'] = confidence >= 75 ? 'critical' : confidence >= 50 ? 'attention' : hasDiscovery ? 'watch' : 'low'
      const reason = topPattern?.patternName || disc?.insight || ''
      entries.push({ fixture: fx, patterns: fxHits, topPattern, priority, confidence: confidence || disc?.confidence || 0, reason })
    }

    return entries.sort((a, b) => b.confidence - a.confidence)
  }, [fixtures, patternHits, discoveries])

  // ─── Decision ──────────────────────────────────────────────────────────────
  const decisionMatch = useMemo(() => {
    if (patternHits.length > 0) return patternHits[0].fixture
    if (discoveries.length > 0) return discoveries[0].fixture
    return null
  }, [patternHits, discoveries])
  const decisionHit = patternHits[0] || null
  const decisionDiscovery = !decisionHit && discoveries.length > 0 ? discoveries[0] : null

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

  if (loading) return <div className="max-w-[1200px] mx-auto flex items-center justify-center min-h-[50vh]"><div className="flex flex-col items-center gap-4"><div className="relative h-10 w-10"><div className="absolute inset-0 rounded-full border border-white/[0.06]" /><div className="absolute inset-0 rounded-full border border-transparent border-t-cyan-400/60 animate-spin" /></div><span className="text-[11px] text-white/20 tracking-wider uppercase">Inicializando motor</span></div></div>

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 animate-fadeIn">
      {/* HEADER */}
      <header className="relative rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#060a12] via-[#080d16] to-[#0a1018]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.015),transparent_50%)]" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        <div className="relative px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2"><h1 className="text-[18px] font-semibold text-white tracking-tight">Command Center</h1><span className={`text-[8px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full border ${error ? 'bg-rose-500/6 text-rose-400/70 border-rose-500/10' : 'bg-emerald-500/6 text-emerald-400/70 border-emerald-500/10'}`}>{error ? 'Erro parcial' : 'Online'}</span></div>
              <p className="text-[11px] text-white/30 mt-0.5">Motor de decisão em tempo real{timeSince !== null && ` · ${timeSince < 60 ? `${timeSince}s` : `${Math.floor(timeSince / 60)}min`}`}{refreshing && <span className="text-cyan-400/40 ml-1 animate-pulse">●</span>}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={toggleAuto} className={`h-7 px-2.5 rounded-lg text-[9px] font-medium uppercase tracking-wider transition-all ${autoRefresh ? 'bg-emerald-500/8 text-emerald-400/60 border border-emerald-500/10' : 'text-white/20 border border-white/[0.04]'}`} type="button">Auto</button>
              <button onClick={() => fetchData()} disabled={refreshing} className="h-7 w-7 rounded-lg flex items-center justify-center text-white/25 border border-white/[0.05] hover:text-white/50 transition-all disabled:opacity-20" type="button" aria-label="Atualizar"><RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="flex gap-px rounded-xl overflow-hidden bg-white/[0.01] border border-white/[0.03]">
            {metrics.map(m => (<div key={m.label} className="flex-1 px-2.5 py-2.5 text-center"><span className={`text-[17px] font-bold tabular-nums block leading-none ${m.value > 0 ? (m.color === 'emerald' ? 'text-emerald-400' : m.color === 'cyan' ? 'text-cyan-400' : m.color === 'amber' ? 'text-amber-400' : m.color === 'rose' ? 'text-rose-400' : 'text-white/60') : 'text-white/12'}`}>{m.value}</span><span className="text-[9px] text-white/30 uppercase tracking-[0.06em] mt-1 block">{m.label}</span></div>))}
          </div>
        </div>
      </header>

      {error && <div className="rounded-lg border border-rose-500/8 bg-rose-500/[0.015] px-4 py-2.5 text-[11px] text-rose-400/60 flex items-center gap-2"><AlertCircle size={12} />{error}</div>}

      {/* NAV */}
      <nav className="flex gap-0.5">
        {([
          { id: 'cockpit' as Tab, label: 'Cockpit', icon: Activity, badge: patternHits.length },
          { id: 'patterns' as Tab, label: 'Padrões', icon: Target, badge: activePatternCount },
          { id: 'scanner' as Tab, label: 'Scanner', icon: Eye, badge: scannerEntries.length },
          { id: 'alerts' as Tab, label: 'Alertas', icon: Zap, badge: triggeredTodayCount },
          { id: 'performance' as Tab, label: 'Performance', icon: BarChart3, badge: 0 },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-medium transition-all ${activeTab === tab.id ? 'text-white/80 bg-white/[0.04] border border-white/[0.06]' : 'text-white/25 hover:text-white/45 border border-transparent'}`} type="button">
            <tab.icon size={12} />{tab.label}
            {tab.badge > 0 && <span className={`text-[8px] px-1.5 rounded-full ${activeTab === tab.id ? 'bg-cyan-500/15 text-cyan-400/80' : 'bg-white/[0.04] text-white/30'}`}>{tab.badge}</span>}
          </button>
        ))}
      </nav>

      {/* CONTENT */}
      {activeTab === 'cockpit' && <CockpitContent decisionMatch={decisionMatch} decisionHit={decisionHit} decisionDiscovery={decisionDiscovery} patternHits={patternHits} discoveries={discoveries} changes={changes} fixtures={fixtures} openMatch={openMatch} isAdvanced={isAdvanced} activePatternCount={activePatternCount} enabledCount={enabledCount} triggeredAlerts={getRecentTriggered(5)} onGoToPatterns={() => setActiveTab('patterns')} navigate={navigate} />}
      {activeTab === 'patterns' && <PatternsContent patterns={patterns} templates={templates} createFromTemplate={createFromTemplate} createPattern={createPattern} updatePattern={updatePattern} togglePattern={togglePattern} deletePattern={deletePattern} isAdvanced={isAdvanced} showBuilder={showBuilder} setShowBuilder={setShowBuilder} discoveryConfig={discoveryConfig} updateDiscoveryConfig={updateDiscoveryConfig} />}
      {activeTab === 'scanner' && <ScannerContent entries={scannerEntries} openMatch={openMatch} isAdvanced={isAdvanced} />}
      {activeTab === 'alerts' && <AlertsContent triggeredAlerts={getRecentTriggered(30)} isAdvanced={isAdvanced} openMatch={openMatch} fixtures={fixtures} navigate={navigate} />}
      {activeTab === 'performance' && <PerformanceContent patterns={patterns} triggeredAlerts={triggeredAlerts} isAdvanced={isAdvanced} />}
    </div>
  )
}


// ═══ COCKPIT ═══
function CockpitContent({ decisionMatch, decisionHit, decisionDiscovery, patternHits, discoveries, changes, fixtures, openMatch, isAdvanced, activePatternCount, enabledCount, triggeredAlerts, onGoToPatterns, navigate }: { decisionMatch: LiveFixture | null; decisionHit: PatternHit | null; decisionDiscovery: AutoDiscovery | null; patternHits: PatternHit[]; discoveries: AutoDiscovery[]; changes: ChangeEvent[]; fixtures: LiveFixture[]; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; activePatternCount: number; enabledCount: number; triggeredAlerts: TriggeredAlert[]; onGoToPatterns: () => void; navigate: (path: string) => void }) {
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { templates, createFromTemplate } = usePatterns()

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
      <div className="space-y-5">
        {/* DECISÃO AGORA */}
        {decisionMatch ? (
          <section className="group relative rounded-2xl overflow-hidden cursor-pointer" onClick={() => openMatch(decisionMatch)} role="button">
            <div className="absolute inset-0 bg-gradient-to-br from-[#070b13] via-[#090d17] to-[#0b101a]" />
            <div className="absolute inset-0 border border-white/[0.04] rounded-2xl group-hover:border-white/[0.08] transition-colors duration-300" />
            {(decisionHit || decisionDiscovery) && <div className="absolute top-0 left-1/3 w-[180px] h-[50px] bg-amber-500/[0.012] rounded-full blur-[35px]" />}
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {decisionHit && <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.3)] animate-pulse" />}
                  <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/35">{decisionHit ? 'Padrão detectado' : decisionDiscovery ? 'Descoberta automática' : 'Jogo prioritário'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FavoriteButton active={isFavoriteMatch(buildCanonicalMatchId(decisionMatch.homeTeam.name, decisionMatch.awayTeam.name, decisionMatch.date))} onClick={(e) => { e.stopPropagation(); toggleFavoriteMatch({ canonicalMatchId: buildCanonicalMatchId(decisionMatch.homeTeam.name, decisionMatch.awayTeam.name, decisionMatch.date), homeTeam: decisionMatch.homeTeam.name, awayTeam: decisionMatch.awayTeam.name, competition: decisionMatch.league.name, utcDate: decisionMatch.date }) }} size={12} />
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${isLiveFx(decisionMatch) ? 'bg-emerald-500/8 text-emerald-400 border border-emerald-500/8' : 'text-white/25'}`}>{isLiveFx(decisionMatch) ? `${decisionMatch.status.elapsed || ''}'` : new Date(decisionMatch.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col items-center gap-1.5 w-[90px]"><ClubLogo src={decisionMatch.homeTeam.logo} name={decisionMatch.homeTeam.name} size={44} /><span className="text-[10px] font-medium text-white/60 text-center leading-tight">{decisionMatch.homeTeam.name}</span></div>
                <div className="flex flex-col items-center gap-1"><div className="flex items-baseline gap-2"><span className="text-[32px] font-bold tabular-nums text-white leading-none">{decisionMatch.score.home ?? '-'}</span><span className="text-[11px] text-white/10">:</span><span className="text-[32px] font-bold tabular-nums text-white leading-none">{decisionMatch.score.away ?? '-'}</span></div>{isLiveFx(decisionMatch) && <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.3)] animate-pulse" />}<span className="text-[10px] text-white/20 mt-0.5">{decisionMatch.league.name}</span></div>
                <div className="flex flex-col items-center gap-1.5 w-[90px]"><ClubLogo src={decisionMatch.awayTeam.logo} name={decisionMatch.awayTeam.name} size={44} /><span className="text-[10px] font-medium text-white/40 text-center leading-tight">{decisionMatch.awayTeam.name}</span></div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/[0.03]">
                {decisionHit ? (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5"><span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${decisionHit.severity === 'critical' ? 'bg-rose-500/10 text-rose-400/70' : 'bg-amber-500/8 text-amber-400/60'}`}>{decisionHit.patternName}</span><span className="text-[10px] text-white/30 tabular-nums">{decisionHit.confidence}%</span></div>
                    <p className="text-[11px] text-white/45 leading-relaxed mb-1.5">Evidências: {decisionHit.reasons.slice(0, 4).join(' · ')}</p>
                    <div className="flex items-center justify-between"><span className="text-[10px] text-white/25">Ação: Abrir análise detalhada</span><span className="text-[10px] text-cyan-400/50 group-hover:text-cyan-400/80 font-medium flex items-center gap-0.5 transition-colors">Abrir <ChevronRight size={10} /></span></div>
                    {isAdvanced && <div className="mt-2 text-[9px] text-white/15 font-mono">cond:{decisionHit.matchedConditions}/{decisionHit.totalConditions} · imp:{getMatchImportanceScore(toScoring(decisionMatch))} · {decisionHit.confidenceLevel}</div>}
                  </div>
                ) : decisionDiscovery ? (
                  <div>
                    <p className="text-[11px] text-white/45 mb-1">{decisionDiscovery.insight}</p>
                    <p className="text-[10px] text-white/25">{decisionDiscovery.evidence} · {decisionDiscovery.confidence}%</p>
                    <div className="flex items-center justify-end mt-1"><span className="text-[10px] text-cyan-400/40 group-hover:text-cyan-400/70 font-medium flex items-center gap-0.5 transition-colors">Abrir <ChevronRight size={10} /></span></div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between"><span className="text-[10px] text-white/20">Jogo mais relevante ao vivo</span><span className="text-[10px] text-cyan-400/40 group-hover:text-cyan-400/70 font-medium flex items-center gap-0.5 transition-colors">Abrir <ChevronRight size={10} /></span></div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/[0.04] bg-white/[0.008] p-6 text-center">
            <p className="text-[12px] text-white/30">Nenhuma decisão crítica agora</p>
            <p className="text-[10px] text-white/15 mt-1">Monitorando {fixtures.length} partidas · {activePatternCount} padrões ativos</p>
          </section>
        )}

        {/* PADRÕES BATENDO */}
        {patternHits.length > 0 && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-400/50 mb-2.5 flex items-center gap-1.5"><Zap size={10} />Padrões batendo</h3>
            <div className="space-y-1.5">
              {patternHits.slice(0, 5).map((hit, i) => (
                <div key={`${hit.patternId}-${hit.fixtureId}-${i}`} onClick={() => openMatch(hit.fixture)} className="group flex items-center gap-3 rounded-xl border border-white/[0.03] bg-white/[0.006] px-4 py-2.5 cursor-pointer hover:border-white/[0.07] transition-all" role="button">
                  <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${hit.severity === 'critical' ? 'bg-rose-500/10 text-rose-400/60' : hit.severity === 'attention' ? 'bg-amber-500/8 text-amber-400/50' : 'bg-white/[0.03] text-white/25'}`}>{hit.severity === 'critical' ? 'CRÍTICO' : hit.severity === 'attention' ? 'ATENÇÃO' : 'INFO'}</span>
                  <ClubLogo src={hit.fixture.homeTeam.logo} name={hit.fixture.homeTeam.name} size={16} />
                  <span className="text-[11px] text-white/55 truncate flex-1">{hit.fixture.homeTeam.name} {hit.fixture.score.home ?? '-'}:{hit.fixture.score.away ?? '-'} {hit.fixture.awayTeam.name}</span>
                  <span className="text-[10px] text-white/25 shrink-0">{hit.patternName}</span>
                  <span className="text-[9px] text-white/20 tabular-nums shrink-0">{hit.confidence}%</span>
                  <ChevronRight size={10} className="text-white/10 group-hover:text-white/30 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* DESCOBERTAS */}
        {discoveries.length > 0 && patternHits.length === 0 && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-400/40 mb-2.5 flex items-center gap-1.5"><Sparkles size={10} />Descobertas automáticas</h3>
            <div className="space-y-1.5">
              {discoveries.slice(0, 4).map(d => (
                <div key={d.id} onClick={() => openMatch(d.fixture)} className="group flex items-center gap-3 rounded-xl border border-white/[0.025] bg-white/[0.004] px-4 py-2.5 cursor-pointer hover:border-white/[0.06] transition-all" role="button">
                  <span className="text-[11px] text-white/50 flex-1">{d.insight}</span>
                  <span className="text-[9px] text-white/20 shrink-0">{d.confidence}%</span>
                  <ChevronRight size={10} className="text-white/8 group-hover:text-white/20 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ONBOARDING */}
        {activePatternCount === 0 && patternHits.length === 0 && discoveries.length === 0 && (
          <section className="rounded-2xl border border-white/[0.04] bg-gradient-to-b from-white/[0.01] to-transparent p-6">
            <h3 className="text-[13px] font-medium text-white/55 mb-1.5">Ative seu primeiro radar</h3>
            <p className="text-[11px] text-white/25 mb-4 max-w-[380px]">Padrões monitoram jogos ao vivo e detectam oportunidades automaticamente. Ative um template para começar.</p>
            <div className="grid grid-cols-2 gap-2">
              {templates.slice(0, 4).map(t => (
                <button key={t.id} onClick={() => createFromTemplate(t.id)} className="text-left rounded-xl border border-white/[0.04] bg-white/[0.005] px-4 py-3 hover:border-white/[0.08] hover:bg-white/[0.01] transition-all group" type="button">
                  <span className="text-[11px] text-white/50 group-hover:text-white/70 block font-medium">{t.name}</span>
                  <span className="text-[9px] text-white/20 block mt-0.5">{t.conditions.length} condições · {t.severity}</span>
                </button>
              ))}
            </div>
            <button onClick={onGoToPatterns} className="mt-4 text-[10px] text-cyan-400/50 hover:text-cyan-400/80 font-medium transition-colors" type="button">Ver todos os 14 templates →</button>
          </section>
        )}
      </div>

      {/* SIDEBAR */}
      <aside className="space-y-4">
        {changes.length > 0 && (<div className="rounded-xl border border-white/[0.04] bg-white/[0.006] p-3.5"><h4 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-400/35 mb-2">Mudanças</h4><div className="space-y-1.5">{changes.slice(0, 4).map(c => (<div key={c.id} className={`rounded-lg px-3 py-1.5 border-l-2 ${c.type === 'score_change' ? 'border-l-emerald-400/40 bg-emerald-500/[0.015]' : c.type === 'final_phase' ? 'border-l-amber-400/30 bg-amber-500/[0.015]' : 'border-l-white/[0.08] bg-white/[0.005]'}`}><span className="text-[9px] text-white/35">{c.text}</span></div>))}</div></div>)}
        {triggeredAlerts.length > 0 && (<div className="rounded-xl border border-white/[0.04] bg-white/[0.006] p-3.5"><h4 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-400/35 mb-2">Disparados</h4><div className="space-y-1.5">{triggeredAlerts.slice(0, 3).map(t => (<div key={t.id} className="rounded-lg px-3 py-1.5 bg-white/[0.005] border border-white/[0.02]"><span className="text-[9px] text-white/40 block">{t.patternName}</span><span className="text-[9px] text-white/20">{t.homeTeam} x {t.awayTeam} · {t.confidence}%</span></div>))}</div></div>)}
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.006] p-3.5"><h4 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/20 mb-2">Ações</h4><div className="space-y-0.5">{[...(enabledCount === 0 ? [{ l: 'Criar alertas', t: '/app/alerts' }] : []), { l: 'Configurar padrões', t: '' }, { l: 'Explorar partidas', t: '/app/matches' }, { l: 'Live Radar', t: '/app/live' }].map((a, i) => (<button key={i} onClick={() => a.t ? navigate(a.t) : onGoToPatterns()} className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg hover:bg-white/[0.015] transition-colors group" type="button"><span className="text-[10px] text-white/30 group-hover:text-white/50">{a.l}</span><ChevronRight size={9} className="text-white/10 group-hover:text-white/25" /></button>))}</div></div>
      </aside>
    </div>
  )
}


// ═══ PATTERNS ═══
function PatternsContent({ patterns, templates, createFromTemplate, createPattern, updatePattern, togglePattern, deletePattern, isAdvanced, showBuilder, setShowBuilder, discoveryConfig, updateDiscoveryConfig }: { patterns: Pattern[]; templates: PatternTemplate[]; createFromTemplate: (id: string) => Pattern | null; createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern; updatePattern: (id: string, patch: Partial<Pattern>) => void; togglePattern: (id: string) => void; deletePattern: (id: string) => void; isAdvanced: boolean; showBuilder: boolean; setShowBuilder: (v: boolean) => void; discoveryConfig: AutoDiscoveryConfig; updateDiscoveryConfig: (p: Partial<AutoDiscoveryConfig>) => void }) {
  const [showConfig, setShowConfig] = useState(false)
  return (
    <div className="space-y-6">
      {showBuilder && <PatternBuilderPanel onSave={(p) => { createPattern(p); setShowBuilder(false) }} onCancel={() => setShowBuilder(false)} />}
      {showConfig && <DiscoveryConfigPanel config={discoveryConfig} onChange={updateDiscoveryConfig} onClose={() => setShowConfig(false)} />}

      {patterns.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3"><h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/35">Padrões configurados</h3><div className="flex gap-2"><button onClick={() => setShowConfig(true)} className="text-[9px] text-white/25 hover:text-white/50 flex items-center gap-1 transition-colors" type="button"><Settings2 size={10} />Config</button><button onClick={() => setShowBuilder(true)} className="text-[9px] text-cyan-400/50 hover:text-cyan-400/80 font-medium flex items-center gap-1 transition-colors" type="button"><Plus size={10} />Criar</button></div></div>
          <div className="space-y-1.5">{patterns.map(p => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.006] px-4 py-3">
              <div className={`h-2 w-2 rounded-full shrink-0 ${p.status === 'active' ? 'bg-emerald-400/70' : 'bg-white/15'}`} />
              <div className="flex-1 min-w-0"><span className="text-[11px] font-medium text-white/60 block">{p.name}</span><span className="text-[9px] text-white/25 block mt-0.5">{p.description || `${p.conditions.length} condições`}</span>{isAdvanced && <span className="text-[9px] text-white/15 font-mono mt-0.5 block">scope:{p.scope} · conf≥{p.minConfidence} · action:{p.action}</span>}</div>
              <button onClick={() => togglePattern(p.id)} className={`text-[9px] px-2.5 py-1 rounded-lg border transition-all ${p.status === 'active' ? 'border-emerald-500/15 text-emerald-400/60' : 'border-white/[0.04] text-white/25'}`} type="button">{p.status === 'active' ? 'Ativo' : 'Pausado'}</button>
              <button onClick={() => deletePattern(p.id)} className="text-[10px] text-white/15 hover:text-rose-400/50 transition-colors px-1" type="button">×</button>
            </div>
          ))}</div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3"><h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/35">Biblioteca de padrões</h3>{!showBuilder && <button onClick={() => setShowBuilder(true)} className="text-[9px] text-cyan-400/50 hover:text-cyan-400/80 font-medium flex items-center gap-1 transition-colors" type="button"><Plus size={10} />Personalizado</button>}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{templates.map(t => {
          const active = patterns.some(p => p.templateId === t.id && p.status === 'active')
          return (<div key={t.id} className="rounded-xl border border-white/[0.04] bg-white/[0.005] p-4 hover:border-white/[0.07] transition-all">
            <div className="flex items-start justify-between mb-1.5"><div><span className="text-[11px] font-medium text-white/55 block">{t.name}</span><span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1 inline-block ${t.severity === 'critical' ? 'bg-rose-500/8 text-rose-400/50' : t.severity === 'attention' ? 'bg-amber-500/6 text-amber-400/40' : 'bg-white/[0.02] text-white/20'}`}>{t.severity}</span></div>{active ? <span className="text-[9px] text-emerald-400/50">✓ Ativo</span> : <button onClick={() => createFromTemplate(t.id)} className="text-[9px] text-cyan-400/50 hover:text-cyan-400/80 font-medium transition-colors" type="button">Ativar</button>}</div>
            <p className="text-[10px] text-white/30 leading-relaxed">{t.description}</p>
            {isAdvanced && <div className="mt-2 flex flex-wrap gap-1">{t.conditions.map((c, i) => <span key={i} className="text-[8px] text-white/15 bg-white/[0.02] px-1.5 py-0.5 rounded">{c.type}</span>)}</div>}
          </div>)
        })}</div>
      </section>
    </div>
  )
}

// ═══ PATTERN BUILDER ═══
const COND_LABELS: Record<PatternConditionType, string> = { is_live: 'Jogo ao vivo', is_final_phase: 'Reta final (70\'+)', is_pre_live: 'Começa em breve', minute_between: 'Minuto entre', score_tied: 'Placar empatado', score_diff_lte: 'Diferença gols ≤', favorite_involved: 'Favorito envolvido', shots_recent_gte: 'Finalizações ≥', shots_on_target_gte: 'No alvo ≥', corners_gte: 'Escanteios ≥', cards_gte: 'Cartões ≥', possession_gte: 'Posse ≥', goals_total_gte: 'Gols totais ≥', goals_total_lte: 'Gols totais ≤', away_shots_on_target_gte: 'Visitante no alvo ≥', away_goals_gte: 'Gols visitante ≥', away_possession_gte: 'Posse visitante ≥' }

function PatternBuilderPanel({ onSave, onCancel }: { onSave: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [severity, setSeverity] = useState<'critical' | 'attention' | 'info'>('attention')
  const [scope, setScope] = useState<'all' | 'favorites_only'>('all')
  const [minConf, setMinConf] = useState(50)
  const [action, setAction] = useState<'register_alert' | 'suggest_only' | 'highlight'>('register_alert')
  const [conditions, setConditions] = useState<PatternCondition[]>([{ type: 'is_live', params: {} }])

  const addCond = (type: PatternConditionType) => {
    const params: Record<string, number | string | boolean> = {}
    if (type === 'minute_between') { params.min = 60; params.max = 90 }
    else if (type === 'score_diff_lte') { params.maxDiff = 1 }
    else if (type === 'goals_total_lte') { params.value = 1 }
    else if (type === 'is_pre_live') { params.minutes = 60 }
    else if (['shots_recent_gte', 'shots_on_target_gte', 'corners_gte', 'cards_gte', 'goals_total_gte', 'away_shots_on_target_gte', 'away_goals_gte'].includes(type)) { params.value = 3 }
    else if (['possession_gte', 'away_possession_gte'].includes(type)) { params.value = 58 }
    setConditions(prev => [...prev, { type, params }])
  }

  const updateParam = (idx: number, key: string, val: number) => {
    setConditions(prev => prev.map((c, i) => i === idx ? { ...c, params: { ...c.params, [key]: val } } : c))
  }

  const save = () => { if (!name.trim() || conditions.length === 0) return; onSave({ name: name.trim(), description: desc.trim(), conditions, severity, status: 'active', isTemplate: false, scope, minConfidence: minConf, action, maxTriggersPerMatch: 2, antiDuplicateWindow: 5 }) }

  return (
    <div className="rounded-xl border border-cyan-500/12 bg-gradient-to-b from-cyan-500/[0.02] to-transparent p-5">
      <div className="flex items-center justify-between mb-4"><h3 className="text-[12px] font-medium text-white/55">Criar padrão personalizado</h3><button onClick={onCancel} className="text-white/20 hover:text-white/50" type="button"><X size={15} /></button></div>
      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do padrão" className="w-full h-9 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[11px] text-white placeholder:text-white/20 outline-none focus:border-white/[0.12]" />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrição (opcional)" className="w-full h-9 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[11px] text-white placeholder:text-white/20 outline-none focus:border-white/[0.12]" />
        <div className="flex gap-4 flex-wrap">
          <div><span className="text-[9px] text-white/30 block mb-1">Severidade</span><div className="flex gap-1">{(['critical', 'attention', 'info'] as const).map(s => (<button key={s} onClick={() => setSeverity(s)} className={`text-[9px] px-2.5 py-1 rounded-lg border transition-all ${severity === s ? 'border-white/[0.1] text-white/60 bg-white/[0.03]' : 'border-white/[0.03] text-white/20'}`} type="button">{s === 'critical' ? 'Crítico' : s === 'attention' ? 'Atenção' : 'Info'}</button>))}</div></div>
          <div><span className="text-[9px] text-white/30 block mb-1">Escopo</span><div className="flex gap-1">{(['all', 'favorites_only'] as const).map(s => (<button key={s} onClick={() => setScope(s)} className={`text-[9px] px-2.5 py-1 rounded-lg border transition-all ${scope === s ? 'border-white/[0.1] text-white/60 bg-white/[0.03]' : 'border-white/[0.03] text-white/20'}`} type="button">{s === 'all' ? 'Todos' : 'Favoritos'}</button>))}</div></div>
          <div><span className="text-[9px] text-white/30 block mb-1">Confiança mín.</span><input type="number" value={minConf} onChange={e => setMinConf(Number(e.target.value))} className="w-16 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 text-[10px] text-white outline-none" min={20} max={95} /></div>
          <div><span className="text-[9px] text-white/30 block mb-1">Ação</span><div className="flex gap-1">{(['register_alert', 'suggest_only', 'highlight'] as const).map(a => (<button key={a} onClick={() => setAction(a)} className={`text-[9px] px-2.5 py-1 rounded-lg border transition-all ${action === a ? 'border-white/[0.1] text-white/60 bg-white/[0.03]' : 'border-white/[0.03] text-white/20'}`} type="button">{a === 'register_alert' ? 'Alerta' : a === 'suggest_only' ? 'Sugerir' : 'Destacar'}</button>))}</div></div>
        </div>
        <div>
          <span className="text-[9px] text-white/30 block mb-2">Condições ({conditions.length})</span>
          <div className="space-y-1.5">{conditions.map((c, i) => {
            const hasValue = c.params.value !== undefined || c.params.maxDiff !== undefined
            const hasMinMax = c.params.min !== undefined
            return (<div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 border border-white/[0.03]">
              <span className="text-[10px] text-white/45 flex-1">{COND_LABELS[c.type] || c.type}</span>
              {hasMinMax && <><input type="number" value={Number(c.params.min) || 0} onChange={e => updateParam(i, 'min', Number(e.target.value))} className="w-12 h-6 rounded border border-white/[0.06] bg-white/[0.02] px-1.5 text-[9px] text-white text-center outline-none" /><span className="text-[9px] text-white/20">-</span><input type="number" value={Number(c.params.max) || 90} onChange={e => updateParam(i, 'max', Number(e.target.value))} className="w-12 h-6 rounded border border-white/[0.06] bg-white/[0.02] px-1.5 text-[9px] text-white text-center outline-none" /></>}
              {hasValue && <input type="number" value={Number(c.params.value ?? c.params.maxDiff) || 0} onChange={e => updateParam(i, c.params.value !== undefined ? 'value' : 'maxDiff', Number(e.target.value))} className="w-14 h-6 rounded border border-white/[0.06] bg-white/[0.02] px-1.5 text-[9px] text-white text-center outline-none" />}
              <button onClick={() => setConditions(prev => prev.filter((_, j) => j !== i))} className="text-[10px] text-white/15 hover:text-rose-400/50" type="button">×</button>
            </div>)
          })}</div>
          <div className="flex flex-wrap gap-1 mt-2">{(Object.keys(COND_LABELS) as PatternConditionType[]).filter(t => !conditions.some(c => c.type === t)).slice(0, 8).map(t => (<button key={t} onClick={() => addCond(t)} className="text-[8px] text-white/20 hover:text-white/45 bg-white/[0.015] hover:bg-white/[0.025] px-2 py-1 rounded-lg border border-white/[0.03] transition-all" type="button">+ {COND_LABELS[t]}</button>))}</div>
        </div>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onCancel} className="text-[10px] text-white/25 hover:text-white/45 px-3 py-1.5" type="button">Cancelar</button><button onClick={save} disabled={!name.trim() || conditions.length === 0} className="text-[10px] text-cyan-400/70 hover:text-cyan-400 font-medium px-4 py-1.5 rounded-lg border border-cyan-500/20 hover:border-cyan-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all" type="button">Salvar padrão</button></div>
      </div>
    </div>
  )
}

// ═══ DISCOVERY CONFIG ═══
function DiscoveryConfigPanel({ config, onChange, onClose }: { config: AutoDiscoveryConfig; onChange: (p: Partial<AutoDiscoveryConfig>) => void; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-5">
      <div className="flex items-center justify-between mb-4"><h3 className="text-[12px] font-medium text-white/55">Configurações do modo automático</h3><button onClick={onClose} className="text-white/20 hover:text-white/50" type="button"><X size={15} /></button></div>
      <div className="grid grid-cols-2 gap-3">
        <Toggle label="Auto-discovery" checked={config.enabled} onChange={v => onChange({ enabled: v })} />
        <Toggle label="Monitorar favoritos" checked={config.monitorFavorites} onChange={v => onChange({ monitorFavorites: v })} />
        <Toggle label="Ligas principais" checked={config.monitorMainLeagues} onChange={v => onChange({ monitorMainLeagues: v })} />
        <Toggle label="Todas as ligas" checked={config.monitorAllLeagues} onChange={v => onChange({ monitorAllLeagues: v })} />
        <Toggle label="Incluir pré-jogo" checked={config.includePreMatch} onChange={v => onChange({ includePreMatch: v })} />
        <Toggle label="Incluir ao vivo" checked={config.includeLive} onChange={v => onChange({ includeLive: v })} />
        <Toggle label="Registrar alerta auto" checked={config.registerAlertAuto} onChange={v => onChange({ registerAlertAuto: v })} />
        <div><span className="text-[9px] text-white/30 block mb-1">Confiança mín.</span><input type="number" value={config.minConfidence} onChange={e => onChange({ minConfidence: Number(e.target.value) })} className="w-16 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 text-[10px] text-white outline-none" min={20} max={95} /></div>
        <div><span className="text-[9px] text-white/30 block mb-1">Max alertas/jogo</span><input type="number" value={config.maxAlertsPerMatch} onChange={e => onChange({ maxAlertsPerMatch: Number(e.target.value) })} className="w-16 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 text-[10px] text-white outline-none" min={1} max={10} /></div>
        <div><span className="text-[9px] text-white/30 block mb-1">Anti-duplicidade (min)</span><input type="number" value={config.antiDuplicateMinutes} onChange={e => onChange({ antiDuplicateMinutes: Number(e.target.value) })} className="w-16 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 text-[10px] text-white outline-none" min={1} max={30} /></div>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (<button onClick={() => onChange(!checked)} className="flex items-center gap-2 text-left" type="button"><div className={`w-7 h-4 rounded-full transition-colors ${checked ? 'bg-cyan-500/30' : 'bg-white/[0.06]'}`}><div className={`w-3 h-3 rounded-full mt-0.5 transition-all ${checked ? 'ml-3.5 bg-cyan-400' : 'ml-0.5 bg-white/20'}`} /></div><span className="text-[10px] text-white/40">{label}</span></button>)
}


// ═══ SCANNER ═══
function ScannerContent({ entries, openMatch, isAdvanced }: { entries: ScannerEntry[]; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean }) {
  if (entries.length === 0) {
    return (<div className="rounded-xl border border-white/[0.04] border-dashed bg-white/[0.005] p-10 text-center"><Eye size={20} className="mx-auto text-white/15 mb-2" /><p className="text-[12px] text-white/30">Nenhum padrão detectado agora</p><p className="text-[10px] text-white/18 mt-1 max-w-[320px] mx-auto">O motor está analisando jogos ao vivo e próximos jogos com dados suficientes.</p></div>)
  }
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-white/25">{entries.length} {entries.length === 1 ? 'jogo com sinal' : 'jogos com sinais'} detectados</p>
      <div className="space-y-1.5">{entries.map(entry => {
        const fx = entry.fixture
        return (<div key={fx.id} onClick={() => openMatch(fx)} className="group flex items-center gap-3 rounded-xl border border-white/[0.03] bg-white/[0.005] px-4 py-3 cursor-pointer hover:border-white/[0.07] transition-all" role="button">
          <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${entry.priority === 'critical' ? 'bg-rose-500/10 text-rose-400/60' : entry.priority === 'attention' ? 'bg-amber-500/8 text-amber-400/50' : entry.priority === 'watch' ? 'bg-cyan-500/6 text-cyan-400/40' : 'bg-white/[0.02] text-white/20'}`}>{entry.priority === 'critical' ? 'CRÍT' : entry.priority === 'attention' ? 'ATEN' : entry.priority === 'watch' ? 'OBS' : '—'}</span>
          <span className={`text-[10px] font-medium tabular-nums w-8 shrink-0 ${isLiveFx(fx) ? 'text-emerald-400' : 'text-white/20'}`}>{isLiveFx(fx) ? `${fx.status.elapsed || ''}'` : ''}</span>
          <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={16} />
          <span className="text-[11px] text-white/55 truncate flex-1">{fx.homeTeam.name} {fx.score.home ?? '-'}:{fx.score.away ?? '-'} {fx.awayTeam.name}</span>
          <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={16} />
          <span className="text-[9px] text-white/25 shrink-0 max-w-[100px] truncate">{entry.reason}</span>
          <span className="text-[9px] text-white/20 tabular-nums shrink-0">{entry.confidence}%</span>
          {isAdvanced && <span className="text-[8px] text-white/12 font-mono shrink-0">{entry.patterns.length}p</span>}
          <ChevronRight size={10} className="text-white/10 group-hover:text-white/25 shrink-0" />
        </div>)
      })}</div>
    </div>
  )
}

// ═══ ALERTS ═══
function AlertsContent({ triggeredAlerts, isAdvanced, openMatch, fixtures, navigate }: { triggeredAlerts: TriggeredAlert[]; isAdvanced: boolean; openMatch: (fx: LiveFixture) => void; fixtures: LiveFixture[]; navigate: (path: string) => void }) {
  if (triggeredAlerts.length === 0) {
    return (<div className="rounded-xl border border-white/[0.04] border-dashed bg-white/[0.005] p-10 text-center"><Zap size={20} className="mx-auto text-white/15 mb-2" /><p className="text-[12px] text-white/30">Nenhum alerta disparado</p><p className="text-[10px] text-white/18 mt-1">Quando padrões baterem em jogos ao vivo, os alertas aparecerão aqui</p><button onClick={() => navigate('/app/alerts')} className="mt-3 text-[10px] text-cyan-400/45 hover:text-cyan-400/70 font-medium transition-colors" type="button">Gerenciar alertas →</button></div>)
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/30">Alertas disparados</h3><button onClick={() => navigate('/app/alerts')} className="text-[9px] text-cyan-400/40 hover:text-cyan-400/70 font-medium transition-colors" type="button">Gerenciar →</button></div>
      <div className="space-y-1.5">{triggeredAlerts.map(t => {
        const fx = fixtures.find(f => f.id === t.fixtureId)
        const statusLabel = t.status === 'pending' ? 'Pendente' : t.status === 'confirmed' ? 'Confirmado' : t.status === 'failed' ? 'Falhou' : t.status === 'expired' ? 'Expirado' : 'Desconhecido'
        const statusColor = t.status === 'pending' ? 'bg-amber-500/8 text-amber-400/50' : t.status === 'confirmed' ? 'bg-emerald-500/8 text-emerald-400/50' : t.status === 'failed' ? 'bg-rose-500/8 text-rose-400/50' : 'bg-white/[0.03] text-white/20'
        return (<div key={t.id} onClick={() => fx && openMatch(fx)} className={`rounded-xl border border-white/[0.04] bg-white/[0.005] px-4 py-3 ${fx ? 'cursor-pointer hover:border-white/[0.07]' : ''} transition-all`} role={fx ? 'button' : undefined}>
          <div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2"><span className="text-[11px] font-medium text-white/55">{t.patternName}</span><span className="text-[9px] text-white/20 tabular-nums">{t.confidence}%</span></div><span className={`text-[8px] px-2 py-0.5 rounded-md ${statusColor}`}>{statusLabel}</span></div>
          <div className="flex items-center gap-2 text-[10px] text-white/30"><span>{t.homeTeam} x {t.awayTeam}</span>{t.minute && <span>· {t.minute}'</span>}<span>· {t.league}</span></div>
          {isAdvanced && <div className="mt-1.5 text-[9px] text-white/15 font-mono">{t.reasons.slice(0, 3).join(' · ')} | {t.scoreAtTrigger.home}-{t.scoreAtTrigger.away}{t.scoreAtResolution ? ` → ${t.scoreAtResolution.home}-${t.scoreAtResolution.away}` : ''}</div>}
          <span className="text-[8px] text-white/12 mt-1 block">{new Date(t.timestamp).toLocaleString('pt-BR')}</span>
        </div>)
      })}</div>
    </div>
  )
}

// ═══ PERFORMANCE ═══
function PerformanceContent({ patterns, triggeredAlerts, isAdvanced }: { patterns: Pattern[]; triggeredAlerts: TriggeredAlert[]; isAdvanced: boolean }) {
  const stats = useMemo(() => patterns.map(p => {
    const alerts = triggeredAlerts.filter(t => t.patternId === p.id)
    const confirmed = alerts.filter(t => t.status === 'confirmed').length
    const failed = alerts.filter(t => t.status === 'failed').length
    const expired = alerts.filter(t => t.status === 'expired').length
    const resolved = confirmed + failed
    const hitRate = resolved >= 5 ? Math.round((confirmed / resolved) * 100) : null
    const avgConf = alerts.length > 0 ? Math.round(alerts.reduce((s, a) => s + a.confidence, 0) / alerts.length) : null
    return { pattern: p, total: alerts.length, confirmed, failed, expired, hitRate, avgConf, lastHit: alerts[0]?.timestamp || null }
  }), [patterns, triggeredAlerts])

  const totalDisparos = triggeredAlerts.length
  const totalConfirmed = triggeredAlerts.filter(t => t.status === 'confirmed').length
  const totalFailed = triggeredAlerts.filter(t => t.status === 'failed').length

  if (patterns.length === 0) {
    return (<div className="rounded-xl border border-white/[0.04] border-dashed bg-white/[0.005] p-10 text-center"><BarChart3 size={20} className="mx-auto text-white/15 mb-2" /><p className="text-[12px] text-white/30">Sem dados de performance</p><p className="text-[10px] text-white/18 mt-1">Ative padrões para começar a medir resultados</p></div>)
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <MetricCard label="Padrões" value={patterns.length} color="white" />
        <MetricCard label="Disparos" value={totalDisparos} color="amber" />
        <MetricCard label="Confirmados" value={totalConfirmed} color="emerald" />
        <MetricCard label="Falhados" value={totalFailed} color="rose" />
      </div>
      <div className="space-y-1.5">{stats.map(s => (
        <div key={s.pattern.id} className="rounded-xl border border-white/[0.04] bg-white/[0.005] px-4 py-3">
          <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-medium text-white/55">{s.pattern.name}</span><span className={`text-[8px] px-2 py-0.5 rounded-md ${s.pattern.status === 'active' ? 'bg-emerald-500/8 text-emerald-400/50' : 'bg-white/[0.02] text-white/15'}`}>{s.pattern.status}</span></div>
          <div className="flex items-center gap-4 text-[10px] text-white/30">
            <span>{s.total} disparos</span>
            {s.hitRate !== null ? <span className="text-emerald-400/50">Taxa: {s.hitRate}%</span> : <span className="text-white/18 italic">Dados insuficientes ({s.confirmed + s.failed}/5 resoluções)</span>}
            {s.avgConf !== null && <span>Conf. média: {s.avgConf}%</span>}
            {s.lastHit && <span>Último: {new Date(s.lastHit).toLocaleDateString('pt-BR')}</span>}
          </div>
          {isAdvanced && <div className="mt-1.5 text-[9px] text-white/15 font-mono">confirmed:{s.confirmed} · failed:{s.failed} · expired:{s.expired} · pending:{s.total - s.confirmed - s.failed - s.expired}</div>}
        </div>
      ))}</div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClass = value > 0 ? (color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : color === 'rose' ? 'text-rose-400' : 'text-white/60') : 'text-white/15'
  return (<div className="rounded-xl border border-white/[0.04] bg-white/[0.005] px-4 py-3 flex-1 text-center"><span className={`text-[18px] font-bold tabular-nums block ${colorClass}`}>{value}</span><span className="text-[9px] text-white/25 uppercase tracking-wider">{label}</span></div>)
}
