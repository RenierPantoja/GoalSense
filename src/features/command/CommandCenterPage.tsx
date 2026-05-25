/**
 * Command Center V3.6 — Wide cockpit layout, intelligence gate, no false positives.
 * Only shows signals when user has configured patterns or auto-discovery.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, ChevronRight, AlertCircle, Plus, Activity, Target, Eye, BarChart3, Sparkles, X } from 'lucide-react'
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
import { resolveAlert } from './intelligence/patternResolutionEngine'
import { buildPreMatchOutcomeSummary } from '@/services/intelligence/preMatchOutcomePerformance'
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

  // ═══ INTELLIGENCE GATE ═══
  const hasManualPatterns = activePatternCount > 0
  const hasAutoDiscovery = discoveryConfig.enabled && discoveryConfig.userConfigured
  const hasIntelligence = hasManualPatterns || hasAutoDiscovery

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try {
      const r = await getLiveFixtures()
      const fx = r.fixtures || []
      const det = detectChanges(fx, prevRef.current)
      if (det.length > 0) setChanges(prev => [...det, ...prev].slice(0, 12))
      prevRef.current = fx; setFixtures(fx); setLastUpdate(new Date()); setError(null)
    } catch (e) { if (!silent) setError((e as Error).message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  const fetchStats = useCallback(async (fxList: LiveFixture[]) => {
    if (!hasIntelligence) return
    const live = fxList.filter(fx => isLiveFx(fx) && fx.provider === 'espn').slice(0, 15)
    if (live.length === 0) return
    const results = await Promise.allSettled(live.map(async (fx) => {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${fx.id}`)
      if (!res.ok) return null
      const json = await res.json()
      const hS = json.boxscore?.teams?.[0]?.statistics || []; const aS = json.boxscore?.teams?.[1]?.statistics || []
      const g = (arr: any[], n: string) => { const s = arr.find((x: any) => x.name === n || x.label === n); return s ? parseFloat(s.displayValue) || 0 : 0 }
      return { id: fx.id, stats: { possession: { home: g(hS, 'possessionPct') || g(hS, 'POSSESSION'), away: g(aS, 'possessionPct') || g(aS, 'POSSESSION') }, shots: { home: g(hS, 'totalShots') || g(hS, 'SHOTS'), away: g(aS, 'totalShots') || g(aS, 'SHOTS') }, shotsOnTarget: { home: g(hS, 'shotsOnTarget') || g(hS, 'ON GOAL'), away: g(aS, 'shotsOnTarget') || g(aS, 'ON GOAL') }, corners: { home: g(hS, 'wonCorners') || g(hS, 'Corner Kicks'), away: g(aS, 'wonCorners') || g(aS, 'Corner Kicks') }, yellowCards: { home: g(hS, 'yellowCards') || g(hS, 'Yellow Cards'), away: g(aS, 'yellowCards') || g(aS, 'Yellow Cards') } } as FixtureStatsForPattern }
    }))
    const m = new Map<number, FixtureStatsForPattern>()
    for (const r of results) { if (r.status === 'fulfilled' && r.value) m.set(r.value.id, r.value.stats) }
    setStatsMap(m)
  }, [hasIntelligence])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (fixtures.length > 0) fetchStats(fixtures) }, [fixtures, fetchStats])
  const liveMatches = useMemo(() => fixtures.filter(isLiveFx), [fixtures])

  useEffect(() => {
    if (!autoRefresh) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => { fetchData(true); resolveExpired() }, liveMatches.length > 0 ? 25000 : 60000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchData, liveMatches.length, resolveExpired])

  const toggleAuto = () => { const n = !autoRefresh; setAutoRefresh(n); try { localStorage.setItem('goalsense_cmd_auto', String(n)) } catch {} }

  // ─── Pattern Evaluation (ONLY if intelligence active) ──────────────────────
  const patternHits = useMemo(() => {
    if (!hasManualPatterns) return []
    return evaluateAllPatterns(getActivePatterns(), fixtures, statsMap, isFavoriteTeam)
  }, [hasManualPatterns, patterns, fixtures, statsMap, isFavoriteTeam, getActivePatterns])

  useEffect(() => {
    if (!hasIntelligence) return
    for (const hit of patternHits) {
      if (hit.confidence >= 50) {
        const pat = patterns.find(p => p.id === hit.patternId)
        if (pat && pat.action !== 'suggest_only') {
          const fx = hit.fixture; const fxStats = statsMap.get(fx.id)
          triggerAlert({ patternId: hit.patternId, patternName: hit.patternName, fixtureId: fx.id, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, league: fx.league.name, minute: fx.status.elapsed, confidence: hit.confidence, reasons: hit.reasons, timestamp: new Date().toISOString(), status: 'pending', scoreAtTrigger: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 } })
          registerCommandAlert({ source: 'command_center', patternId: hit.patternId, patternName: hit.patternName, fixtureId: fx.id, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, competition: fx.league.name, minuteAtTrigger: fx.status.elapsed, scoreAtTrigger: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 }, confidence: hit.confidence, severity: hit.severity, evidences: hit.reasons, status: 'pending', triggerSnapshot: { minute: fx.status.elapsed, homeScore: fx.score.home ?? 0, awayScore: fx.score.away ?? 0, status: fx.status.short, competition: fx.league.name, provider: fx.provider, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, homeLogo: fx.homeTeam.logo, awayLogo: fx.awayTeam.logo, favoriteInvolved: isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name), conditionsMatched: hit.matchedConditions, conditionsTotal: hit.totalConditions, confidenceAtTrigger: hit.confidence, ...(fxStats ? { stats: fxStats } : {}) } })
        }
      }
    }
  }, [patternHits, hasIntelligence, triggerAlert, patterns, registerCommandAlert, isFavoriteTeam, statsMap])

  // ─── Resolution ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (fixtures.length === 0 || commandAlerts.length === 0) return
    const pending = commandAlerts.filter(a => a.status === 'pending')
    if (pending.length === 0) return
    const fxMap = new Map(fixtures.map(f => [f.id, f]))
    for (const alert of pending) {
      const fx = fxMap.get(alert.fixtureId)
      const result = resolveAlert({ id: alert.id, patternName: alert.patternName, fixtureId: alert.fixtureId, minuteAtTrigger: alert.minuteAtTrigger, scoreAtTrigger: alert.scoreAtTrigger, confidence: alert.confidence, createdAt: alert.createdAt, status: 'pending' }, fx)
      if (result) { const finalStatus = result.strength === 'partial_confirmation' ? 'confirmed_partial' as const : result.status; updateCommandAlertStatus(alert.id, finalStatus, { score: result.scoreAtResolution, reason: result.reason }) }
    }
  }, [fixtures, commandAlerts, updateCommandAlertStatus])

  // ─── Auto Discovery (ONLY if configured) ──────────────────────────────────
  const discoveries = useMemo(() => {
    if (!hasAutoDiscovery) return []
    return runAutoDiscovery(fixtures, statsMap, isFavoriteTeam, discoveryConfig)
  }, [hasAutoDiscovery, fixtures, statsMap, isFavoriteTeam, discoveryConfig])

  // ─── Auto Discovery → Alert (ONLY when registerAlertAuto is on) ──────────
  // Honors: hasAutoDiscovery + discoveryConfig.registerAlertAuto + minConfidence threshold.
  // Anti-duplicate is enforced inside registerCommandAlert (5min window per pattern+fixture).
  useEffect(() => {
    if (!hasAutoDiscovery) return
    if (!discoveryConfig.registerAlertAuto) return
    for (const d of discoveries) {
      if (d.confidence < discoveryConfig.minConfidence) continue
      const fx = d.fixture
      const fxStats = statsMap.get(fx.id)
      // Stable synthetic patternId per discovery type so dedup + resolution work consistently.
      const syntheticPatternId = `auto_${d.type}`
      const patternName = d.insight || 'Descoberta automática'
      // Severity inferred from discovery type — final phase / favorite risk are higher signal.
      const inferredSeverity: 'critical' | 'attention' | 'info' =
        d.type === 'final_phase' || d.type === 'favorite_risk' ? 'attention'
        : d.type === 'pressure' || d.type === 'dominance' || d.type === 'open_game' ? 'info'
        : 'info'
      triggerAlert({
        patternId: syntheticPatternId,
        patternName,
        fixtureId: fx.id,
        homeTeam: fx.homeTeam.name,
        awayTeam: fx.awayTeam.name,
        league: fx.league.name,
        minute: fx.status.elapsed,
        confidence: d.confidence,
        reasons: [d.evidence].filter(Boolean),
        timestamp: new Date().toISOString(),
        status: 'pending',
        scoreAtTrigger: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 },
      })
      registerCommandAlert({
        source: 'command_center',
        patternId: syntheticPatternId,
        patternName,
        fixtureId: fx.id,
        homeTeam: fx.homeTeam.name,
        awayTeam: fx.awayTeam.name,
        competition: fx.league.name,
        minuteAtTrigger: fx.status.elapsed,
        scoreAtTrigger: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 },
        confidence: d.confidence,
        severity: inferredSeverity,
        evidences: [d.evidence].filter(Boolean),
        status: 'pending',
        triggerSnapshot: {
          minute: fx.status.elapsed,
          homeScore: fx.score.home ?? 0,
          awayScore: fx.score.away ?? 0,
          status: fx.status.short,
          competition: fx.league.name,
          provider: fx.provider,
          homeTeam: fx.homeTeam.name,
          awayTeam: fx.awayTeam.name,
          homeLogo: fx.homeTeam.logo,
          awayLogo: fx.awayTeam.logo,
          favoriteInvolved: isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name),
          conditionsMatched: 0,
          conditionsTotal: 0,
          confidenceAtTrigger: d.confidence,
          ...(fxStats ? { stats: fxStats } : {}),
        },
      })
    }
  }, [hasAutoDiscovery, discoveryConfig.registerAlertAuto, discoveryConfig.minConfidence, discoveries, triggerAlert, registerCommandAlert, isFavoriteTeam, statsMap])

  // ─── Scanner (ONLY signals) ────────────────────────────────────────────────
  const scannerEntries = useMemo((): ScannerEntry[] => {
    if (!hasIntelligence) return []
    const hitIds = new Set(patternHits.map(h => h.fixtureId))
    const discIds = new Set(discoveries.map(d => d.fixtureId))
    const entries: ScannerEntry[] = []
    for (const fx of fixtures) {
      const fxHits = patternHits.filter(h => h.fixtureId === fx.id)
      if (!hitIds.has(fx.id) && !discIds.has(fx.id)) continue
      const top = fxHits[0] || null; const disc = discoveries.find(d => d.fixtureId === fx.id)
      const conf = top?.confidence || disc?.confidence || 0
      const priority: ScannerEntry['priority'] = conf >= 75 ? 'critical' : conf >= 50 ? 'attention' : 'watch'
      entries.push({ fixture: fx, patterns: fxHits, topPattern: top, priority, confidence: conf, reason: top?.patternName || disc?.insight || '' })
    }
    return entries.sort((a, b) => b.confidence - a.confidence)
  }, [hasIntelligence, fixtures, patternHits, discoveries])

  // ─── Decision ──────────────────────────────────────────────────────────────
  const decisionMatch = useMemo(() => {
    if (!hasIntelligence) return null
    if (patternHits.length > 0) return patternHits[0].fixture
    if (discoveries.length > 0) return discoveries[0].fixture
    return null
  }, [hasIntelligence, patternHits, discoveries])
  const decisionHit = hasIntelligence ? patternHits[0] || null : null
  const decisionDiscovery = !decisionHit && discoveries.length > 0 ? discoveries[0] : null

  // ─── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = !hasIntelligence ? { label: 'Sem configuração', color: 'text-white/55 bg-white/[0.04] border-white/[0.08]' } : patternHits.length > 0 ? { label: 'Sinais ativos', color: 'text-amber-300 bg-amber-500/10 border-amber-500/15' } : liveMatches.length > 0 ? { label: 'Monitorando', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/15' } : { label: 'Online', color: 'text-emerald-400/80 bg-emerald-500/8 border-emerald-500/12' }

  const metrics = [
    { label: 'Analisados', value: fixtures.length },
    { label: 'Padrões ativos', value: activePatternCount },
    { label: 'Motor auto', value: hasAutoDiscovery ? 'On' : 'Off' },
    { label: 'Sinais', value: patternHits.length + discoveries.length },
    { label: 'Alertas', value: triggeredTodayCount },
  ]

  const openMatch = (fx: LiveFixture) => { storeFixtureForNavigation(fx); navigate(`/app/matches/${fx.id}`, { state: { fixture: fx } }) }
  const timeSince = lastUpdate ? Math.round((Date.now() - lastUpdate.getTime()) / 1000) : null

  if (loading) return <div className="max-w-[1680px] mx-auto px-6 xl:px-10 flex items-center justify-center min-h-[50vh]"><div className="flex flex-col items-center gap-4"><div className="relative h-11 w-11"><div className="absolute inset-0 rounded-full border-2 border-white/[0.08]" /><div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400/70 animate-spin" /></div><span className="text-[13px] text-white/35">Inicializando motor</span></div></div>

  return (
    <div className="max-w-[1680px] mx-auto px-5 xl:px-10 space-y-7 animate-fadeIn">
      {/* ═══ HEADER ═══ */}
      <header className="relative rounded-[24px] overflow-hidden border border-white/[0.07]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#050910] via-[#070c15] to-[#091019]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.018),transparent_50%)]" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
        <div className="relative px-8 py-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-3"><h1 className="text-[28px] font-bold text-white/95 tracking-tight">Command Center</h1><span className={`text-[11px] font-bold uppercase tracking-[0.08em] px-3 py-1 rounded-full border ${statusBadge.color}`}>{statusBadge.label}</span></div>
              <p className="text-[14px] text-white/45 mt-1.5">Motor de decisão em tempo real{timeSince !== null && <span className="text-white/30"> · atualizado {timeSince < 60 ? `${timeSince}s` : `${Math.floor(timeSince / 60)}min`} atrás</span>}{refreshing && <span className="text-cyan-400/50 ml-2 animate-pulse">●</span>}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <button onClick={toggleAuto} className={`h-9 px-4 rounded-xl text-[11px] font-semibold uppercase tracking-wider transition-all ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/15' : 'text-white/30 border border-white/[0.06]'}`} type="button">Auto</button>
              <button onClick={() => fetchData()} disabled={refreshing} className="h-9 w-9 rounded-xl flex items-center justify-center text-white/40 border border-white/[0.07] hover:text-white/70 hover:border-white/[0.12] transition-all disabled:opacity-20" type="button" aria-label="Atualizar"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-px rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.015]">
            {metrics.map(m => (<div key={m.label} className="px-5 py-4 text-center bg-[#080d16]"><span className={`text-[26px] font-bold tabular-nums block leading-none ${typeof m.value === 'number' && m.value > 0 ? 'text-white/90' : 'text-white/25'}`}>{m.value}</span><span className="text-[11px] text-white/45 mt-1.5 block">{m.label}</span></div>))}
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-500/12 bg-rose-500/[0.025] px-6 py-3.5 text-[13px] text-rose-400/80 flex items-center gap-3"><AlertCircle size={15} />{error}</div>}

      {/* ═══ NAV ═══ */}
      <nav className="flex gap-1.5">
        {([
          { id: 'cockpit' as Tab, label: 'Cockpit', icon: Activity, badge: patternHits.length },
          { id: 'patterns' as Tab, label: 'Padrões', icon: Target, badge: activePatternCount },
          { id: 'scanner' as Tab, label: 'Scanner', icon: Eye, badge: scannerEntries.length },
          { id: 'alerts' as Tab, label: 'Alertas', icon: Zap, badge: triggeredTodayCount },
          { id: 'performance' as Tab, label: 'Performance', icon: BarChart3, badge: 0 },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] font-medium transition-all ${activeTab === tab.id ? 'text-white bg-white/[0.06] border border-white/[0.1]' : 'text-white/45 hover:text-white/70 border border-transparent hover:bg-white/[0.025]'}`} type="button">
            <tab.icon size={15} />{tab.label}
            {tab.badge > 0 && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${activeTab === tab.id ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/[0.06] text-white/45'}`}>{tab.badge}</span>}
          </button>
        ))}
      </nav>

      {/* ═══ CONTENT ═══ */}
      {activeTab === 'cockpit' && <CockpitView hasIntelligence={hasIntelligence} decisionMatch={decisionMatch} decisionHit={decisionHit} decisionDiscovery={decisionDiscovery} patternHits={patternHits} discoveries={discoveries} changes={changes} fixtures={fixtures} openMatch={openMatch} isAdvanced={isAdvanced} activePatternCount={activePatternCount} enabledCount={enabledCount} triggeredAlerts={getRecentTriggered(5)} onGoToPatterns={() => setActiveTab('patterns')} navigate={navigate} templates={templates} createFromTemplate={createFromTemplate} />}
      {activeTab === 'patterns' && <PatternsView patterns={patterns} templates={templates} createFromTemplate={createFromTemplate} createPattern={createPattern} updatePattern={updatePattern} togglePattern={togglePattern} deletePattern={deletePattern} isAdvanced={isAdvanced} showBuilder={showBuilder} setShowBuilder={setShowBuilder} discoveryConfig={discoveryConfig} updateDiscoveryConfig={updateDiscoveryConfig} triggeredAlerts={triggeredAlerts} />}
      {activeTab === 'scanner' && <ScannerView hasIntelligence={hasIntelligence} entries={scannerEntries} openMatch={openMatch} isAdvanced={isAdvanced} onGoToPatterns={() => setActiveTab('patterns')} />}
      {activeTab === 'alerts' && <AlertsView triggeredAlerts={getRecentTriggered(30)} isAdvanced={isAdvanced} openMatch={openMatch} fixtures={fixtures} navigate={navigate} />}
      {activeTab === 'performance' && <PerformanceView patterns={patterns} triggeredAlerts={triggeredAlerts} isAdvanced={isAdvanced} />}
    </div>
  )
}


// ═══ COCKPIT ═══
function CockpitView({ hasIntelligence, decisionMatch, decisionHit, decisionDiscovery, patternHits, discoveries, changes, fixtures, openMatch, isAdvanced, activePatternCount, enabledCount, triggeredAlerts, onGoToPatterns, navigate, templates, createFromTemplate }: { hasIntelligence: boolean; decisionMatch: LiveFixture | null; decisionHit: PatternHit | null; decisionDiscovery: AutoDiscovery | null; patternHits: PatternHit[]; discoveries: AutoDiscovery[]; changes: ChangeEvent[]; fixtures: LiveFixture[]; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; activePatternCount: number; enabledCount: number; triggeredAlerts: TriggeredAlert[]; onGoToPatterns: () => void; navigate: (path: string) => void; templates: PatternTemplate[]; createFromTemplate: (id: string) => Pattern | null }) {
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorites()

  // NO INTELLIGENCE — show premium onboarding
  if (!hasIntelligence) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <section className="rounded-2xl border border-white/[0.05] bg-gradient-to-b from-white/[0.015] to-transparent p-8 xl:p-10">
          <h2 className="text-[22px] font-bold text-white/80 mb-2">Motor pronto para operar</h2>
          <p className="text-[14px] text-white/40 mb-6 max-w-[500px] leading-relaxed">Configure padrões manuais ou ative o motor automático para o GoalSense começar a procurar sinais reais nas partidas ao vivo.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {templates.slice(0, 4).map(t => (
              <button key={t.id} onClick={() => createFromTemplate(t.id)} className="text-left rounded-xl border border-white/[0.05] bg-white/[0.008] px-5 py-4 hover:border-white/[0.1] hover:bg-white/[0.015] transition-all group" type="button">
                <span className="text-[13px] text-white/60 group-hover:text-white/80 block font-medium">{t.name}</span>
                <span className="text-[11px] text-white/30 block mt-1">{t.description}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={onGoToPatterns} className="px-5 py-2.5 rounded-xl text-[12px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors" type="button">Ver todos os templates</button>
            <button onClick={onGoToPatterns} className="px-5 py-2.5 rounded-xl text-[12px] font-medium text-white/40 border border-white/[0.06] hover:text-white/60 transition-colors" type="button">Criar padrão manual</button>
          </div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-5">
            <h4 className="text-[11px] font-semibold text-white/40 mb-2">Status</h4>
            <p className="text-[12px] text-white/50">Monitorando {fixtures.length} partidas</p>
            <p className="text-[12px] text-white/30 mt-1">{fixtures.filter(isLiveFx).length} ao vivo agora</p>
          </div>
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-5">
            <h4 className="text-[11px] font-semibold text-white/40 mb-2">Ações</h4>
            <div className="space-y-1">
              <SideAction label="Explorar partidas" onClick={() => navigate('/app/matches')} />
              <SideAction label="Live Radar" onClick={() => navigate('/app/live')} />
              {enabledCount === 0 && <SideAction label="Criar alertas" onClick={() => navigate('/app/alerts')} />}
            </div>
          </div>
        </aside>
      </div>
    )
  }

  // HAS INTELLIGENCE — show cockpit
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
      <div className="space-y-5">
        {/* DECISÃO AGORA */}
        {decisionMatch ? (
          <section className="group relative rounded-2xl overflow-hidden cursor-pointer" onClick={() => openMatch(decisionMatch)} role="button">
            <div className="absolute inset-0 bg-gradient-to-br from-[#070b13] via-[#090d17] to-[#0b101a]" />
            <div className="absolute inset-0 border border-white/[0.05] rounded-2xl group-hover:border-white/[0.1] transition-colors duration-300" />
            {decisionHit && <div className="absolute top-0 left-1/3 w-[200px] h-[60px] bg-amber-500/[0.015] rounded-full blur-[40px]" />}
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">{decisionHit && <div className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.3)] animate-pulse" />}<span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">{decisionHit ? 'Padrão detectado' : decisionDiscovery ? 'Descoberta automática' : 'Sinal'}</span></div>
                <div className="flex items-center gap-2">
                  <FavoriteButton active={isFavoriteMatch(buildCanonicalMatchId(decisionMatch.homeTeam.name, decisionMatch.awayTeam.name, decisionMatch.date))} onClick={(e) => { e.stopPropagation(); toggleFavoriteMatch({ canonicalMatchId: buildCanonicalMatchId(decisionMatch.homeTeam.name, decisionMatch.awayTeam.name, decisionMatch.date), homeTeam: decisionMatch.homeTeam.name, awayTeam: decisionMatch.awayTeam.name, competition: decisionMatch.league.name, utcDate: decisionMatch.date }) }} size={13} />
                  <span className={`text-[11px] font-medium px-2.5 py-1 rounded-lg ${isLiveFx(decisionMatch) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' : 'text-white/30'}`}>{isLiveFx(decisionMatch) ? `${decisionMatch.status.elapsed || ''}'` : new Date(decisionMatch.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col items-center gap-2 w-[110px]"><ClubLogo src={decisionMatch.homeTeam.logo} name={decisionMatch.homeTeam.name} size={52} /><span className="text-[13px] font-medium text-white/70 text-center leading-tight">{decisionMatch.homeTeam.name}</span></div>
                <div className="flex flex-col items-center gap-1.5"><div className="flex items-baseline gap-3"><span className="text-[42px] font-bold tabular-nums text-white leading-none">{decisionMatch.score.home ?? '-'}</span><span className="text-[14px] text-white/15">:</span><span className="text-[42px] font-bold tabular-nums text-white leading-none">{decisionMatch.score.away ?? '-'}</span></div>{isLiveFx(decisionMatch) && <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.3)] animate-pulse" />}<span className="text-[11px] text-white/25 mt-1">{decisionMatch.league.name}</span></div>
                <div className="flex flex-col items-center gap-2 w-[110px]"><ClubLogo src={decisionMatch.awayTeam.logo} name={decisionMatch.awayTeam.name} size={52} /><span className="text-[13px] font-medium text-white/45 text-center leading-tight">{decisionMatch.awayTeam.name}</span></div>
              </div>
              <div className="mt-5 pt-4 border-t border-white/[0.04]">
                {decisionHit ? (
                  <div><div className="flex items-center gap-2 mb-2"><span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${decisionHit.severity === 'critical' ? 'bg-rose-500/10 text-rose-400/70' : 'bg-amber-500/8 text-amber-400/60'}`}>{decisionHit.patternName}</span><span className="text-[12px] text-white/40 tabular-nums">{decisionHit.confidence}%</span></div><p className="text-[12px] text-white/50 leading-relaxed">{decisionHit.reasons.slice(0, 4).join(' · ')}</p><div className="flex items-center justify-between mt-2"><span className="text-[11px] text-white/30">Ação: Abrir análise</span><span className="text-[12px] text-cyan-400/60 group-hover:text-cyan-400 font-medium flex items-center gap-1 transition-colors">Abrir <ChevronRight size={12} /></span></div>{isAdvanced && <div className="mt-2 text-[10px] text-white/20 font-mono">cond:{decisionHit.matchedConditions}/{decisionHit.totalConditions} · imp:{getMatchImportanceScore(toScoring(decisionMatch))}</div>}</div>
                ) : decisionDiscovery ? (
                  <div><p className="text-[13px] text-white/55 mb-1">{decisionDiscovery.insight}</p><p className="text-[11px] text-white/30">{decisionDiscovery.evidence} · {decisionDiscovery.confidence}%</p><div className="flex justify-end mt-2"><span className="text-[12px] text-cyan-400/50 group-hover:text-cyan-400 font-medium flex items-center gap-1 transition-colors">Abrir <ChevronRight size={12} /></span></div></div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/[0.05] bg-gradient-to-br from-white/[0.015] to-transparent p-8 text-center">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-3"><Eye size={16} className="text-white/45" /></div>
            <p className="text-[15px] text-white/85 font-semibold">Nenhum sinal detectado agora</p>
            <p className="text-[12px] text-white/55 mt-1">O motor está monitorando <span className="text-white/85 font-bold">{fixtures.length}</span> {fixtures.length === 1 ? 'partida' : 'partidas'} com <span className="text-white/85 font-bold">{activePatternCount}</span> {activePatternCount === 1 ? 'radar ativo' : 'radares ativos'}.</p>
          </section>
        )}

        {/* PADRÕES BATENDO */}
        {patternHits.length > 0 && (<section><h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-amber-400/60 mb-3 flex items-center gap-2"><Zap size={12} />Padrões batendo</h3><div className="space-y-2">{patternHits.slice(0, 5).map((hit, i) => (<div key={`${hit.patternId}-${hit.fixtureId}-${i}`} onClick={() => openMatch(hit.fixture)} className="group flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.008] px-5 py-3 cursor-pointer hover:border-white/[0.08] transition-all" role="button"><span className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded-lg shrink-0 ${hit.severity === 'critical' ? 'bg-rose-500/10 text-rose-400/70' : hit.severity === 'attention' ? 'bg-amber-500/8 text-amber-400/60' : 'bg-white/[0.04] text-white/35'}`}>{hit.severity === 'critical' ? 'CRÍTICO' : hit.severity === 'attention' ? 'ATENÇÃO' : 'INFO'}</span><ClubLogo src={hit.fixture.homeTeam.logo} name={hit.fixture.homeTeam.name} size={18} /><span className="text-[13px] text-white/65 truncate flex-1">{hit.fixture.homeTeam.name} {hit.fixture.score.home ?? '-'}:{hit.fixture.score.away ?? '-'} {hit.fixture.awayTeam.name}</span><span className="text-[11px] text-white/35 shrink-0">{hit.patternName}</span><span className="text-[11px] text-white/25 tabular-nums shrink-0">{hit.confidence}%</span><ChevronRight size={12} className="text-white/15 group-hover:text-white/40 shrink-0" /></div>))}</div></section>)}

        {/* DISCOVERIES */}
        {discoveries.length > 0 && patternHits.length === 0 && (<section><h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-cyan-400/50 mb-3 flex items-center gap-2"><Sparkles size={12} />Descobertas do motor automático</h3><div className="space-y-2">{discoveries.slice(0, 4).map(d => (<div key={d.id} onClick={() => openMatch(d.fixture)} className="group flex items-center gap-3 rounded-xl border border-white/[0.03] bg-white/[0.005] px-5 py-3 cursor-pointer hover:border-white/[0.07] transition-all" role="button"><span className="text-[13px] text-white/55 flex-1">{d.insight}</span><span className="text-[11px] text-white/25 shrink-0">{d.confidence}%</span><ChevronRight size={12} className="text-white/10 group-hover:text-white/25 shrink-0" /></div>))}</div></section>)}
      </div>

      {/* SIDEBAR */}
      <aside className="space-y-4">
        {changes.length > 0 && (<div className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-4"><h4 className="text-[11px] font-semibold text-amber-400/50 mb-2.5">Mudanças</h4><div className="space-y-2">{changes.slice(0, 4).map(c => (<div key={c.id} className={`rounded-lg px-3 py-2 border-l-2 ${c.type === 'score_change' ? 'border-l-emerald-400/50 bg-emerald-500/[0.02]' : c.type === 'final_phase' ? 'border-l-amber-400/40 bg-amber-500/[0.02]' : 'border-l-white/[0.1] bg-white/[0.008]'}`}><span className="text-[11px] text-white/45">{c.text}</span></div>))}</div></div>)}
        {triggeredAlerts.length > 0 && (<div className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-4"><h4 className="text-[11px] font-semibold text-rose-400/50 mb-2.5">Alertas disparados</h4><div className="space-y-2">{triggeredAlerts.slice(0, 3).map(t => (<div key={t.id} className="rounded-lg px-3 py-2 bg-white/[0.008] border border-white/[0.03]"><span className="text-[11px] text-white/50 block">{t.patternName}</span><span className="text-[10px] text-white/30">{t.homeTeam} x {t.awayTeam} · {t.confidence}%</span></div>))}</div></div>)}
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-4"><h4 className="text-[11px] font-semibold text-white/30 mb-2.5">Ações</h4><div className="space-y-1"><SideAction label="Configurar padrões" onClick={onGoToPatterns} /><SideAction label="Explorar partidas" onClick={() => navigate('/app/matches')} /><SideAction label="Live Radar" onClick={() => navigate('/app/live')} />{enabledCount === 0 && <SideAction label="Criar alertas" onClick={() => navigate('/app/alerts')} />}</div></div>
      </aside>
    </div>
  )
}

function SideAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors group" type="button"><span className="text-[11px] text-white/40 group-hover:text-white/60">{label}</span><ChevronRight size={10} className="text-white/15 group-hover:text-white/30" /></button>
}


// ═══ PATTERN STUDIO ═══════════════════════════════════════════════════════
// Helpers
const COND_LABELS: Record<PatternConditionType, string> = { is_live: 'Jogo ao vivo', is_final_phase: 'Reta final (70\'+)', is_pre_live: 'Começa em breve', minute_between: 'Minuto entre', score_tied: 'Placar empatado', score_diff_lte: 'Diferença gols ≤', favorite_involved: 'Favorito envolvido', shots_recent_gte: 'Finalizações ≥', shots_on_target_gte: 'No alvo ≥', corners_gte: 'Escanteios ≥', cards_gte: 'Cartões ≥', possession_gte: 'Posse ≥', goals_total_gte: 'Gols totais ≥', goals_total_lte: 'Gols totais ≤', away_shots_on_target_gte: 'Visitante no alvo ≥', away_goals_gte: 'Gols visitante ≥', away_possession_gte: 'Posse visitante ≥' }

function formatConditionHuman(c: PatternCondition): string {
  const v = (k: string) => Number(c.params[k] ?? 0)
  switch (c.type) {
    case 'is_live': return 'Partida ao vivo'
    case 'is_final_phase': return 'Reta final (após 70\')'
    case 'is_pre_live': return `Começa em até ${v('minutes') || 60} minutos`
    case 'minute_between': return `Entre ${v('min')}\' e ${v('max')}\''`
    case 'score_tied': return 'Placar empatado'
    case 'score_diff_lte': return v('maxDiff') === 0 ? 'Placar empatado' : `Diferença no placar até ${v('maxDiff')} gol${v('maxDiff') === 1 ? '' : 's'}`
    case 'favorite_involved': return 'Favorito envolvido'
    case 'shots_recent_gte': return `Pelo menos ${v('value')} finalizações recentes`
    case 'shots_on_target_gte': return `Pelo menos ${v('value')} chutes no alvo`
    case 'corners_gte': return `${v('value')}+ escanteios`
    case 'cards_gte': return `${v('value')}+ cartões`
    case 'possession_gte': return `Posse acima de ${v('value')}%`
    case 'goals_total_gte': return `${v('value')}+ gols na partida`
    case 'goals_total_lte': return `Até ${v('value')} gol${v('value') === 1 ? '' : 's'} na partida`
    case 'away_shots_on_target_gte': return `Visitante com ${v('value')}+ chutes no alvo`
    case 'away_goals_gte': return `Visitante com ${v('value')}+ gols`
    case 'away_possession_gte': return `Visitante com posse acima de ${v('value')}%`
  }
}

type TemplateCategory = 'pressao' | 'reta_final' | 'favoritos' | 'gols' | 'disciplina' | 'visitante'

function categorizeTemplate(t: PatternTemplate): TemplateCategory {
  const id = t.id.toLowerCase()
  if (id.includes('card')) return 'disciplina'
  if (id.includes('away') || id.includes('dangerous_away') || id.includes('visitante')) return 'visitante'
  if (id.includes('favorite') || id.includes('underdog')) return 'favoritos'
  if (id.includes('open') || id.includes('over') || id.includes('locked')) return 'gols'
  if (id.includes('final') || id.includes('late') || id.includes('hot_second')) return 'reta_final'
  return 'pressao'
}
const CATEGORY_LABELS: Record<TemplateCategory, string> = { pressao: 'Pressão ofensiva', reta_final: 'Reta final', favoritos: 'Favoritos e zebras', gols: 'Gols', disciplina: 'Disciplina', visitante: 'Visitante / mandante' }

// ═══ MODAL SHELL — premium overlay rendered via portal so it escapes any
// stacking context (navbar uses sticky+backdrop-blur which creates one).
// z-[1000] sits well above the navbar (z-50) and any sidebar.
function ModalShell({ open, onClose, title, subtitle, headerExtra, children, footer, maxWidth = 'max-w-3xl' }: { open: boolean; onClose: () => void; title: string; subtitle?: string; headerExtra?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; maxWidth?: string }) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  if (typeof document === 'undefined') return null

  const titleId = `modal-title-${title.replace(/\s+/g, '-').toLowerCase()}`
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
      <div className={`relative w-full ${maxWidth} max-h-[calc(100vh-24px)] sm:max-h-[calc(100vh-48px)] flex flex-col rounded-[22px] sm:rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-[#0a0d14] via-[#0b1018] to-[#0c1322] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] overflow-hidden animate-scaleIn`}>
        <div className="px-6 sm:px-7 pt-5 pb-4 sm:pt-6 sm:pb-5 border-b border-white/[0.06] flex items-start gap-4 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 id={titleId} className="text-[16px] sm:text-[18px] font-bold text-white/95 tracking-tight">{title}</h3>
            {subtitle && <p className="text-[12px] text-white/55 mt-1 leading-relaxed">{subtitle}</p>}
            {headerExtra && <div className="mt-3">{headerExtra}</div>}
          </div>
          <button onClick={onClose} type="button" className="h-9 w-9 rounded-xl flex items-center justify-center text-white/55 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-all shrink-0" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 sm:px-7 py-5 sidebar-scroll min-h-0">{children}</div>
        {footer && <div className="px-6 sm:px-7 py-3.5 border-t border-white/[0.06] bg-white/[0.012] flex items-center gap-2 justify-end flex-wrap shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

// ═══ PREMIUM TOGGLE
function PremiumToggle({ checked, onChange, ariaLabel, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; ariaLabel?: string; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6'
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const pos = size === 'sm' ? (checked ? 'translate-x-[18px]' : 'translate-x-[2px]') : (checked ? 'translate-x-[22px]' : 'translate-x-[2px]')
  return (
    <button type="button" role="switch" aria-checked={checked} aria-pressed={checked} aria-label={ariaLabel} onClick={() => onChange(!checked)} className={`relative ${w} rounded-full transition-all ${checked ? 'bg-gradient-to-r from-emerald-500/40 to-cyan-500/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_-4px_rgba(52,211,153,0.4)]' : 'bg-white/[0.06] border border-white/[0.05]'}`}>
      <span className={`absolute top-1/2 -translate-y-1/2 ${knob} rounded-full transition-all shadow-[0_2px_6px_-2px_rgba(0,0,0,0.6)] ${pos} ${checked ? 'bg-emerald-300' : 'bg-white/55'}`} />
    </button>
  )
}

// ═══ TOGGLE WITH LABEL
function ToggleWithLabel({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <PremiumToggle checked={checked} onChange={onChange} ariaLabel={label} size="sm" />
      <div className="flex-1 min-w-0 -mt-0.5">
        <span className="text-[12px] text-white/85 font-medium block leading-tight">{label}</span>
        {hint && <span className="text-[11px] text-white/45 leading-snug block mt-0.5">{hint}</span>}
      </div>
    </label>
  )
}

// ═══ CONDITIONS EDITOR — shared between TemplateConfigModal and CustomPatternModal
// Organizes the "add condition" buttons into categories so the user isn't
// faced with a wall of unorganized chips.
const COND_CATEGORIES: { label: string; types: PatternConditionType[] }[] = [
  { label: 'Tempo', types: ['is_live', 'is_pre_live', 'minute_between', 'is_final_phase'] },
  { label: 'Placar', types: ['score_tied', 'score_diff_lte', 'goals_total_gte', 'goals_total_lte'] },
  { label: 'Ataque', types: ['shots_recent_gte', 'shots_on_target_gte', 'corners_gte', 'away_shots_on_target_gte'] },
  { label: 'Disciplina', types: ['cards_gte'] },
  { label: 'Contexto', types: ['favorite_involved', 'possession_gte', 'away_goals_gte', 'away_possession_gte'] },
]

function ConditionsEditor({ conditions, onChange }: { conditions: PatternCondition[]; onChange: (c: PatternCondition[]) => void }) {
  const addCond = (type: PatternConditionType) => {
    const params: Record<string, number | string | boolean> = {}
    if (type === 'minute_between') { params.min = 60; params.max = 90 }
    else if (type === 'score_diff_lte') { params.maxDiff = 1 }
    else if (type === 'goals_total_lte') { params.value = 1 }
    else if (type === 'is_pre_live') { params.minutes = 60 }
    else if (['shots_recent_gte', 'shots_on_target_gte', 'corners_gte', 'cards_gte', 'goals_total_gte', 'away_shots_on_target_gte', 'away_goals_gte'].includes(type)) { params.value = 3 }
    else if (['possession_gte', 'away_possession_gte'].includes(type)) { params.value = 58 }
    onChange([...conditions, { type, params }])
  }
  const updateParam = (idx: number, key: string, val: number) => {
    onChange(conditions.map((c, i) => i === idx ? { ...c, params: { ...c.params, [key]: val } } : c))
  }
  const removeCond = (idx: number) => onChange(conditions.filter((_, j) => j !== idx))
  const usedTypes = new Set(conditions.map(c => c.type))

  return (
    <div>
      <div className="space-y-2">
        {conditions.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] px-4 py-5 text-center">
            <p className="text-[12px] text-white/65 font-medium">Nenhuma condição configurada</p>
            <p className="text-[11px] text-white/45 mt-0.5">Adicione condições abaixo para o radar disparar.</p>
          </div>
        )}
        {conditions.map((c, i) => {
          const hasValue = c.params.value !== undefined || c.params.maxDiff !== undefined
          const hasMinMax = c.params.min !== undefined
          return (
            <div key={i} className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-white/95 flex-1 font-semibold">{COND_LABELS[c.type] || c.type}</span>
                {hasMinMax && (
                  <div className="flex items-center gap-1.5">
                    <input type="number" value={Number(c.params.min) || 0} onChange={e => updateParam(i, 'min', Number(e.target.value))} className="w-14 h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/95 text-center tabular-nums outline-none focus:border-cyan-400/40" />
                    <span className="text-[10px] text-white/45 font-medium">até</span>
                    <input type="number" value={Number(c.params.max) || 90} onChange={e => updateParam(i, 'max', Number(e.target.value))} className="w-14 h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/95 text-center tabular-nums outline-none focus:border-cyan-400/40" />
                  </div>
                )}
                {hasValue && (
                  <input type="number" value={Number(c.params.value ?? c.params.maxDiff) || 0} onChange={e => updateParam(i, c.params.value !== undefined ? 'value' : 'maxDiff', Number(e.target.value))} className="w-16 h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/95 text-center tabular-nums outline-none focus:border-cyan-400/40" />
                )}
                <button onClick={() => removeCond(i)} type="button" className="text-white/45 hover:text-rose-300 transition-colors px-1 text-[14px]" aria-label="Remover condição">×</button>
              </div>
              <p className="text-[11px] text-white/65 mt-1.5 leading-snug italic">{formatConditionHuman(c)}</p>
            </div>
          )
        })}
      </div>
      <div className="mt-4 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">Adicionar condição</p>
        {COND_CATEGORIES.map(cat => {
          const available = cat.types.filter(t => !usedTypes.has(t))
          if (available.length === 0) return null
          return (
            <div key={cat.label}>
              <span className="text-[10px] text-white/45 uppercase tracking-wider font-semibold block mb-1.5">{cat.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {available.map(t => (
                  <button key={t} onClick={() => addCond(t)} type="button" className="text-[11px] text-white/65 hover:text-white/95 bg-white/[0.025] hover:bg-white/[0.05] px-3 py-1.5 rounded-lg border border-white/[0.05] hover:border-white/[0.1] transition-all">+ {COND_LABELS[t]}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══ SEVERITY PICKER
function SeverityPicker({ value, onChange }: { value: 'critical' | 'attention' | 'info'; onChange: (v: 'critical' | 'attention' | 'info') => void }) {
  const opts: { v: 'critical' | 'attention' | 'info'; label: string; cls: string }[] = [
    { v: 'critical', label: 'Crítico', cls: 'border-rose-400/30 text-rose-300 bg-rose-500/12' },
    { v: 'attention', label: 'Atenção', cls: 'border-amber-400/30 text-amber-300 bg-amber-500/12' },
    { v: 'info', label: 'Informação', cls: 'border-cyan-400/25 text-cyan-300 bg-cyan-500/10' },
  ]
  return (
    <div className="flex gap-2">
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} type="button" className={`px-3.5 py-2 rounded-xl text-[12px] font-semibold border transition-all ${value === o.v ? o.cls : 'border-white/[0.06] text-white/45 hover:text-white/75 hover:border-white/[0.1]'}`}>{o.label}</button>
      ))}
    </div>
  )
}

// ═══ ACTION PICKER
function ActionPicker({ value, onChange }: { value: 'register_alert' | 'suggest_only' | 'highlight'; onChange: (v: 'register_alert' | 'suggest_only' | 'highlight') => void }) {
  const opts: { v: 'register_alert' | 'suggest_only' | 'highlight'; label: string; hint: string }[] = [
    { v: 'register_alert', label: 'Registrar alerta', hint: 'Vai para /app/alerts e é acompanhado pelo motor de resolução.' },
    { v: 'suggest_only', label: 'Apenas sugerir', hint: 'Aparece no Scanner e Cockpit, mas não dispara alerta.' },
    { v: 'highlight', label: 'Destacar no Scanner', hint: 'Apenas marca visualmente sem registrar nada.' },
  ]
  return (
    <div className="space-y-2">
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} type="button" className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${value === o.v ? 'border-cyan-400/30 bg-cyan-500/8' : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1] hover:bg-white/[0.025]'}`}>
          <span className={`mt-0.5 h-3.5 w-3.5 rounded-full shrink-0 border-2 ${value === o.v ? 'border-cyan-400 bg-cyan-500/40' : 'border-white/25'}`}>{value === o.v && <span className="block h-full w-full rounded-full bg-cyan-300 scale-50" />}</span>
          <div className="flex-1 min-w-0">
            <span className={`text-[12px] font-bold block ${value === o.v ? 'text-white/95' : 'text-white/75'}`}>{o.label}</span>
            <span className="text-[11px] text-white/55 leading-snug block mt-0.5">{o.hint}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

// ═══ SCOPE PICKER
function ScopePicker({ scope, onChange }: { scope: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams'; onChange: (s: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams') => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {([
        ['all', 'Todos os jogos'],
        ['favorites_only', 'Apenas favoritos'],
      ] as const).map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} type="button" className={`px-3.5 py-2 rounded-xl text-[12px] font-semibold border transition-all ${scope === v ? 'border-white/[0.18] text-white bg-white/[0.06]' : 'border-white/[0.06] text-white/55 hover:text-white/85 hover:border-white/[0.1]'}`}>{label}</button>
      ))}
      <span className="px-3.5 py-2 rounded-xl text-[11px] font-medium border border-dashed border-white/[0.08] text-white/35">Ligas/times específicos · em breve</span>
    </div>
  )
}

// ═══ TEMPLATE CONFIG MODAL
function TemplateConfigModal({ open, template, existingPattern, onClose, onSave }: { open: boolean; template: PatternTemplate | null; existingPattern: Pattern | null; onClose: () => void; onSave: (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void }) {
  const initial = existingPattern || (template ? {
    name: template.name, description: template.description,
    conditions: [...template.conditions], severity: template.severity,
    status: 'active' as const, isTemplate: true, templateId: template.id,
    scope: 'all' as const, scopeFilter: undefined as string[] | undefined,
    minConfidence: 50, action: 'register_alert' as const,
    maxTriggersPerMatch: 2, antiDuplicateWindow: 5,
  } : null)

  const [conditions, setConditions] = useState<PatternCondition[]>(initial?.conditions || [])
  const [severity, setSeverity] = useState<'critical' | 'attention' | 'info'>(initial?.severity || 'attention')
  const [action, setAction] = useState<'register_alert' | 'suggest_only' | 'highlight'>(initial?.action || 'register_alert')
  const [scope, setScope] = useState<'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams'>(initial?.scope || 'all')
  const [minConf, setMinConf] = useState<number>(initial?.minConfidence ?? 50)

  useEffect(() => {
    if (!open) return
    setConditions(initial?.conditions || [])
    setSeverity(initial?.severity || 'attention')
    setAction(initial?.action || 'register_alert')
    setScope(initial?.scope || 'all')
    setMinConf(initial?.minConfidence ?? 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, existingPattern?.id])

  if (!open || !template) return null

  const cat = categorizeTemplate(template)

  const buildPatternData = (status: 'active' | 'paused'): Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: template.name,
    description: template.description,
    conditions,
    severity,
    status,
    isTemplate: true,
    templateId: template.id,
    scope,
    scopeFilter: undefined,
    minConfidence: minConf,
    action,
    maxTriggersPerMatch: 2,
    antiDuplicateWindow: 5,
  })

  const handleSaveActive = () => { onSave(buildPatternData('active')); onClose() }
  const handleSavePaused = () => { onSave(buildPatternData('paused')); onClose() }
  const canSave = conditions.length > 0

  return (
    <ModalShell open={open} onClose={onClose} title={template.name} subtitle={template.description} maxWidth="max-w-[1120px]"
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-white/[0.05] text-white/65 border border-white/[0.08]">Template GoalSense</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-white/[0.04] text-white/65 border border-white/[0.07]">{CATEGORY_LABELS[cat]}</span>
          <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md border ${severity === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : severity === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'}`}>{severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Info'}</span>
          {existingPattern && <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md border ${existingPattern.status === 'active' ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : 'bg-white/[0.05] text-white/65 border-white/[0.07]'}`}>{existingPattern.status === 'active' ? 'Ativo' : 'Pausado'}</span>}
        </div>
      }
      footer={
        <>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors">Cancelar</button>
          <button onClick={handleSavePaused} disabled={!canSave} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar pausado</button>
          <button onClick={handleSaveActive} disabled={!canSave} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-bold bg-gradient-to-r from-cyan-500/22 to-blue-500/22 text-cyan-200 border border-cyan-400/30 hover:from-cyan-500/32 hover:to-blue-500/32 disabled:opacity-30 disabled:cursor-not-allowed transition-all">{existingPattern ? 'Salvar e ativar' : 'Salvar e ativar'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT — explanation + conditions (7 cols on desktop) */}
        <div className="lg:col-span-7 space-y-5">
          <Section title="O que este radar procura">
            <p className="text-[12px] text-white/75 leading-relaxed">{template.description}</p>
            {conditions.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {conditions.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-white/65"><span className="mt-1 h-1 w-1 rounded-full bg-cyan-400/70 shrink-0" /><span>{formatConditionHuman(c)}</span></li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={`Condições (${conditions.length})`} hint="Edite os números, remova ou adicione condições. Todas precisam ser verdadeiras para o radar disparar.">
            <ConditionsEditor conditions={conditions} onChange={setConditions} />
            {!canSave && <p className="text-[11px] text-amber-300 mt-3">É preciso ao menos uma condição para salvar.</p>}
          </Section>
        </div>

        {/* RIGHT — config panel (5 cols on desktop) */}
        <aside className="lg:col-span-5 space-y-5">
          <Section title="Severidade">
            <SeverityPicker value={severity} onChange={setSeverity} />
          </Section>
          <Section title="Escopo">
            <ScopePicker scope={scope} onChange={setScope} />
          </Section>
          <Section title="Ação ao detectar">
            <ActionPicker value={action} onChange={setAction} />
          </Section>
          <Section title="Confiança mínima" hint="Quanto maior, menos alertas falsos e mais rigor.">
            <div className="flex items-center gap-3">
              <input type="range" min={20} max={95} value={minConf} onChange={e => setMinConf(Number(e.target.value))} className="flex-1 accent-cyan-400" />
              <input type="number" value={minConf} onChange={e => setMinConf(Number(e.target.value))} className="w-20 h-9 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/95 tabular-nums text-center outline-none focus:border-cyan-400/40" min={20} max={95} />
              <span className="text-[12px] text-white/65 font-semibold">%</span>
            </div>
          </Section>
          <RadarPreview name={template.name} severity={severity} scope={scope} action={action} minConf={minConf} conditions={conditions} />
        </aside>
      </div>
    </ModalShell>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 mb-2.5">{title}</h4>
      {hint && <p className="text-[11px] text-white/50 mb-2.5 leading-snug">{hint}</p>}
      {children}
    </section>
  )
}

// ═══ RADAR PREVIEW — auditable summary of how the radar will be evaluated
function RadarPreview({ name, severity, scope, action, minConf, conditions }: { name: string; severity: 'critical' | 'attention' | 'info'; scope: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams'; action: 'register_alert' | 'suggest_only' | 'highlight'; minConf: number; conditions: PatternCondition[] }) {
  const sevLabel = severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Info'
  const scopeLabel = scope === 'favorites_only' ? 'apenas favoritos' : 'todos os jogos'
  const actionLabel = action === 'register_alert' ? 'registra alerta em /app/alerts' : action === 'suggest_only' ? 'apenas sugere no Cockpit/Scanner' : 'destaca no Scanner'
  const willResolve = action === 'register_alert'
  return (
    <section className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.05] via-blue-500/[0.025] to-transparent px-4 py-3.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300/85 mb-2">Resumo do radar</h4>
      <p className="text-[12px] text-white/85 font-semibold leading-snug">{name || 'Sem nome'}</p>
      <p className="text-[11px] text-white/65 leading-snug mt-1">
        Avaliado em <span className="text-white/85 font-semibold">{scopeLabel}</span> com confiança ≥ <span className="text-white/85 font-bold tabular-nums">{minConf}%</span>. Ao detectar, <span className="text-white/85 font-semibold">{actionLabel}</span>.
      </p>
      {conditions.length > 0 && (
        <div className="mt-2.5">
          <span className="text-[10px] text-white/55 uppercase tracking-wider font-semibold block mb-1">Quando todas forem verdadeiras:</span>
          <ul className="space-y-0.5">
            {conditions.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/75"><span className="mt-1 h-1 w-1 rounded-full bg-cyan-400/70 shrink-0" /><span>{formatConditionHuman(c)}</span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-cyan-400/10">
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.05] text-white/65 border border-white/[0.07]">{sevLabel}</span>
        {willResolve && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-400/15">Acompanhado pela resolução</span>}
        {!willResolve && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.05] text-white/55 border border-white/[0.07]">Não dispara alerta</span>}
      </div>
    </section>
  )
}

// ═══ CUSTOM PATTERN MODAL — wizard with sidebar steps
type CustomStep = 'identity' | 'scope' | 'conditions' | 'action' | 'confidence' | 'review'

function CustomPatternModal({ open, initial, onClose, onSave }: { open: boolean; initial: Pattern | null; onClose: () => void; onSave: (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void }) {
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.description || '')
  const [severity, setSeverity] = useState<'critical' | 'attention' | 'info'>(initial?.severity || 'attention')
  const [scope, setScope] = useState<'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams'>(initial?.scope || 'all')
  const [minConf, setMinConf] = useState(initial?.minConfidence ?? 50)
  const [action, setAction] = useState<'register_alert' | 'suggest_only' | 'highlight'>(initial?.action || 'register_alert')
  const [conditions, setConditions] = useState<PatternCondition[]>(initial?.conditions || [{ type: 'is_live', params: {} }])
  const [step, setStep] = useState<CustomStep>('identity')

  useEffect(() => {
    if (!open) return
    setName(initial?.name || '')
    setDesc(initial?.description || '')
    setSeverity(initial?.severity || 'attention')
    setScope(initial?.scope || 'all')
    setMinConf(initial?.minConfidence ?? 50)
    setAction(initial?.action || 'register_alert')
    setConditions(initial?.conditions || [{ type: 'is_live', params: {} }])
    setStep('identity')
  }, [open, initial])

  if (!open) return null

  const hasName = name.trim().length > 0
  const hasConditions = conditions.length > 0
  const canSave = hasName && hasConditions
  const buildData = (status: 'active' | 'paused'): Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: name.trim(),
    description: desc.trim(),
    conditions,
    severity,
    status,
    isTemplate: initial?.isTemplate || false,
    templateId: initial?.templateId,
    scope,
    scopeFilter: undefined,
    minConfidence: minConf,
    action,
    maxTriggersPerMatch: initial?.maxTriggersPerMatch ?? 2,
    antiDuplicateWindow: initial?.antiDuplicateWindow ?? 5,
  })

  const steps: { key: CustomStep; label: string; valid: boolean; required: boolean }[] = [
    { key: 'identity', label: 'Identidade', valid: hasName, required: true },
    { key: 'scope', label: 'Escopo', valid: true, required: false },
    { key: 'conditions', label: 'Condições', valid: hasConditions, required: true },
    { key: 'action', label: 'Ação', valid: true, required: false },
    { key: 'confidence', label: 'Confiança', valid: true, required: false },
    { key: 'review', label: 'Revisão', valid: canSave, required: false },
  ]

  const stepIndex = steps.findIndex(s => s.key === step)
  const goPrev = () => { if (stepIndex > 0) setStep(steps[stepIndex - 1].key) }
  const goNext = () => { if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1].key) }

  return (
    <ModalShell open={open} onClose={onClose} title={initial ? 'Editar radar' : 'Criar radar personalizado'} subtitle="Monte suas próprias regras para o GoalSense monitorar partidas em tempo real." maxWidth="max-w-[1180px]"
      footer={
        <>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          {stepIndex > 0 && <button onClick={goPrev} type="button" className="px-3.5 py-2.5 rounded-xl text-[12px] font-medium text-white/75 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-all">Voltar</button>}
          {stepIndex < steps.length - 1 && <button onClick={goNext} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-all">Próximo</button>}
          <button onClick={() => { onSave(buildData('paused')); onClose() }} disabled={!canSave} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar pausado</button>
          <button onClick={() => { onSave(buildData('active')); onClose() }} disabled={!canSave} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-bold bg-gradient-to-r from-cyan-500/22 to-blue-500/22 text-cyan-200 border border-cyan-400/30 hover:from-cyan-500/32 hover:to-blue-500/32 disabled:opacity-30 disabled:cursor-not-allowed transition-all">{initial ? 'Salvar e ativar' : 'Criar e ativar'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Sidebar steps */}
        <nav className="lg:col-span-3 lg:sticky lg:top-0 self-start">
          <ul className="space-y-1">
            {steps.map((s, i) => {
              const isActive = step === s.key
              const isComplete = s.valid && i < stepIndex
              return (
                <li key={s.key}>
                  <button onClick={() => setStep(s.key)} type="button" className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${isActive ? 'bg-white/[0.06] border border-white/[0.12]' : 'border border-transparent hover:bg-white/[0.025]'}`}>
                    <span className={`h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-bold tabular-nums shrink-0 ${isActive ? 'bg-gradient-to-br from-cyan-500/30 to-blue-500/30 text-cyan-200 border border-cyan-400/30' : isComplete ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20' : 'bg-white/[0.04] text-white/55 border border-white/[0.07]'}`}>{isComplete ? '✓' : i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-[12px] font-semibold block ${isActive ? 'text-white/95' : 'text-white/75'}`}>{s.label}</span>
                      {s.required && !s.valid && !isActive && <span className="text-[10px] text-amber-300/80 block">obrigatório</span>}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Step content */}
        <div className="lg:col-span-6 space-y-5">
          {step === 'identity' && (
            <>
              <Section title="Nome e descrição" hint="Dê um nome curto que descreva o sinal que este radar procura.">
                <div className="space-y-2.5">
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do radar" className={`w-full h-11 rounded-xl border bg-white/[0.04] px-4 text-[13px] text-white/95 placeholder:text-white/35 outline-none focus:border-cyan-400/40 ${name.trim() ? 'border-white/[0.08]' : 'border-amber-400/20'}`} />
                  {!hasName && <p className="text-[11px] text-amber-300/85">O nome é obrigatório.</p>}
                  <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrição — quando este radar é útil?" className="w-full h-11 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-[13px] text-white/95 placeholder:text-white/35 outline-none focus:border-cyan-400/40" />
                </div>
              </Section>
              <Section title="Severidade" hint="Reflete a urgência visual do sinal no Scanner e nos alertas.">
                <SeverityPicker value={severity} onChange={setSeverity} />
              </Section>
            </>
          )}
          {step === 'scope' && (
            <Section title="Escopo de análise" hint="Defina em quais partidas este radar pode disparar.">
              <ScopePicker scope={scope} onChange={setScope} />
            </Section>
          )}
          {step === 'conditions' && (
            <Section title={`Condições (${conditions.length})`} hint="Cada condição precisa ser verdadeira para o radar disparar. Adicione pela categoria.">
              <ConditionsEditor conditions={conditions} onChange={setConditions} />
              {!hasConditions && <p className="text-[11px] text-amber-300/85 mt-3">É preciso ao menos uma condição para salvar.</p>}
            </Section>
          )}
          {step === 'action' && (
            <Section title="Ação ao detectar">
              <ActionPicker value={action} onChange={setAction} />
            </Section>
          )}
          {step === 'confidence' && (
            <Section title="Confiança mínima" hint="Quanto maior, menos alertas falsos. Recomendado: 50% para começar.">
              <div className="flex items-center gap-3">
                <input type="range" min={20} max={95} value={minConf} onChange={e => setMinConf(Number(e.target.value))} className="flex-1 accent-cyan-400" />
                <input type="number" value={minConf} onChange={e => setMinConf(Number(e.target.value))} className="w-20 h-9 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/95 tabular-nums text-center outline-none focus:border-cyan-400/40" min={20} max={95} />
                <span className="text-[12px] text-white/65 font-semibold">%</span>
              </div>
            </Section>
          )}
          {step === 'review' && (
            <Section title="Revisão final" hint="Confira a configuração antes de salvar. Você pode voltar e ajustar.">
              <p className="text-[12px] text-white/75 leading-relaxed mb-3">Este radar será avaliado em partidas {scope === 'favorites_only' ? 'envolvendo seus favoritos' : 'ao vivo e/ou pré-jogo'}, com confiança mínima de <span className="text-white/95 font-bold tabular-nums">{minConf}%</span>.</p>
              <RadarPreview name={name.trim()} severity={severity} scope={scope} action={action} minConf={minConf} conditions={conditions} />
            </Section>
          )}
        </div>

        {/* Right panel — live preview always visible */}
        <aside className="lg:col-span-3 lg:sticky lg:top-0 self-start hidden lg:block">
          <RadarPreview name={name.trim() || 'Sem nome'} severity={severity} scope={scope} action={action} minConf={minConf} conditions={conditions} />
        </aside>
      </div>
    </ModalShell>
  )
}

// ═══ AUTO DISCOVERY CONFIG MODAL — control panel layout
function AutoDiscoveryConfigModal({ open, config, onClose, onChange, onActivate, onDeactivate }: { open: boolean; config: AutoDiscoveryConfig; onClose: () => void; onChange: (p: Partial<AutoDiscoveryConfig>) => void; onActivate: () => void; onDeactivate: () => void }) {
  const isActive = config.enabled && config.userConfigured
  const statusLabel = isActive ? 'Monitorando' : config.userConfigured ? 'Configurado' : 'Desligado'
  const statusTone = isActive ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : config.userConfigured ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15' : 'bg-white/[0.05] text-white/55 border-white/[0.07]'
  return (
    <ModalShell open={open} onClose={onClose} title="Motor automático" subtitle="Configure como o GoalSense pode sugerir ou registrar descobertas automáticas." maxWidth="max-w-[1040px]"
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md border ${statusTone}`}>{statusLabel}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-white/[0.04] text-white/65 border border-white/[0.07]">Confiança ≥ {config.minConfidence}%</span>
          <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md border ${config.registerAlertAuto ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : 'bg-white/[0.04] text-white/65 border-white/[0.07]'}`}>{config.registerAlertAuto ? 'Registrando alertas' : 'Apenas sugerindo'}</span>
        </div>
      }
      footer={
        <>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          {isActive && <button onClick={onDeactivate} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-rose-300 border border-rose-400/20 bg-rose-500/8 hover:bg-rose-500/15 transition-all">Desativar motor</button>}
          {config.userConfigured && !isActive && <button onClick={() => onChange({ enabled: false })} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-all">Salvar configuração</button>}
          <button onClick={onActivate} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-bold bg-gradient-to-r from-cyan-500/22 to-blue-500/22 text-cyan-200 border border-cyan-400/30 hover:from-cyan-500/32 hover:to-blue-500/32 transition-all">{isActive ? 'Salvar configuração' : 'Salvar e ativar motor'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN */}
        <div className="space-y-5">
          <Section title="Cobertura" hint="Quais partidas o motor pode analisar.">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4 space-y-1">
              <ToggleWithLabel label="Monitorar favoritos" hint="Inclui partidas com times favoritos." checked={config.monitorFavorites} onChange={v => onChange({ monitorFavorites: v })} />
              <ToggleWithLabel label="Ligas principais" hint="Brasileirão, Premier League, La Liga e equivalentes." checked={config.monitorMainLeagues} onChange={v => onChange({ monitorMainLeagues: v })} />
              <ToggleWithLabel label="Todas as ligas" hint="Inclui partidas de todas as competições disponíveis." checked={config.monitorAllLeagues} onChange={v => onChange({ monitorAllLeagues: v })} />
            </div>
          </Section>

          <Section title="Momentos do jogo" hint="Quando o motor pode procurar sinais.">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4 space-y-1">
              <ToggleWithLabel label="Incluir pré-jogo" hint="Sinais antes da bola rolar (forma, H2H, perfil de gols)." checked={config.includePreMatch} onChange={v => onChange({ includePreMatch: v })} />
              <ToggleWithLabel label="Incluir ao vivo" hint="Sinais durante a partida com base em estatísticas reais." checked={config.includeLive} onChange={v => onChange({ includeLive: v })} />
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          <Section title="Qualidade" hint="Limites para evitar ruído e duplicidade.">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4 space-y-3">
              <div>
                <label className="text-[11px] text-white/65 block mb-1.5 font-medium">Confiança mínima</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={20} max={95} value={config.minConfidence} onChange={e => onChange({ minConfidence: Number(e.target.value) })} className="flex-1 accent-cyan-400" />
                  <input type="number" value={config.minConfidence} onChange={e => onChange({ minConfidence: Number(e.target.value) })} className="w-20 h-9 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/95 tabular-nums text-center outline-none focus:border-cyan-400/40" min={20} max={95} />
                  <span className="text-[12px] text-white/65 font-semibold">%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-white/65 block mb-1.5 font-medium">Máx. alertas/jogo</label>
                  <input type="number" value={config.maxAlertsPerMatch} onChange={e => onChange({ maxAlertsPerMatch: Number(e.target.value) })} className="w-full h-10 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/95 tabular-nums outline-none focus:border-cyan-400/40" min={1} max={10} />
                </div>
                <div>
                  <label className="text-[11px] text-white/65 block mb-1.5 font-medium">Anti-duplicidade (min)</label>
                  <input type="number" value={config.antiDuplicateMinutes} onChange={e => onChange({ antiDuplicateMinutes: Number(e.target.value) })} className="w-full h-10 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/95 tabular-nums outline-none focus:border-cyan-400/40" min={1} max={60} />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Ação" hint="O que fazer quando o motor descobrir um sinal.">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
              <ToggleWithLabel label="Registrar alerta automaticamente" hint="Quando ativo, descobertas viram alertas em /app/alerts e são acompanhadas pelo motor de resolução. Quando desligado, descobertas só aparecem como sugestões no Cockpit/Scanner." checked={config.registerAlertAuto} onChange={v => onChange({ registerAlertAuto: v })} />
            </div>
          </Section>

          <Section title="Segurança">
            <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.06] via-blue-500/[0.025] to-transparent px-4 py-3.5">
              <p className="text-[11px] text-white/85 leading-relaxed">
                <span className="text-cyan-200 font-bold">Motor automático só roda após salvar e ativar.</span><br />
                {config.registerAlertAuto
                  ? <>Descobertas com confiança ≥ <span className="text-white/95 font-bold tabular-nums">{config.minConfidence}%</span> serão registradas automaticamente em <span className="text-cyan-300 font-semibold">/app/alerts</span>.</>
                  : <>Configurado como <span className="text-white/95 font-semibold">apenas sugerir</span> — o motor <span className="text-white/95 font-bold">não registrará alertas</span>.</>
                }
              </p>
            </div>
          </Section>
        </div>
      </div>
    </ModalShell>
  )
}

// ═══ PATTERN STUDIO (PatternsView)
function PatternsView({ patterns, templates, createFromTemplate, createPattern, updatePattern, togglePattern, deletePattern, isAdvanced, showBuilder, setShowBuilder, discoveryConfig, updateDiscoveryConfig, triggeredAlerts }: { patterns: Pattern[]; templates: PatternTemplate[]; createFromTemplate: (id: string) => Pattern | null; createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern; updatePattern: (id: string, patch: Partial<Pattern>) => void; togglePattern: (id: string) => void; deletePattern: (id: string) => void; isAdvanced: boolean; showBuilder: boolean; setShowBuilder: (v: boolean) => void; discoveryConfig: AutoDiscoveryConfig; updateDiscoveryConfig: (p: Partial<AutoDiscoveryConfig>) => void; triggeredAlerts: TriggeredAlert[] }) {
  const [showAutoConfig, setShowAutoConfig] = useState(false)
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null)
  const [templateModal, setTemplateModal] = useState<{ template: PatternTemplate; existing: Pattern | null } | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all')

  const handleCustomSave = (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingPattern) updatePattern(editingPattern.id, data)
    else createPattern(data)
    setEditingPattern(null)
  }

  const handleTemplateSave = (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (templateModal?.existing) updatePattern(templateModal.existing.id, data)
    else createPattern(data)
  }

  const handleTemplateToggle = (template: PatternTemplate) => {
    const existing = patterns.find(p => p.templateId === template.id)
    if (existing) {
      // Toggle active/paused
      togglePattern(existing.id)
    } else {
      // First activation — open config modal
      setTemplateModal({ template, existing: null })
    }
  }

  const handleTemplateConfigure = (template: PatternTemplate) => {
    const existing = patterns.find(p => p.templateId === template.id) || null
    setTemplateModal({ template, existing })
  }

  const handleActivateAuto = () => { updateDiscoveryConfig({ enabled: true, userConfigured: true }); setShowAutoConfig(false) }
  const handleDeactivateAuto = () => { updateDiscoveryConfig({ enabled: false }); setShowAutoConfig(false) }

  const isAutoActive = discoveryConfig.enabled && discoveryConfig.userConfigured
  const activeCount = patterns.filter(p => p.status === 'active').length
  const pausedCount = patterns.filter(p => p.status === 'paused').length
  const triggeredTodayCount = triggeredAlerts.filter(t => t.timestamp.startsWith(new Date().toISOString().split('T')[0])).length

  const visibleTemplates = templates.filter(t => categoryFilter === 'all' || categorizeTemplate(t) === categoryFilter)

  return (
    <div className="space-y-6">
      {/* Modals */}
      <CustomPatternModal open={showBuilder} initial={editingPattern} onClose={() => { setShowBuilder(false); setEditingPattern(null) }} onSave={handleCustomSave} />
      <TemplateConfigModal open={!!templateModal} template={templateModal?.template || null} existingPattern={templateModal?.existing || null} onClose={() => setTemplateModal(null)} onSave={handleTemplateSave} />
      <AutoDiscoveryConfigModal open={showAutoConfig} config={discoveryConfig} onClose={() => setShowAutoConfig(false)} onChange={updateDiscoveryConfig} onActivate={handleActivateAuto} onDeactivate={handleDeactivateAuto} />

      {/* Header */}
      <header className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-6">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h2 className="text-[20px] font-bold text-white/95 tracking-tight">Pattern Studio</h2>
            <p className="text-[12px] text-white/60 mt-1 max-w-[600px]">Configure radares manuais e o motor automático para detectar sinais reais nas partidas.</p>
          </div>
          <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-bold text-cyan-200 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 border border-cyan-400/25 hover:from-cyan-500/25 hover:to-blue-500/25 transition-all flex items-center gap-1.5"><Plus size={14} />Criar radar personalizado</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01]">
          <CounterCell label="Ativos" value={activeCount} tone="emerald" />
          <CounterCell label="Pausados" value={pausedCount} tone="white" />
          <CounterCell label="Templates" value={templates.length} tone="cyan" />
          <CounterCell label="Motor auto" value={isAutoActive ? 'On' : 'Off'} tone={isAutoActive ? 'emerald' : 'white'} />
          <CounterCell label="Disparos hoje" value={triggeredTodayCount} tone={triggeredTodayCount > 0 ? 'amber' : 'white'} />
        </div>
      </header>

      {/* Motor automático — compact card */}
      <section className={`rounded-2xl border ${isAutoActive ? 'border-emerald-400/20 bg-gradient-to-r from-emerald-500/[0.04] via-cyan-500/[0.02] to-transparent' : 'border-white/[0.07] bg-gradient-to-r from-white/[0.02] to-transparent'} p-5`}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isAutoActive ? 'bg-emerald-500/15 border border-emerald-400/25' : 'bg-white/[0.04] border border-white/[0.08]'}`}><Sparkles size={16} className={isAutoActive ? 'text-emerald-300' : 'text-white/55'} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14px] font-bold text-white/95">Motor automático</h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${isAutoActive ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : 'bg-white/[0.04] text-white/55 border-white/[0.07]'}`}>{isAutoActive ? 'Monitorando' : 'Desligado'}</span>
            </div>
            <p className="text-[11px] text-white/55 mt-0.5 leading-snug">
              {isAutoActive
                ? `Confiança ≥ ${discoveryConfig.minConfidence}% · ${discoveryConfig.registerAlertAuto ? 'Registrando alertas' : 'Apenas sugerindo'} · ${discoveryConfig.monitorAllLeagues ? 'todas as ligas' : discoveryConfig.monitorMainLeagues ? 'ligas principais' : 'favoritos'}`
                : 'Configure o motor para o GoalSense detectar sinais sem você criar padrões.'}
            </p>
          </div>
          <PremiumToggle checked={isAutoActive} onChange={(v) => { if (v && !discoveryConfig.userConfigured) setShowAutoConfig(true); else updateDiscoveryConfig({ enabled: v }) }} ariaLabel="Motor automático" />
          <button onClick={() => setShowAutoConfig(true)} type="button" className="px-3.5 py-2 rounded-xl text-[11px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-all">Configurar motor</button>
        </div>
      </section>

      {/* Radares configurados */}
      {patterns.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/65">Radares configurados</h3>
            <span className="text-[10px] text-white/45 font-semibold">{activeCount} ativos · {pausedCount} pausados</span>
          </div>
          <div className="space-y-2">
            {patterns.map(p => <ConfiguredRadarRow key={p.id} pattern={p} triggeredAlerts={triggeredAlerts} onToggle={() => togglePattern(p.id)} onEdit={() => { setEditingPattern(p); setShowBuilder(true) }} onDuplicate={() => { createPattern({ ...p, name: `${p.name} (cópia)`, status: 'paused', isTemplate: false, templateId: undefined }) }} onDelete={() => deletePattern(p.id)} isAdvanced={isAdvanced} />)}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.008] p-7 text-center">
          <p className="text-[14px] text-white/85 font-semibold">Você ainda não configurou nenhum radar</p>
          <p className="text-[12px] text-white/55 mt-1">Comece por um template ou crie seu próprio padrão.</p>
        </section>
      )}

      {/* Templates */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/65">Templates recomendados</h3>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['all', 'Todos'],
              ...(Object.entries(CATEGORY_LABELS) as [TemplateCategory, string][]),
            ] as [TemplateCategory | 'all', string][]).map(([k, label]) => {
              const active = categoryFilter === k
              const count = k === 'all' ? templates.length : templates.filter(t => categorizeTemplate(t) === k).length
              return (
                <button key={k} onClick={() => setCategoryFilter(k)} type="button" className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1.5 ${active ? 'bg-white/[0.09] text-white border border-white/[0.14]' : 'text-white/55 border border-white/[0.06] hover:text-white/85 hover:border-white/[0.1]'}`}>
                  {label}
                  {count > 0 && <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-md ${active ? 'bg-cyan-500/22 text-cyan-200' : 'bg-white/[0.06] text-white/55'}`}>{count}</span>}
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleTemplates.map(t => {
            const existing = patterns.find(p => p.templateId === t.id) || null
            const isActiveTpl = !!existing && existing.status === 'active'
            return <TemplateCard key={t.id} template={t} existing={existing} isActive={isActiveTpl} onToggle={() => handleTemplateToggle(t)} onConfigure={() => handleTemplateConfigure(t)} />
          })}
        </div>
      </section>
    </div>
  )
}

// ═══ TEMPLATE CARD
function TemplateCard({ template, existing, isActive, onToggle, onConfigure }: { template: PatternTemplate; existing: Pattern | null; isActive: boolean; onToggle: () => void; onConfigure: () => void }) {
  const cat = categorizeTemplate(template)
  const sevTone = template.severity === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : template.severity === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'
  return (
    <div className={`group rounded-2xl border ${isActive ? 'border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.04] via-cyan-500/[0.02] to-transparent' : 'border-white/[0.06] bg-white/[0.012]'} p-4 transition-all hover:border-white/[0.12]`}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${sevTone}`}>{template.severity === 'critical' ? 'Crítico' : template.severity === 'attention' ? 'Atenção' : 'Info'}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-white/55">{CATEGORY_LABELS[cat]}</span>
            {existing && existing.status === 'paused' && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.05] text-white/65 border border-white/[0.07]">Pausado</span>}
          </div>
          <h4 className="text-[13px] font-bold text-white/95 truncate">{template.name}</h4>
        </div>
        <PremiumToggle checked={isActive} onChange={onToggle} ariaLabel={`Ativar template ${template.name}`} size="sm" />
      </div>
      <p className="text-[11px] text-white/65 leading-snug mb-3 line-clamp-2">{template.description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {template.conditions.slice(0, 3).map((c, i) => (
          <span key={i} className="text-[10px] text-white/65 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.05]">{formatConditionHuman(c)}</span>
        ))}
        {template.conditions.length > 3 && <span className="text-[10px] text-white/45">+{template.conditions.length - 3}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
        <span className="text-[10px] text-white/45">Confiança sugerida: <span className="text-white/75 font-semibold">{template.defaultConfidence}</span></span>
        <button onClick={onConfigure} type="button" className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 transition-colors">Configurar →</button>
      </div>
    </div>
  )
}

// ═══ CONFIGURED RADAR ROW
function ConfiguredRadarRow({ pattern, triggeredAlerts, onToggle, onEdit, onDuplicate, onDelete, isAdvanced }: { pattern: Pattern; triggeredAlerts: TriggeredAlert[]; onToggle: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; isAdvanced: boolean }) {
  const isActive = pattern.status === 'active'
  const lastHit = triggeredAlerts.find(t => t.patternId === pattern.id)?.timestamp || null
  const hits = triggeredAlerts.filter(t => t.patternId === pattern.id).length
  const sevTone = pattern.severity === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : pattern.severity === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'
  const origin = pattern.isTemplate || pattern.templateId ? 'Template' : 'Personalizado'

  return (
    <div className={`rounded-2xl border ${isActive ? 'border-white/[0.08]' : 'border-white/[0.05] opacity-75'} bg-gradient-to-r from-white/[0.012] to-transparent px-5 py-4`}>
      <div className="flex items-center gap-4 flex-wrap">
        <PremiumToggle checked={isActive} onChange={onToggle} ariaLabel={`Ativar ${pattern.name}`} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h4 className="text-[13px] font-bold text-white/95 truncate">{pattern.name}</h4>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${sevTone}`}>{pattern.severity === 'critical' ? 'Crítico' : pattern.severity === 'attention' ? 'Atenção' : 'Info'}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.04] text-white/65 border border-white/[0.07]">{origin}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-white/55 flex-wrap">
            <span>{pattern.conditions.length} {pattern.conditions.length === 1 ? 'condição' : 'condições'}</span>
            <span>· Conf ≥ {pattern.minConfidence}%</span>
            <span>· {pattern.action === 'register_alert' ? 'Alerta' : pattern.action === 'suggest_only' ? 'Sugerir' : 'Destacar'}</span>
            <span>· {pattern.scope === 'all' ? 'Todos' : 'Favoritos'}</span>
            {hits > 0 && <span>· <span className="text-white/85 font-semibold">{hits}</span> {hits === 1 ? 'disparo' : 'disparos'}</span>}
            {lastHit && <span>· Último {new Date(lastHit).toLocaleDateString('pt-BR')}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/65 hover:text-white/95 hover:bg-white/[0.05] transition-all">Editar</button>
          <button onClick={onDuplicate} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/65 hover:text-white/95 hover:bg-white/[0.05] transition-all">Duplicar</button>
          <button onClick={onDelete} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/45 hover:text-rose-300 hover:bg-rose-500/8 transition-all" aria-label="Excluir">Excluir</button>
        </div>
      </div>
      {isAdvanced && (
        <div className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-white/45 font-mono">
          id:{pattern.id.slice(0, 12)} · template:{pattern.templateId || 'custom'} · max/jogo:{pattern.maxTriggersPerMatch} · anti-dup:{pattern.antiDuplicateWindow}min
        </div>
      )}
    </div>
  )
}


// ═══ SCANNER ═══
type ScannerFilter = 'all' | 'critical' | 'attention' | 'favorites' | 'live' | 'soon' | 'rich'

function ScannerView({ hasIntelligence, entries, openMatch, isAdvanced, onGoToPatterns }: { hasIntelligence: boolean; entries: ScannerEntry[]; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; onGoToPatterns: () => void }) {
  const { isFavoriteTeam } = useFavorites()
  const [filter, setFilter] = useState<ScannerFilter>('all')

  // Empty state — no intelligence configured
  if (!hasIntelligence) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <section className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] via-white/[0.008] to-transparent p-10 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-4"><Eye size={20} className="text-white/40" /></div>
          <h3 className="text-[18px] font-semibold text-white/85 mb-1.5">Scanner operacional</h3>
          <p className="text-[12px] text-white/55 max-w-[420px] mx-auto leading-relaxed">Somente partidas com padrões ou descobertas ativas aparecem aqui. Configure um radar para o motor começar a detectar sinais reais.</p>
          <div className="flex justify-center gap-2.5 mt-5">
            <button onClick={onGoToPatterns} className="px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-cyan-500/12 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/18 transition-colors" type="button">Ativar template</button>
            <button onClick={onGoToPatterns} className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/55 border border-white/[0.07] hover:text-white/80 hover:border-white/[0.12] transition-colors" type="button">Configurar automático</button>
          </div>
        </section>
        <ScannerSidebar entries={[]} isFavoriteTeam={isFavoriteTeam} />
      </div>
    )
  }

  // Counters per category
  const liveCount = entries.filter(e => isLiveFx(e.fixture)).length
  const soonCount = entries.filter(e => !isLiveFx(e.fixture) && new Date(e.fixture.date).getTime() - Date.now() <= 60 * 60 * 1000).length
  const criticalCount = entries.filter(e => e.priority === 'critical').length
  const attentionCount = entries.filter(e => e.priority === 'attention').length
  const favCount = entries.filter(e => isFavoriteTeam(e.fixture.homeTeam.name) || isFavoriteTeam(e.fixture.awayTeam.name)).length
  const richCount = entries.filter(e => e.fixture.provider === 'espn').length

  const filteredEntries = entries.filter(e => {
    if (filter === 'all') return true
    if (filter === 'critical') return e.priority === 'critical'
    if (filter === 'attention') return e.priority === 'attention'
    if (filter === 'favorites') return isFavoriteTeam(e.fixture.homeTeam.name) || isFavoriteTeam(e.fixture.awayTeam.name)
    if (filter === 'live') return isLiveFx(e.fixture)
    if (filter === 'soon') return !isLiveFx(e.fixture) && new Date(e.fixture.date).getTime() - Date.now() <= 60 * 60 * 1000
    if (filter === 'rich') return e.fixture.provider === 'espn'
    return true
  })

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        {/* Header */}
        <header className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-[20px] font-bold text-white/90 tracking-tight">Scanner operacional</h2>
              <p className="text-[12px] text-white/55 mt-1">Somente partidas com padrões ou descobertas ativas aparecem aqui.</p>
            </div>
            <div className="text-right shrink-0"><span className="text-[26px] font-bold text-white/90 tabular-nums leading-none">{entries.length}</span><span className="text-[10px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">{entries.length === 1 ? 'sinal' : 'sinais'}</span></div>
          </div>
          {/* Counter strip */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01]">
            <CounterCell label="Críticos" value={criticalCount} tone="rose" />
            <CounterCell label="Atenção" value={attentionCount} tone="amber" />
            <CounterCell label="Favoritos" value={favCount} tone="cyan" />
            <CounterCell label="Ao vivo" value={liveCount} tone="emerald" />
            <CounterCell label="Em breve" value={soonCount} tone="cyan" />
            <CounterCell label="Dados ricos" value={richCount} tone="white" />
          </div>
        </header>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {([
            ['all', 'Todos', entries.length],
            ['critical', 'Críticos', criticalCount],
            ['attention', 'Atenção', attentionCount],
            ['favorites', 'Favoritos', favCount],
            ['live', 'Ao vivo', liveCount],
            ['soon', 'Em breve', soonCount],
            ['rich', 'Dados ricos', richCount],
          ] as [ScannerFilter, string, number][]).map(([key, label, count]) => {
            const isActive = filter === key
            return (
              <button key={key} onClick={() => setFilter(key)} type="button" className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1.5 ${isActive ? 'bg-white/[0.09] text-white border border-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-white/55 border border-white/[0.06] hover:text-white/85 hover:border-white/[0.1]'}`}>
                {label}
                {count > 0 && <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${isActive ? 'bg-cyan-500/22 text-cyan-200' : 'bg-white/[0.06] text-white/55'}`}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Entries */}
        {filteredEntries.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.008] p-10 text-center">
            <p className="text-[13px] text-white/55 font-medium">{entries.length === 0 ? 'Nenhum sinal detectado agora' : 'Nenhum sinal nesta categoria'}</p>
            <p className="text-[11px] text-white/35 mt-1">{entries.length === 0 ? 'O motor está analisando partidas com os padrões configurados.' : 'Selecione outro filtro acima para ver outros sinais.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map(entry => <ScannerRow key={entry.fixture.id} entry={entry} openMatch={openMatch} isAdvanced={isAdvanced} isFavoriteTeam={isFavoriteTeam} />)}
          </div>
        )}
      </div>

      <ScannerSidebar entries={entries} isFavoriteTeam={isFavoriteTeam} />
    </div>
  )
}

function CounterCell({ label, value, tone }: { label: string; value: number | string; tone: 'rose' | 'amber' | 'cyan' | 'emerald' | 'white' }) {
  const isPositive = typeof value === 'number' ? value > 0 : value !== 'Off' && value !== '—' && value !== '0'
  const c = isPositive
    ? tone === 'rose' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : tone === 'cyan' ? 'text-cyan-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white/85'
    : 'text-white/25'
  return (
    <div className="px-3 py-2.5 text-center bg-[#080d16]">
      <span className={`text-[18px] font-bold tabular-nums block leading-none ${c}`}>{value}</span>
      <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">{label}</span>
    </div>
  )
}

function ScannerRow({ entry, openMatch, isAdvanced, isFavoriteTeam }: { entry: ScannerEntry; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; isFavoriteTeam: (name: string) => boolean }) {
  const fx = entry.fixture
  const live = isLiveFx(fx)
  const isFav = isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const accentBorder = entry.priority === 'critical' ? 'border-l-rose-400/55' : entry.priority === 'attention' ? 'border-l-amber-400/55' : 'border-l-cyan-400/45'
  const statusLabel = live ? 'Batendo' : entry.topPattern ? 'Pronto' : 'Sugerido'
  const statusColor = live ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : entry.topPattern ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15' : 'bg-white/[0.04] text-white/55 border-white/[0.07]'

  return (
    <div onClick={() => openMatch(fx)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openMatch(fx) }} className={`group relative rounded-2xl border border-l-2 ${accentBorder} border-white/[0.05] bg-gradient-to-r from-white/[0.012] to-white/[0.005] hover:border-white/[0.1] hover:bg-white/[0.018] cursor-pointer transition-all`}>
      <div className="px-5 py-4">
        {/* Top row */}
        <div className="flex items-center gap-3 mb-2.5">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${entry.priority === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : entry.priority === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'}`}>
            {entry.priority === 'critical' ? 'Crítico' : entry.priority === 'attention' ? 'Atenção' : 'Observar'}
          </span>
          <span className="text-[12px] text-white/85 font-bold flex-1 truncate">{entry.reason || 'Sinal detectado'}</span>
          {isFav && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-400/15">Favorito</span>}
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${statusColor}`}>{statusLabel}</span>
        </div>

        {/* Match line */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={22} />
          <span className="text-[13px] text-white/85 font-semibold truncate">{fx.homeTeam.name}</span>
          <span className="text-[14px] text-white font-bold tabular-nums px-2">{fx.score.home ?? '-'}<span className="text-white/25 mx-1">:</span>{fx.score.away ?? '-'}</span>
          <span className="text-[13px] text-white/85 font-semibold truncate">{fx.awayTeam.name}</span>
          <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={22} />
        </div>

        {/* Meta + evidence */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${live ? 'text-emerald-400' : 'text-white/45'}`}>
            {live ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {fx.status.elapsed || 0}'</> : <>⏰ {new Date(fx.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
          </span>
          <span className="text-[11px] text-white/45 truncate">{fx.league.name}</span>
          {entry.topPattern && entry.topPattern.reasons.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {entry.topPattern.reasons.slice(0, 2).map((r, i) => (
                <span key={i} className="text-[10px] text-white/55 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.05]">{r}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <ConfidenceBar value={entry.confidence} />
            <span className="text-[12px] text-white/85 font-bold tabular-nums">{entry.confidence}%</span>
            <ChevronRight size={14} className="text-white/25 group-hover:text-white/65 transition-colors" />
          </div>
        </div>
        {isAdvanced && entry.topPattern && (
          <div className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-white/35 font-mono">
            cond:{entry.topPattern.matchedConditions}/{entry.topPattern.totalConditions} · sev:{entry.topPattern.severity} · provider:{fx.provider}
          </div>
        )}
      </div>
    </div>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const tone = value >= 75 ? 'from-emerald-500 to-emerald-400' : value >= 50 ? 'from-cyan-500 to-blue-500' : 'from-white/30 to-white/20'
  return (
    <div className="hidden sm:block w-16 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
      <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

function ScannerSidebar({ entries, isFavoriteTeam }: { entries: ScannerEntry[]; isFavoriteTeam: (name: string) => boolean }) {
  const totalEntries = entries.length
  const fav = entries.filter(e => isFavoriteTeam(e.fixture.homeTeam.name) || isFavoriteTeam(e.fixture.awayTeam.name)).length
  const live = entries.filter(e => isLiveFx(e.fixture)).length
  const espn = entries.filter(e => e.fixture.provider === 'espn').length

  return (
    <aside className="space-y-3">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Resumo dos sinais</h4>
        <div className="space-y-2">
          <SidebarRow label="Sinais totais" value={totalEntries} />
          <SidebarRow label="Críticos" value={entries.filter(e => e.priority === 'critical').length} tone="rose" />
          <SidebarRow label="Atenção" value={entries.filter(e => e.priority === 'attention').length} tone="amber" />
          <SidebarRow label="Observar" value={entries.filter(e => e.priority === 'watch').length} tone="cyan" />
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Origem</h4>
        <div className="space-y-2">
          <SidebarRow label="Padrões manuais" value={entries.filter(e => e.topPattern !== null).length} tone="white" />
          <SidebarRow label="Descoberta automática" value={entries.filter(e => e.topPattern === null).length} tone="cyan" />
          <SidebarRow label="Cobertura ESPN" value={espn} tone="emerald" />
          <SidebarRow label="Favoritos envolvidos" value={fav} tone="cyan" />
          <SidebarRow label="Ao vivo agora" value={live} tone="emerald" />
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-transparent p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/80 mb-2">Como funciona</h4>
        <p className="text-[11px] text-white/55 leading-relaxed">
          Cada linha é uma partida onde pelo menos um padrão configurado ou uma descoberta do motor automático bateu. Clique para abrir a análise completa.
        </p>
      </div>
    </aside>
  )
}

function SidebarRow({ label, value, tone }: { label: string; value: number; tone?: 'rose' | 'amber' | 'cyan' | 'emerald' | 'white' }) {
  const c = value > 0
    ? tone === 'rose' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : tone === 'cyan' ? 'text-cyan-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white/85'
    : 'text-white/35'
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-white/55">{label}</span>
      <span className={`font-bold tabular-nums ${c}`}>{value}</span>
    </div>
  )
}

// ═══ ALERTS ═══
type AlertFilter = 'all' | 'pending' | 'confirmed' | 'partial' | 'failed' | 'expired'

function AlertsView({ triggeredAlerts, isAdvanced, openMatch, fixtures, navigate }: { triggeredAlerts: TriggeredAlert[]; isAdvanced: boolean; openMatch: (fx: LiveFixture) => void; fixtures: LiveFixture[]; navigate: (path: string) => void }) {
  const [filter, setFilter] = useState<AlertFilter>('all')

  // Counts per status
  const counts = useMemo(() => ({
    all: triggeredAlerts.length,
    pending: triggeredAlerts.filter(t => t.status === 'pending').length,
    confirmed: triggeredAlerts.filter(t => t.status === 'confirmed').length,
    partial: triggeredAlerts.filter(t => t.status === 'confirmed_partial').length,
    failed: triggeredAlerts.filter(t => t.status === 'failed').length,
    expired: triggeredAlerts.filter(t => t.status === 'expired' || t.status === 'unknown').length,
  }), [triggeredAlerts])

  const visible = useMemo(() => {
    if (filter === 'all') return triggeredAlerts
    if (filter === 'pending') return triggeredAlerts.filter(t => t.status === 'pending')
    if (filter === 'confirmed') return triggeredAlerts.filter(t => t.status === 'confirmed')
    if (filter === 'partial') return triggeredAlerts.filter(t => t.status === 'confirmed_partial')
    if (filter === 'failed') return triggeredAlerts.filter(t => t.status === 'failed')
    if (filter === 'expired') return triggeredAlerts.filter(t => t.status === 'expired' || t.status === 'unknown')
    return triggeredAlerts
  }, [filter, triggeredAlerts])

  if (triggeredAlerts.length === 0) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] via-white/[0.008] to-transparent p-10 text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-4"><Zap size={20} className="text-white/40" /></div>
        <h3 className="text-[18px] font-semibold text-white/85 mb-1.5">Nenhum alerta disparado ainda</h3>
        <p className="text-[12px] text-white/55 max-w-[480px] mx-auto leading-relaxed">Quando um padrão bater, o Command Center registrará aqui e também em <span className="text-cyan-300 font-semibold">/app/alerts</span>.</p>
        <button onClick={() => navigate('/app/alerts')} className="mt-5 px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/60 border border-white/[0.07] hover:text-white/85 hover:border-white/[0.12] transition-colors" type="button">Ver gerenciador de alertas →</button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        {/* Header */}
        <header className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-[20px] font-bold text-white/90 tracking-tight">Alertas disparados</h2>
              <p className="text-[12px] text-white/55 mt-1">Eventos registrados pelo Command Center e enviados para <span className="text-cyan-300/80 font-semibold">/app/alerts</span>.</p>
            </div>
            <button onClick={() => navigate('/app/alerts')} className="px-3.5 py-2 rounded-xl text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 hover:bg-cyan-500/15 transition-colors whitespace-nowrap" type="button">Ver em /app/alerts</button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01]">
            <CounterCell label="Total" value={counts.all} tone="white" />
            <CounterCell label="Pendentes" value={counts.pending} tone="amber" />
            <CounterCell label="Confirmados" value={counts.confirmed} tone="emerald" />
            <CounterCell label="Parciais" value={counts.partial} tone="cyan" />
            <CounterCell label="Falhados" value={counts.failed} tone="rose" />
            <CounterCell label="Expirados" value={counts.expired} tone="white" />
          </div>
        </header>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {([
            ['all', 'Todos', counts.all],
            ['pending', 'Pendentes', counts.pending],
            ['confirmed', 'Confirmados', counts.confirmed],
            ['partial', 'Parciais', counts.partial],
            ['failed', 'Falhados', counts.failed],
            ['expired', 'Expirados', counts.expired],
          ] as [AlertFilter, string, number][]).map(([key, label, count]) => {
            const isActive = filter === key
            return (
              <button key={key} onClick={() => setFilter(key)} type="button" className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1.5 ${isActive ? 'bg-white/[0.09] text-white border border-white/[0.14]' : 'text-white/55 border border-white/[0.06] hover:text-white/85 hover:border-white/[0.1]'}`}>
                {label}
                {count > 0 && <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${isActive ? 'bg-cyan-500/22 text-cyan-200' : 'bg-white/[0.06] text-white/55'}`}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Alert log */}
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.008] p-8 text-center">
            <p className="text-[12px] text-white/55">Nenhum alerta nesta categoria.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(t => <AlertRow key={t.id} t={t} fx={fixtures.find(f => f.id === t.fixtureId)} openMatch={openMatch} isAdvanced={isAdvanced} />)}
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Saúde dos alertas</h4>
          <div className="space-y-2">
            <SidebarRow label="Pendentes" value={counts.pending} tone="amber" />
            <SidebarRow label="Confirmados" value={counts.confirmed} tone="emerald" />
            <SidebarRow label="Parciais" value={counts.partial} tone="cyan" />
            <SidebarRow label="Falhados" value={counts.failed} tone="rose" />
            <SidebarRow label="Expirados" value={counts.expired} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-transparent p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/80 mb-2">Como ler</h4>
          <p className="text-[11px] text-white/55 leading-relaxed">
            <span className="text-amber-300 font-semibold">Pendente</span> aguarda resolução. <span className="text-emerald-300 font-semibold">Confirmado</span> teve evento previsto. <span className="text-cyan-300 font-semibold">Parcial</span> teve evidência mas não fechou. <span className="text-rose-300 font-semibold">Falhado</span> não confirmou. <span className="text-white/65 font-semibold">Expirado</span> chegou ao fim sem evidência.
          </p>
        </div>
        <button onClick={() => navigate('/app/alerts')} className="w-full px-3 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/90 hover:border-white/[0.12] transition-colors" type="button">Abrir gerenciador →</button>
      </aside>
    </div>
  )
}

function AlertRow({ t, fx, openMatch, isAdvanced }: { t: TriggeredAlert; fx?: LiveFixture; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean }) {
  const status = t.status as string
  const cfg =
    status === 'confirmed' ? { label: 'Confirmado', cls: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20', accent: 'border-l-emerald-400/55', dot: 'bg-emerald-400' }
    : status === 'confirmed_partial' ? { label: 'Parcial', cls: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15', accent: 'border-l-cyan-400/45', dot: 'bg-cyan-400' }
    : status === 'failed' ? { label: 'Falhou', cls: 'bg-rose-500/12 text-rose-300 border-rose-400/20', accent: 'border-l-rose-400/55', dot: 'bg-rose-400' }
    : status === 'expired' ? { label: 'Expirado', cls: 'bg-white/[0.05] text-white/55 border-white/[0.07]', accent: 'border-l-white/25', dot: 'bg-white/40' }
    : status === 'pending' ? { label: 'Pendente', cls: 'bg-amber-500/12 text-amber-300 border-amber-400/20', accent: 'border-l-amber-400/55', dot: 'bg-amber-400' }
    : { label: 'Desconhecido', cls: 'bg-white/[0.05] text-white/55 border-white/[0.07]', accent: 'border-l-white/20', dot: 'bg-white/30' }
  const journeyComplete = status === 'confirmed' || status === 'failed' || status === 'confirmed_partial'

  return (
    <div onClick={() => fx && openMatch(fx)} role={fx ? 'button' : undefined} tabIndex={fx ? 0 : undefined} className={`relative rounded-2xl border border-l-2 ${cfg.accent} border-white/[0.05] bg-gradient-to-r from-white/[0.012] to-white/[0.005] ${fx ? 'cursor-pointer hover:border-white/[0.1] hover:bg-white/[0.018]' : ''} transition-all`}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-2">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot} ${status === 'pending' ? 'animate-pulse' : ''}`} />
          <span className="text-[13px] font-bold text-white/90 truncate flex-1">{t.patternName}</span>
          <span className="text-[11px] text-white/65 tabular-nums font-bold">{t.confidence}%</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${cfg.cls}`}>{cfg.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-white/65 flex-wrap">
          <span className="font-semibold">{t.homeTeam}</span>
          <span className="text-white/85 font-bold tabular-nums px-1">{t.scoreAtTrigger.home}-{t.scoreAtTrigger.away}</span>
          <span className="font-semibold">{t.awayTeam}</span>
          {t.minute && <span className="text-white/45">· {t.minute}'</span>}
          <span className="text-white/45 truncate">· {t.league}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/8 text-cyan-300/80 border border-cyan-400/12 ml-auto whitespace-nowrap">Command Center</span>
          {journeyComplete && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.05] text-white/65 border border-white/[0.07]">Jornada</span>}
        </div>
        {t.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {t.reasons.slice(0, 3).map((r, i) => <span key={i} className="text-[10px] text-white/55 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.05]">{r}</span>)}
          </div>
        )}
        {isAdvanced && (
          <div className="mt-2 pt-2 border-t border-white/[0.04] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-white/45 font-mono">
            <span>id: {t.id.slice(0, 8)}</span>
            <span>created: {new Date(t.timestamp).toLocaleTimeString('pt-BR')}</span>
            <span>min: {t.minute || '-'}</span>
            <span>fixture: {t.fixtureId}</span>
          </div>
        )}
        <div className="mt-1.5 text-[10px] text-white/35">{new Date(t.timestamp).toLocaleString('pt-BR')}</div>
      </div>
    </div>
  )
}

// ═══ PERFORMANCE ═══
function PerformanceView({ patterns, triggeredAlerts, isAdvanced }: { patterns: Pattern[]; triggeredAlerts: TriggeredAlert[]; isAdvanced: boolean }) {
  const stats = useMemo(() => patterns.map(p => { const a = triggeredAlerts.filter(t => t.patternId === p.id); const confirmed = a.filter(t => t.status === 'confirmed').length; const partial = a.filter(t => t.status === 'confirmed_partial').length; const failed = a.filter(t => t.status === 'failed').length; const expired = a.filter(t => t.status === 'expired').length; const unknown = a.filter(t => t.status === 'unknown').length; const resolved = confirmed + failed; const hitRate = resolved >= 5 ? Math.round((confirmed / resolved) * 100) : null; const avgConf = a.length > 0 ? Math.round(a.reduce((s, x) => s + x.confidence, 0) / a.length) : null; const needsReview = (unknown > 3 && unknown > confirmed) || (resolved >= 5 && (hitRate ?? 100) < 30); const reviewReason = unknown > 3 ? 'Muitos alertas sem dados' : (resolved >= 5 && (hitRate ?? 100) < 30) ? 'Taxa baixa' : ''; return { pattern: p, total: a.length, confirmed, partial, failed, expired, unknown, resolved, hitRate, avgConf, lastHit: a[0]?.timestamp || null, needsReview, reviewReason } }), [patterns, triggeredAlerts])

  const totalDispatched = triggeredAlerts.length
  const totalConfirmed = triggeredAlerts.filter(t => t.status === 'confirmed').length
  const totalPartial = triggeredAlerts.filter(t => t.status === 'confirmed_partial').length
  const totalFailed = triggeredAlerts.filter(t => t.status === 'failed').length
  const totalPending = triggeredAlerts.filter(t => t.status === 'pending').length
  const totalExpired = triggeredAlerts.filter(t => t.status === 'expired' || t.status === 'unknown').length
  const totalResolved = totalConfirmed + totalFailed
  const overallHitRate = totalResolved >= 5 ? Math.round((totalConfirmed / totalResolved) * 100) : null
  const avgConfidence = triggeredAlerts.length > 0 ? Math.round(triggeredAlerts.reduce((s, t) => s + t.confidence, 0) / triggeredAlerts.length) : null
  const activePatterns = patterns.filter(p => p.status === 'active').length
  const patternsNeedingReview = stats.filter(s => s.needsReview)

  if (patterns.length === 0) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] via-white/[0.008] to-transparent p-10 text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-4"><BarChart3 size={20} className="text-white/40" /></div>
        <h3 className="text-[18px] font-semibold text-white/85 mb-1.5">Sem dados suficientes</h3>
        <p className="text-[12px] text-white/55 max-w-[440px] mx-auto leading-relaxed">Ative padrões e deixe o sistema acumular resoluções reais. Taxa de acerto aparece com 5 ou mais resoluções (confirmadas + falhadas).</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        {/* Header */}
        <header className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-6">
          <div>
            <h2 className="text-[20px] font-bold text-white/90 tracking-tight">Performance dos radares</h2>
            <p className="text-[12px] text-white/55 mt-1">Mede padrões disparados, resoluções e jornadas pré-jogo vs resultado.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01] mt-5">
            <CounterCell label="Padrões ativos" value={activePatterns} tone="cyan" />
            <CounterCell label="Disparos" value={totalDispatched} tone="white" />
            <CounterCell label="Confirmados" value={totalConfirmed} tone="emerald" />
            <CounterCell label="Falhados" value={totalFailed} tone="rose" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01] mt-px">
            <CounterCell label="Pendentes" value={totalPending} tone="amber" />
            <CounterCell label="Parciais" value={totalPartial} tone="cyan" />
            <CounterCell label="Expirados" value={totalExpired} tone="white" />
            <div className="px-3 py-2.5 text-center bg-[#080d16]">
              <span className={`text-[18px] font-bold tabular-nums block leading-none ${overallHitRate !== null ? 'text-emerald-300' : 'text-white/35'}`}>{overallHitRate !== null ? `${overallHitRate}%` : '—'}</span>
              <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">Taxa de acerto</span>
            </div>
          </div>
          {overallHitRate === null && totalDispatched > 0 && (
            <p className="text-[10px] text-white/45 mt-3 leading-snug">Taxa só aparece com pelo menos 5 resoluções (confirmadas + falhadas). Atualmente: {totalResolved}/5.</p>
          )}
          {avgConfidence !== null && (
            <p className="text-[11px] text-white/55 mt-2">Confiança média no disparo: <span className="text-white/85 font-bold tabular-nums">{avgConfidence}%</span></p>
          )}
        </header>

        {/* Patterns needing review */}
        {patternsNeedingReview.length > 0 && (
          <section className="rounded-2xl border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.04] via-transparent to-transparent p-5">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300 mb-3">Padrões para revisar</h4>
            <div className="space-y-2">
              {patternsNeedingReview.map(s => (
                <div key={s.pattern.id} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-white/85 font-semibold truncate">{s.pattern.name}</span>
                  <span className="text-amber-300/80 text-[11px] font-medium shrink-0">{s.reviewReason}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Per-pattern breakdown */}
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Por padrão</h4>
          <div className="space-y-2">
            {stats.map(s => <PatternStatRow key={s.pattern.id} s={s} isAdvanced={isAdvanced} />)}
          </div>
        </section>

        {/* Pre-match outcome */}
        <PreMatchOutcomeSection isAdvanced={isAdvanced} />
      </div>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Saúde da amostra</h4>
          <div className="space-y-2">
            <SidebarRow label="Resoluções válidas" value={totalResolved} tone={totalResolved >= 5 ? 'emerald' : 'amber'} />
            <SidebarRow label="Padrões ativos" value={activePatterns} tone="cyan" />
            <SidebarRow label="Padrões para revisar" value={patternsNeedingReview.length} tone={patternsNeedingReview.length > 0 ? 'amber' : 'white'} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-transparent p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/80 mb-2">Critérios de cálculo</h4>
          <ul className="text-[11px] text-white/65 leading-relaxed space-y-1.5">
            <li>· Taxa = confirmados ÷ (confirmados + falhados)</li>
            <li>· Mínimo: 5 resoluções para exibir taxa</li>
            <li>· Pendentes, parciais e expirados não entram no denominador</li>
            <li>· Confiança usa todos os disparos</li>
          </ul>
        </div>
        {totalDispatched < 5 && (
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300 mb-1.5">Dados insuficientes</h4>
            <p className="text-[11px] text-white/65 leading-relaxed">Faltam {Math.max(0, 5 - totalDispatched)} disparos para começar a calcular taxas confiáveis.</p>
          </div>
        )}
      </aside>
    </div>
  )
}

function PatternStatRow({ s, isAdvanced }: { s: { pattern: Pattern; total: number; confirmed: number; partial: number; failed: number; expired: number; unknown: number; resolved: number; hitRate: number | null; avgConf: number | null; lastHit: string | null; needsReview: boolean; reviewReason: string }; isAdvanced: boolean }) {
  const total = Math.max(s.total, 1)
  const confirmedPct = (s.confirmed / total) * 100
  const partialPct = (s.partial / total) * 100
  const failedPct = (s.failed / total) * 100
  const sampleStatus = s.resolved >= 5 ? 'utilizável' : s.resolved >= 2 ? 'em observação' : 'insuficiente'
  const sampleTone = s.resolved >= 5 ? 'text-emerald-300' : s.resolved >= 2 ? 'text-cyan-300' : 'text-white/55'

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-gradient-to-r from-white/[0.012] to-white/[0.005] px-5 py-4">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="text-[13px] font-bold text-white/90 truncate flex-1">{s.pattern.name}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${s.pattern.status === 'active' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/15' : 'bg-white/[0.04] text-white/45 border border-white/[0.06]'}`}>{s.pattern.status === 'active' ? 'Ativo' : 'Pausado'}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.04] ${sampleTone} border border-white/[0.06] whitespace-nowrap`}>{sampleStatus}</span>
      </div>
      {s.total > 0 && (
        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden flex mb-2.5">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${confirmedPct}%` }} />
          <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all" style={{ width: `${partialPct}%` }} />
          <div className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all" style={{ width: `${failedPct}%` }} />
        </div>
      )}
      <div className="flex items-center gap-3 text-[11px] text-white/65 flex-wrap">
        <span><span className="text-white/85 font-bold tabular-nums">{s.total}</span> disparos</span>
        <span className="text-emerald-300">✓ {s.confirmed}</span>
        {s.partial > 0 && <span className="text-cyan-300">~ {s.partial}</span>}
        {s.failed > 0 && <span className="text-rose-300">✗ {s.failed}</span>}
        {s.expired > 0 && <span className="text-white/45">⏱ {s.expired}</span>}
        {s.hitRate !== null ? (
          <span className="ml-auto text-[12px] font-bold tabular-nums text-emerald-300">Taxa {s.hitRate}%</span>
        ) : (
          <span className="ml-auto text-[10px] text-white/45 font-medium">Amostra {s.resolved}/5</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-white/45 mt-1.5 flex-wrap">
        {s.avgConf !== null && <span>Confiança média: <span className="text-white/75 font-semibold tabular-nums">{s.avgConf}%</span></span>}
        {s.lastHit && <span>Último: {new Date(s.lastHit).toLocaleDateString('pt-BR')}</span>}
      </div>
      {isAdvanced && (
        <div className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-white/45 font-mono">
          ✓{s.confirmed} · ~{s.partial} · ✗{s.failed} · ⏱{s.expired} · ?{s.unknown}
        </div>
      )}
    </div>
  )
}
function PreMatchOutcomeSection({ isAdvanced }: { isAdvanced: boolean }) {
  const summary = useMemo(() => buildPreMatchOutcomeSummary(), [])
  if (summary.totalOutcomes === 0) return (<section className="rounded-[20px] border border-white/[0.05] bg-white/[0.008] p-5"><h4 className="text-[12px] font-semibold text-white/45 mb-1">Pré-jogo vs Resultado</h4><p className="text-[11px] text-white/25">Quando partidas tiverem score pré-jogo, alertas e resolução, a análise aparecerá aqui.</p></section>)
  return (
    <section className="rounded-[20px] border border-white/[0.06] bg-white/[0.01] p-5">
      <h4 className="text-[13px] font-semibold text-white/55 mb-1">Pré-jogo vs Resultado</h4>
      <p className="text-[10px] text-white/30 mb-3">Compara leituras pré-jogo, alertas disparados e resoluções reais.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[16px] font-bold text-white/60 block">{summary.totalOutcomes}</span><span className="text-[9px] text-white/30">Jornadas</span></div>
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[16px] font-bold text-emerald-400/70 block">{summary.completeJourneys}</span><span className="text-[9px] text-white/30">Completas</span></div>
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[16px] font-bold text-white/50 block">{summary.withTriggeredAlerts}</span><span className="text-[9px] text-white/30">Com alertas</span></div>
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[16px] font-bold text-white/50 block">{summary.resolvedAlerts}</span><span className="text-[9px] text-white/30">Resolvidos</span></div>
      </div>
      {summary.insufficientSample && <p className="text-[10px] text-white/25 italic mb-3">Dados insuficientes para medir relação entre score e resultado. Os indicadores ficam mais confiáveis conforme jogos são analisados.</p>}
      {!summary.insufficientSample && summary.avgScoreConfirmed !== null && (<div className="flex gap-4 text-[11px] text-white/40 mb-3">{summary.avgScoreConfirmed !== null && <span>Score médio confirmados: <b className="text-emerald-400/70">{summary.avgScoreConfirmed}</b></span>}{summary.avgScoreFailed !== null && <span>Score médio falhados: <b className="text-rose-400/70">{summary.avgScoreFailed}</b></span>}</div>)}
      {isAdvanced && summary.recentOutcomes.length > 0 && (<div className="space-y-1.5 pt-2 border-t border-white/[0.04]"><h5 className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Recentes</h5>{summary.recentOutcomes.slice(0, 5).map(o => (<div key={o.canonicalMatchId} className="flex items-center gap-3 text-[11px] text-white/40"><span className="flex-1 truncate">{o.homeTeam} x {o.awayTeam}</span>{o.monitoredPatterns.length > 0 && <span className="text-[9px] text-white/20 truncate max-w-[120px]">{o.monitoredPatterns.slice(0, 2).map(p => p.patternName).join(', ')}{o.monitoredPatterns.length > 2 ? ` +${o.monitoredPatterns.length - 2}` : ''}</span>}{o.preMatchScore && <span className="text-white/25 tabular-nums">{o.preMatchScore}/100</span>}<span className={`text-[9px] px-2 py-0.5 rounded ${o.outcomeStatus === 'complete' ? 'bg-emerald-500/8 text-emerald-400/50' : o.outcomeStatus === 'prematch_only' ? 'bg-white/[0.03] text-white/20' : 'bg-amber-500/6 text-amber-400/40'}`}>{o.outcomeStatus === 'complete' ? 'Completa' : o.outcomeStatus === 'prematch_only' ? 'Pré-jogo' : 'Resolvida'}</span></div>))}</div>)}
    </section>
  )
}

