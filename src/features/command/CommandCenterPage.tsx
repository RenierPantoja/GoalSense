/**
 * Command Center V3.6 — Wide cockpit layout, intelligence gate, no false positives.
 * Only shows signals when user has configured patterns or auto-discovery.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
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
import { recordScopeEntities, getKnownLeagues, getKnownTeams, getKnownMatches, formatMatchLabel, type ScopeKbMatch } from '@/services/intelligence/scopeKnowledgeBase'
import { isLiveFx, detectChanges, type ChangeEvent } from './commandHelpers'
import type { Pattern, PatternTemplate, PatternHit, PatternCondition, PatternConditionType, FixtureStatsForPattern, ScannerEntry, TriggeredAlert, AutoDiscoveryConfig } from './types/commandTypes'

function toScoring(fx: LiveFixture) {
  return { competition: { name: fx.league.name }, homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name }, awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name }, score: { fullTime: { home: fx.score.home, away: fx.score.away } }, status: fx.status.short === 'LIVE' || fx.status.short === 'HT' ? 'IN_PLAY' : fx.status.short === 'FT' ? 'FINISHED' : 'TIMED', utcDate: fx.date, area: { name: fx.league.country } }
}

type Tab = 'cockpit' | 'patterns' | 'scanner' | 'alerts' | 'performance'

export function CommandCenterPage() {
  const navigate = useNavigate()
  const location = useLocation()
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
  const [prefilledDraft, setPrefilledDraft] = useState<Pattern | null>(null)
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
      // Feed scope knowledge base — non-blocking
      try { recordScopeEntities(fx) } catch { /* */ }
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

  // ─── Prefill from Match Detail / Live Radar ──────────────────────────────
  // Honors:
  //   navigate('/app/command', { state: { openPatternStudio: true, prefillScope: { matches: [cmid], matchLabel: 'A x B' } } })
  // Also reads localStorage 'goalsense_pattern_prefill' as a fallback.
  useEffect(() => {
    const state = (location.state || {}) as { openPatternStudio?: boolean; prefillScope?: { matches?: string[]; matchLabel?: string } }
    let payload: { matches?: string[]; matchLabel?: string } | null = null
    if (state.openPatternStudio && state.prefillScope) {
      payload = state.prefillScope
    } else {
      try {
        const raw = localStorage.getItem('goalsense_pattern_prefill')
        if (raw) {
          const parsed = JSON.parse(raw) as { matches?: string[]; matchLabel?: string }
          if (parsed.matches && parsed.matches.length > 0) payload = parsed
          localStorage.removeItem('goalsense_pattern_prefill')
        }
      } catch { /* */ }
    }
    if (payload?.matches && payload.matches.length > 0) {
      const draft: Pattern = {
        id: 'draft', // ignored by builder; just to satisfy type
        name: payload.matchLabel ? `Radar — ${payload.matchLabel}` : 'Radar personalizado',
        description: '',
        conditions: [{ type: 'is_live', params: {} }],
        severity: 'attention',
        status: 'paused',
        isTemplate: false,
        scope: 'specific_matches',
        scopeFilter: undefined,
        matches: payload.matches,
        minConfidence: 50,
        action: 'register_alert',
        maxTriggersPerMatch: 2,
        antiDuplicateWindow: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setPrefilledDraft(draft)
      setActiveTab('patterns')
      setShowBuilder(true)
      // Clear route state to avoid reopening on rerender
      if (state.openPatternStudio) navigate('.', { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      {activeTab === 'patterns' && <PatternsView patterns={patterns} templates={templates} createFromTemplate={createFromTemplate} createPattern={createPattern} updatePattern={updatePattern} togglePattern={togglePattern} deletePattern={deletePattern} isAdvanced={isAdvanced} showBuilder={showBuilder} setShowBuilder={setShowBuilder} discoveryConfig={discoveryConfig} updateDiscoveryConfig={updateDiscoveryConfig} triggeredAlerts={triggeredAlerts} fixtures={fixtures} prefilledDraft={prefilledDraft} clearPrefilledDraft={() => setPrefilledDraft(null)} />}
      {activeTab === 'scanner' && <ScannerView hasIntelligence={hasIntelligence} entries={scannerEntries} openMatch={openMatch} isAdvanced={isAdvanced} onGoToPatterns={() => setActiveTab('patterns')} patterns={patterns} />}
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

// ═══ SEVERITY PICKER — premium cards with microcopy and example use
function SeverityPicker({ value, onChange }: { value: 'critical' | 'attention' | 'info'; onChange: (v: 'critical' | 'attention' | 'info') => void }) {
  const opts: { v: 'critical' | 'attention' | 'info'; label: string; hint: string; example: string; activeCls: string; dot: string }[] = [
    { v: 'critical', label: 'Crítico', hint: 'Sinal forte que merece atenção imediata.', example: 'Ex.: pressão extrema na reta final.', activeCls: 'border-rose-400/40 bg-rose-500/[0.08] shadow-[0_0_24px_-12px_rgba(251,113,133,0.5)]', dot: 'bg-rose-400' },
    { v: 'attention', label: 'Atenção', hint: 'Sinal relevante, mas não urgente.', example: 'Ex.: jogo aberto com gols possíveis.', activeCls: 'border-amber-400/40 bg-amber-500/[0.08] shadow-[0_0_24px_-12px_rgba(251,191,36,0.5)]', dot: 'bg-amber-400' },
    { v: 'info', label: 'Informação', hint: 'Apenas observação contextual.', example: 'Ex.: estatística interessante para análise.', activeCls: 'border-cyan-400/40 bg-cyan-500/[0.08] shadow-[0_0_24px_-12px_rgba(34,211,238,0.5)]', dot: 'bg-cyan-400' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {opts.map(o => {
        const isActive = value === o.v
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            type="button"
            className={`text-left rounded-2xl border px-4 py-3.5 transition-all ${isActive ? o.activeCls : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.025]'}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${o.dot} ${isActive ? 'shadow-[0_0_10px_currentColor]' : 'opacity-60'}`} />
              <span className={`text-[13px] font-bold ${isActive ? 'text-white/95' : 'text-white/85'}`}>{o.label}</span>
            </div>
            <p className="text-[11px] text-white/65 leading-snug">{o.hint}</p>
            <p className="text-[10px] text-white/35 leading-snug mt-1.5 italic">{o.example}</p>
          </button>
        )
      })}
    </div>
  )
}

// ═══ TOGGLE SETTING ROW — premium row layout: title+description on left, toggle on right
// Used in AutoDiscoveryConfigModal so toggles never overlap text.
function ToggleSettingRow({ title, description, checked, onChange }: { title: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-4 py-3 first:pt-0 last:pb-0 border-b border-white/[0.04] last:border-b-0 min-h-[56px]">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white/95 font-semibold leading-tight">{title}</p>
        {description && <p className="text-[11px] text-white/55 leading-snug mt-1">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">
        <PremiumToggle checked={checked} onChange={onChange} ariaLabel={title} size="md" />
      </div>
    </div>
  )
}

// ═══ WIZARD PROGRESS RAIL — Apple/Linear-like horizontal step rail.
// Replaces the old vertical sidebar. Steps connect via a thin track with a
// cyan progress fill that grows as the user advances. Each step shows a
// circular indicator (number, ✓ for complete, glow for active) and a label.
type WizardStep<K extends string> = { key: K; label: string; valid: boolean; required: boolean }

function WizardProgressRail<K extends string>({ steps, current, onSelect }: { steps: WizardStep<K>[]; current: K; onSelect: (k: K) => void }) {
  const currentIndex = Math.max(0, steps.findIndex(s => s.key === current))
  const total = steps.length
  const progressPct = total > 1 ? Math.min(100, (currentIndex / (total - 1)) * 100) : 0
  return (
    <nav aria-label="Etapas" className="relative">
      {/* Track + fill (desktop only — clean horizontal rail) */}
      <div className="hidden sm:block absolute left-3 right-3 top-[15px] h-[2px] rounded-full bg-white/[0.06]" aria-hidden />
      <div
        className="hidden sm:block absolute left-3 top-[15px] h-[2px] rounded-full bg-gradient-to-r from-cyan-400/70 via-cyan-400/45 to-cyan-300/15 transition-all duration-500 ease-out shadow-[0_0_14px_-4px_rgba(34,211,238,0.55)]"
        style={{ width: `calc((100% - 24px) * ${progressPct / 100})` }}
        aria-hidden
      />
      <ol className="relative z-10 flex items-start gap-2 sm:gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1" style={{ overflowY: 'hidden' }}>
        {steps.map((s, i) => {
          const isActive = current === s.key
          const isComplete = s.valid && i < currentIndex
          return (
            <li key={s.key} className="shrink-0 sm:flex-1 sm:min-w-0">
              <button
                onClick={() => onSelect(s.key)}
                type="button"
                aria-current={isActive ? 'step' : undefined}
                className="group flex sm:flex-col items-center sm:items-start gap-2 sm:gap-1.5 w-full text-left"
              >
                <span className={`h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold tabular-nums shrink-0 transition-all ${isActive
                  ? 'bg-gradient-to-br from-cyan-400/35 to-blue-500/35 text-cyan-50 border border-cyan-300/55 shadow-[0_0_24px_-4px_rgba(34,211,238,0.7),inset_0_1px_0_rgba(255,255,255,0.1)]'
                  : isComplete
                    ? 'bg-emerald-500/22 text-emerald-200 border border-emerald-400/35 shadow-[0_0_18px_-8px_rgba(52,211,153,0.55)]'
                    : 'bg-[#0a0d14] text-white/55 border border-white/[0.1] group-hover:border-white/[0.18] group-hover:text-white/85'}`}>
                  {isComplete ? '✓' : i + 1}
                </span>
                <div className="min-w-0">
                  <span className={`text-[11px] font-semibold whitespace-nowrap block leading-tight transition-colors ${isActive ? 'text-white/95' : isComplete ? 'text-white/75' : 'text-white/55 group-hover:text-white/85'}`}>{s.label}</span>
                  {s.required && !s.valid && !isActive && <span className="hidden sm:block text-[10px] text-amber-300/85 leading-tight font-medium">obrigatório</span>}
                  {isComplete && <span className="hidden sm:block text-[10px] text-emerald-300/70 leading-tight font-medium">concluído</span>}
                </div>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ═══ WIZARD STEP HEADER — editorial title block for each step.
function WizardStepHeader({ index, total, title, description }: { index: number; total: number; title: string; description?: string }) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/85">Passo {index} de {total}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-cyan-400/30 to-transparent" />
      </div>
      <h3 className="text-[20px] sm:text-[22px] font-bold text-white/95 tracking-tight leading-[1.15]">{title}</h3>
      {description && <p className="text-[13px] text-white/65 leading-relaxed mt-2 max-w-[600px]">{description}</p>}
    </header>
  )
}

// ═══ RADAR SUMMARY PANEL — premium contextual side panel.
// Shows live identity, scope chips, action, conditions, and a small flow
// diagram explaining how the radar runs. Replaces the old MiniRadarPreview.
type DraftStatus = 'draft' | 'paused' | 'active'
function RadarSummaryPanel({ name, status, severity, scope, scopeFilter, matches, action, minConf, conditions, requireRichData, onlyLive, onlyPreMatch, currentStepLabel, totalSteps, currentStepIndex }: {
  name: string
  status: DraftStatus
  severity: 'critical' | 'attention' | 'info'
  scope: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'
  scopeFilter?: string[]
  matches?: string[]
  action: 'register_alert' | 'suggest_only' | 'highlight'
  minConf: number
  conditions: PatternCondition[]
  requireRichData?: boolean
  onlyLive?: boolean
  onlyPreMatch?: boolean
  currentStepLabel?: string
  totalSteps?: number
  currentStepIndex?: number
}) {
  const sevLabel = severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Informação'
  const sevTone = severity === 'critical' ? 'text-rose-300' : severity === 'attention' ? 'text-amber-300' : 'text-cyan-300'
  const scopeLabel = scope === 'favorites_only' ? 'Favoritos'
    : scope === 'specific_leagues' ? `${scopeFilter?.length || 0} liga${(scopeFilter?.length || 0) === 1 ? '' : 's'}`
    : scope === 'specific_teams' ? `${scopeFilter?.length || 0} time${(scopeFilter?.length || 0) === 1 ? '' : 's'}`
    : scope === 'specific_matches' ? `${matches?.length || 0} partida${(matches?.length || 0) === 1 ? '' : 's'}`
    : 'Todos os jogos'
  const actionLabel = action === 'register_alert' ? 'Registra alerta' : action === 'suggest_only' ? 'Apenas sugere' : 'Destaca'
  const actionTone = action === 'register_alert' ? 'text-emerald-300' : action === 'suggest_only' ? 'text-white/75' : 'text-cyan-300'
  const statusLabel = status === 'active' ? 'Ativo' : status === 'paused' ? 'Pausado' : 'Rascunho'
  const statusTone = status === 'active' ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'
    : status === 'paused' ? 'bg-white/[0.05] text-white/65 border-white/[0.08]'
    : 'bg-cyan-500/12 text-cyan-200 border-cyan-400/22'

  // Flow diagram steps and which one is the "current" focus, derived from
  // the wizard step index. The flow is conceptual (what happens in production).
  const flowSteps = [
    { label: 'Avalia partidas', hint: 'em paralelo, no escopo definido' },
    { label: 'Detecta padrão', hint: 'todas as condições verdadeiras' },
    { label: action === 'register_alert' ? 'Registra alerta' : action === 'suggest_only' ? 'Sugere no Cockpit' : 'Destaca no Scanner', hint: action === 'register_alert' ? 'envia para /app/alerts' : action === 'suggest_only' ? 'visível mas sem alerta' : 'apenas marca no Scanner' },
    { label: 'Resolve resultado', hint: action === 'register_alert' ? 'motor confirma ou descarta' : 'sem acompanhamento' },
  ]

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] via-white/[0.012] to-transparent p-4 sticky top-0 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">Resumo</span>
        <span className={`text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-md border ${statusTone}`}>{statusLabel}</span>
        {currentStepLabel && totalSteps && typeof currentStepIndex === 'number' && (
          <span className="ml-auto text-[10px] text-white/45 tabular-nums">{currentStepIndex + 1}/{totalSteps}</span>
        )}
      </div>

      {/* Identity */}
      <h4 className="text-[14px] font-bold text-white/95 truncate leading-tight">{name || 'Sem nome'}</h4>
      <p className="text-[11px] text-white/55 truncate mt-0.5">{currentStepLabel || 'Configurando radar'}</p>

      {/* Stats grid */}
      <dl className="mt-4 space-y-2 text-[11px]">
        <div className="flex items-center justify-between gap-2"><dt className="text-white/55">Severidade</dt><dd className={`font-bold ${sevTone}`}>{sevLabel}</dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="text-white/55">Escopo</dt><dd className="text-white/95 font-semibold truncate max-w-[60%] text-right">{scopeLabel}</dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="text-white/55">Ação</dt><dd className={`font-bold ${actionTone}`}>{actionLabel}</dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="text-white/55">Confiança</dt><dd className="text-white/95 font-bold tabular-nums">≥ {minConf}%</dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="text-white/55">Condições</dt><dd className="text-white/95 font-bold tabular-nums">{conditions.length}</dd></div>
      </dl>

      {/* Filter badges */}
      {(onlyLive || onlyPreMatch || requireRichData) && (
        <div className="mt-3 pt-3 border-t border-white/[0.05] flex flex-wrap gap-1">
          {onlyLive && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/12 text-emerald-300 border border-emerald-400/20">Ao vivo</span>}
          {onlyPreMatch && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/12 text-cyan-300 border border-cyan-400/20">Pré-jogo</span>}
          {requireRichData && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.05] text-white/75 border border-white/[0.08]">Dados ricos</span>}
        </div>
      )}

      {/* Flow diagram */}
      <div className="mt-4 pt-4 border-t border-white/[0.05]">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40 block mb-2.5">Fluxo do radar</span>
        <ol className="space-y-2">
          {flowSteps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-[1px] h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold tabular-nums text-white/65 bg-white/[0.04] border border-white/[0.08] shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-white/85 font-semibold leading-tight">{s.label}</p>
                <p className="text-[10px] text-white/45 leading-tight mt-0.5">{s.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ═══ ACTION CARDS — used in step "Escopo e ação"
function ActionCardPicker({ value, onChange }: { value: 'register_alert' | 'suggest_only' | 'highlight'; onChange: (v: 'register_alert' | 'suggest_only' | 'highlight') => void }) {
  const opts: { v: 'register_alert' | 'suggest_only' | 'highlight'; label: string; hint: string; badge: string; badgeTone: string }[] = [
    { v: 'register_alert', label: 'Registrar alerta', hint: 'Vai para /app/alerts e é acompanhado pelo motor de resolução.', badge: 'Envia para /app/alerts', badgeTone: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' },
    { v: 'suggest_only', label: 'Apenas sugerir', hint: 'Aparece no Cockpit e Scanner, mas não dispara alerta.', badge: 'Não dispara alerta', badgeTone: 'bg-white/[0.05] text-white/65 border-white/[0.07]' },
    { v: 'highlight', label: 'Destacar no Scanner', hint: 'Apenas marca visualmente sem registrar nada.', badge: 'Visual', badgeTone: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15' },
  ]
  return (
    <div className="grid grid-cols-1 gap-2">
      {opts.map(o => {
        const isActive = value === o.v
        return (
          <button key={o.v} onClick={() => onChange(o.v)} type="button" className={`w-full flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all ${isActive ? 'border-cyan-400/35 bg-cyan-500/[0.08] shadow-[0_0_24px_-12px_rgba(34,211,238,0.45)]' : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.025]'}`}>
            <span className={`mt-0.5 h-4 w-4 rounded-full shrink-0 border-2 ${isActive ? 'border-cyan-400 bg-cyan-500/40' : 'border-white/30'}`}>{isActive && <span className="block h-full w-full rounded-full bg-cyan-300 scale-50" />}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[13px] font-bold ${isActive ? 'text-white/95' : 'text-white/85'}`}>{o.label}</span>
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${o.badgeTone}`}>{o.badge}</span>
              </div>
              <p className="text-[11px] text-white/65 leading-snug mt-1">{o.hint}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ═══ SCOPE PICKER — supports all/favorites/specific_leagues/specific_teams/specific_matches
// Real lists come from `availableLeagues` / `availableTeams` (current fixtures + scope KB).
function ScopePicker({ scope, scopeFilter, matches, excludeLeagues, excludeTeams, excludeMatches, requireRichData, onlyLive, onlyPreMatch, availableLeagues, availableTeams, availableMatches, onScopeChange, onScopeFilterChange, onMatchesChange, onExcludeLeaguesChange, onExcludeTeamsChange, onExcludeMatchesChange, onAdvancedToggle }: {
  scope: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'
  scopeFilter: string[]
  matches: string[]
  excludeLeagues: string[]
  excludeTeams: string[]
  excludeMatches: string[]
  requireRichData: boolean
  onlyLive: boolean
  onlyPreMatch: boolean
  availableLeagues: string[]
  availableTeams: string[]
  availableMatches: ScopeKbMatch[]
  onScopeChange: (s: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches') => void
  onScopeFilterChange: (s: string[]) => void
  onMatchesChange: (s: string[]) => void
  onExcludeLeaguesChange: (s: string[]) => void
  onExcludeTeamsChange: (s: string[]) => void
  onExcludeMatchesChange: (s: string[]) => void
  onAdvancedToggle: (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState<boolean>(excludeLeagues.length > 0 || excludeTeams.length > 0 || excludeMatches.length > 0 || requireRichData || onlyLive || onlyPreMatch)
  const modes: { v: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'; label: string; hint: string }[] = [
    { v: 'all', label: 'Todos os jogos', hint: 'Avalia em qualquer partida disponível.' },
    { v: 'favorites_only', label: 'Apenas favoritos', hint: 'Avalia apenas quando um time favorito está envolvido.' },
    { v: 'specific_leagues', label: 'Ligas específicas', hint: 'Selecione uma ou mais ligas para limitar o radar.' },
    { v: 'specific_teams', label: 'Times específicos', hint: 'Selecione um ou mais times para limitar o radar.' },
    { v: 'specific_matches', label: 'Partidas específicas', hint: 'Restrinja a uma ou mais partidas individuais.' },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {modes.map(m => {
          const isActive = scope === m.v
          return (
            <button key={m.v} onClick={() => onScopeChange(m.v)} type="button" className={`text-left rounded-2xl border px-4 py-3 transition-all ${isActive ? 'border-cyan-400/35 bg-cyan-500/[0.07] shadow-[0_0_20px_-12px_rgba(34,211,238,0.4)]' : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.025]'}`}>
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 h-3.5 w-3.5 rounded-full shrink-0 border-2 ${isActive ? 'border-cyan-400 bg-cyan-500/40' : 'border-white/30'}`}>{isActive && <span className="block h-full w-full rounded-full bg-cyan-300 scale-50" />}</span>
                <div className="flex-1 min-w-0">
                  <span className={`text-[12px] font-bold block ${isActive ? 'text-white/95' : 'text-white/85'}`}>{m.label}</span>
                  <span className="text-[11px] text-white/55 leading-snug block mt-0.5">{m.hint}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {scope === 'specific_leagues' && (
        <ChipMultiPicker label="Selecionar ligas" placeholder="Buscar liga ou digitar para filtrar" options={availableLeagues} selected={scopeFilter} onChange={onScopeFilterChange} emptyHint="Digite o nome de uma liga para adicionar mesmo se não estiver na lista." />
      )}
      {scope === 'specific_teams' && (
        <ChipMultiPicker label="Selecionar times" placeholder="Buscar time ou digitar para filtrar" options={availableTeams} selected={scopeFilter} onChange={onScopeFilterChange} emptyHint="Digite o nome de um time para adicionar mesmo se não estiver na lista." />
      )}
      {scope === 'specific_matches' && (
        <MatchChipPicker label="Selecionar partidas" placeholder="Buscar por time, liga ou digitar 'Home x Away'" options={availableMatches} selected={matches} onChange={onMatchesChange} />
      )}

      {/* Advanced filters disclosure */}
      <div>
        <button type="button" onClick={() => setShowAdvanced(v => !v)} className="text-[11px] font-semibold text-white/65 hover:text-white/95 flex items-center gap-1.5 transition-colors">
          <span>{showAdvanced ? '▾' : '▸'}</span>
          Filtros avançados {(excludeLeagues.length + excludeTeams.length + excludeMatches.length > 0 || requireRichData || onlyLive || onlyPreMatch) && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300">ativos</span>}
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] px-5 py-3">
              <ToggleSettingRow title="Apenas jogos com dados ricos" description="Limita ao provedor ESPN ou jogos com estatísticas em tempo real." checked={requireRichData} onChange={v => onAdvancedToggle('requireRichData', v)} />
              <ToggleSettingRow title="Apenas ao vivo" description="Avalia somente partidas em andamento." checked={onlyLive} onChange={v => onAdvancedToggle('onlyLive', v)} />
              <ToggleSettingRow title="Apenas pré-jogo" description="Avalia somente partidas que ainda não começaram." checked={onlyPreMatch} onChange={v => onAdvancedToggle('onlyPreMatch', v)} />
            </div>
            <ChipMultiPicker label="Excluir ligas" placeholder="Buscar liga para excluir" options={availableLeagues} selected={excludeLeagues} onChange={onExcludeLeaguesChange} emptyHint="Ligas adicionadas aqui serão ignoradas pelo radar." compact />
            <ChipMultiPicker label="Excluir times" placeholder="Buscar time para excluir" options={availableTeams} selected={excludeTeams} onChange={onExcludeTeamsChange} emptyHint="Times adicionados aqui serão ignorados pelo radar." compact />
            <MatchChipPicker label="Excluir partidas" placeholder="Buscar partida para excluir" options={availableMatches} selected={excludeMatches} onChange={onExcludeMatchesChange} compact />
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ MATCH CHIP PICKER — selector for known matches with rich label
function MatchChipPicker({ label, placeholder, options, selected, onChange, compact }: { label: string; placeholder: string; options: ScopeKbMatch[]; selected: string[]; onChange: (v: string[]) => void; compact?: boolean }) {
  const [query, setQuery] = useState('')
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  // Build a quick lookup so we can render selected chips with rich labels even
  // when the source list is huge.
  const labelByCmid = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of options) m.set(o.canonicalMatchId, formatMatchLabel(o))
    return m
  }, [options])

  const filtered = useMemo(() => {
    const q = norm(query)
    const remaining = options.filter(o => !selected.includes(o.canonicalMatchId))
    if (!q) return remaining.slice(0, 12)
    return remaining.filter(o => norm(`${o.homeTeam} ${o.awayTeam} ${o.league || ''}`).includes(q)).slice(0, 12)
  }, [options, selected, query])

  const addCmid = (cmid: string) => {
    if (selected.includes(cmid)) return
    onChange([...selected, cmid])
    setQuery('')
  }
  const addFreeText = (val: string) => {
    const trimmed = val.trim()
    if (!trimmed) return
    if (selected.includes(trimmed)) return
    onChange([...selected, trimmed])
    setQuery('')
  }
  const remove = (val: string) => onChange(selected.filter(s => s !== val))

  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.012] px-4 ${compact ? 'py-3' : 'py-4'}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 mb-2">{label} {selected.length > 0 && <span className="text-white/85 ml-1">({selected.length})</span>}</p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {selected.map(s => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-white/95 bg-white/[0.06] border border-white/[0.1] px-2.5 py-1 rounded-lg font-medium max-w-full">
              <span className="truncate">{labelByCmid.get(s) || s}</span>
              <button onClick={() => remove(s)} type="button" className="text-white/45 hover:text-rose-300 transition-colors -mr-0.5 shrink-0" aria-label={`Remover ${s}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFreeText(query) } }}
          placeholder={placeholder}
          className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-white/95 placeholder:text-white/35 outline-none focus:border-cyan-400/40"
        />
        {query.trim() && (
          <button onClick={() => addFreeText(query)} type="button" className="px-3 h-9 rounded-xl text-[11px] font-semibold text-cyan-300 bg-cyan-500/15 border border-cyan-400/25 hover:bg-cyan-500/25 transition-colors whitespace-nowrap">Adicionar texto</button>
        )}
      </div>
      {filtered.length > 0 && (
        <ul className="mt-2 space-y-1">
          {filtered.map(o => (
            <li key={o.canonicalMatchId}>
              <button onClick={() => addCmid(o.canonicalMatchId)} type="button" className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.05] hover:border-white/[0.1] transition-all">
                <span className="text-[12px] text-white/95 font-medium truncate flex-1">{o.homeTeam} <span className="text-white/45">x</span> {o.awayTeam}</span>
                {o.league && <span className="text-[10px] text-white/55 truncate max-w-[120px]">{o.league}</span>}
                {o.status && (o.status === 'LIVE' || o.status === '1H' || o.status === '2H' || o.status === 'HT') && <span className="text-[10px] text-emerald-300 font-bold">ao vivo</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {options.length === 0 && (
        <p className="text-[10px] text-white/55 mt-2 leading-snug">Abra partidas no Live Radar ou em Partidas para preencher esta biblioteca. Você também pode digitar manualmente.</p>
      )}
      {filtered.length === 0 && options.length > 0 && query.trim() && (
        <p className="text-[10px] text-white/45 mt-2 leading-snug">Nenhuma sugestão. Pressione Enter para adicionar "{query.trim()}".</p>
      )}
    </div>
  )
}

// ═══ CHIP MULTI PICKER — search + select from real list, free-text fallback
function ChipMultiPicker({ label, placeholder, options, selected, onChange, emptyHint, compact }: { label: string; placeholder: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; emptyHint?: string; compact?: boolean }) {
  const [query, setQuery] = useState('')
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const filtered = useMemo(() => {
    const q = norm(query)
    const remaining = options.filter(o => !selected.some(s => norm(s) === norm(o)))
    if (!q) return remaining.slice(0, 18)
    return remaining.filter(o => norm(o).includes(q)).slice(0, 18)
  }, [options, selected, query])

  const addItem = (val: string) => {
    const trimmed = val.trim()
    if (!trimmed) return
    if (selected.some(s => norm(s) === norm(trimmed))) return
    onChange([...selected, trimmed])
    setQuery('')
  }
  const removeItem = (val: string) => onChange(selected.filter(s => s !== val))

  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.012] px-4 ${compact ? 'py-3' : 'py-4'}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 mb-2">{label} {selected.length > 0 && <span className="text-white/85 ml-1">({selected.length})</span>}</p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {selected.map(s => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-white/95 bg-white/[0.06] border border-white/[0.1] px-2.5 py-1 rounded-lg font-medium">
              {s}
              <button onClick={() => removeItem(s)} type="button" className="text-white/45 hover:text-rose-300 transition-colors -mr-0.5" aria-label={`Remover ${s}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(query) } }}
          placeholder={placeholder}
          className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-white/95 placeholder:text-white/35 outline-none focus:border-cyan-400/40"
        />
        {query.trim() && (
          <button onClick={() => addItem(query)} type="button" className="px-3 h-9 rounded-xl text-[11px] font-semibold text-cyan-300 bg-cyan-500/15 border border-cyan-400/25 hover:bg-cyan-500/25 transition-colors whitespace-nowrap">Adicionar "{query.trim()}"</button>
        )}
      </div>
      {filtered.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filtered.map(o => (
            <button key={o} onClick={() => addItem(o)} type="button" className="text-[11px] text-white/65 hover:text-white/95 bg-white/[0.025] hover:bg-white/[0.05] px-2.5 py-1 rounded-lg border border-white/[0.05] hover:border-white/[0.1] transition-all">+ {o}</button>
          ))}
        </div>
      )}
      {filtered.length === 0 && options.length === 0 && emptyHint && (
        <p className="text-[10px] text-white/45 mt-2 leading-snug">{emptyHint}</p>
      )}
      {filtered.length === 0 && options.length > 0 && query.trim() && (
        <p className="text-[10px] text-white/45 mt-2 leading-snug">Nenhuma sugestão. Pressione Enter para adicionar "{query.trim()}".</p>
      )}
    </div>
  )
}

// ═══ CONFIDENCE SLIDER — visual ruler with sensible/balanced/strict zones
function ConfidenceSlider({ value, onChange, action }: { value: number; onChange: (v: number) => void; action: 'register_alert' | 'suggest_only' | 'highlight' }) {
  const zone = value < 45 ? 'sensible' : value < 70 ? 'balanced' : 'strict'
  const zoneLabel = zone === 'sensible' ? 'Sensível' : zone === 'balanced' ? 'Equilibrado' : 'Rigoroso'
  const zoneTone = zone === 'sensible' ? 'text-amber-300' : zone === 'balanced' ? 'text-cyan-300' : 'text-emerald-300'
  const zoneHint = zone === 'sensible'
    ? 'Mais alertas, com menor rigor — bom para descobrir padrões novos.'
    : zone === 'balanced'
    ? 'Equilíbrio entre volume e qualidade — recomendado para uso geral.'
    : 'Menos alertas, só sinais muito fortes — bom para foco em alta convicção.'
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.025] to-transparent p-5">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Confiança mínima</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[36px] font-bold tabular-nums text-white/95 leading-none">{value}</span>
            <span className="text-[14px] text-white/45 font-semibold">%</span>
          </span>
        </div>
        {/* Slider */}
        <div className="relative pt-1">
          <input
            type="range"
            min={20}
            max={95}
            value={value}
            onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
          {/* Zones ruler */}
          <div className="grid grid-cols-3 mt-2 gap-1 text-[10px] font-semibold uppercase tracking-wider">
            <span className={`${zone === 'sensible' ? 'text-amber-300' : 'text-white/35'}`}>Sensível</span>
            <span className={`text-center ${zone === 'balanced' ? 'text-cyan-300' : 'text-white/35'}`}>Equilibrado</span>
            <span className={`text-right ${zone === 'strict' ? 'text-emerald-300' : 'text-white/35'}`}>Rigoroso</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${zoneTone}`}>{zoneLabel}</span>
          <span className="text-[11px] text-white/65 leading-snug">{zoneHint}</span>
          <input
            type="number"
            value={value}
            onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
            className="ml-auto w-16 h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] text-white/95 tabular-nums text-center outline-none focus:border-cyan-400/40"
            min={0}
            max={100}
          />
        </div>
      </div>
      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.04] px-4 py-3.5">
        <p className="text-[12px] text-white/85 leading-relaxed">
          O radar só dispara com confiança ≥ <span className="text-white/95 font-bold tabular-nums">{value}%</span>.
          {action === 'register_alert' && <> Alertas serão registrados em <span className="text-cyan-300 font-semibold">/app/alerts</span> e acompanhados pelo motor de resolução.</>}
          {action === 'suggest_only' && <> Aparecerá apenas como sugestão no Cockpit, sem registrar alerta.</>}
          {action === 'highlight' && <> Apenas destaca a partida no Scanner sem registrar nada.</>}
        </p>
      </div>
    </div>
  )
}

// ═══ TEMPLATE CONFIG MODAL
// ═══ TEMPLATE CONFIG MODAL — stepper wizard
type TemplateStep = 'overview' | 'conditions' | 'scope_action' | 'confidence' | 'review'

function TemplateConfigModal({ open, template, existingPattern, onClose, onSave, availableLeagues, availableTeams, availableMatches }: { open: boolean; template: PatternTemplate | null; existingPattern: Pattern | null; onClose: () => void; onSave: (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void; availableLeagues: string[]; availableTeams: string[]; availableMatches: ScopeKbMatch[] }) {
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
  const [scope, setScope] = useState<'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'>(initial?.scope || 'all')
  const [scopeFilter, setScopeFilter] = useState<string[]>(initial?.scopeFilter || [])
  const [matchesFilter, setMatchesFilter] = useState<string[]>(existingPattern?.matches || [])
  const [excludeLeagues, setExcludeLeagues] = useState<string[]>(existingPattern?.excludeLeagues || [])
  const [excludeTeams, setExcludeTeams] = useState<string[]>(existingPattern?.excludeTeams || [])
  const [excludeMatches, setExcludeMatches] = useState<string[]>(existingPattern?.excludeMatches || [])
  const [requireRichData, setRequireRichData] = useState<boolean>(existingPattern?.requireRichData || false)
  const [onlyLive, setOnlyLive] = useState<boolean>(existingPattern?.onlyLive || false)
  const [onlyPreMatch, setOnlyPreMatch] = useState<boolean>(existingPattern?.onlyPreMatch || false)
  const [minConf, setMinConf] = useState<number>(initial?.minConfidence ?? 50)
  const [step, setStep] = useState<TemplateStep>('overview')

  useEffect(() => {
    if (!open) return
    setConditions(initial?.conditions || [])
    setSeverity(initial?.severity || 'attention')
    setAction(initial?.action || 'register_alert')
    setScope(initial?.scope || 'all')
    setScopeFilter(initial?.scopeFilter || [])
    setMatchesFilter(existingPattern?.matches || [])
    setExcludeLeagues(existingPattern?.excludeLeagues || [])
    setExcludeTeams(existingPattern?.excludeTeams || [])
    setExcludeMatches(existingPattern?.excludeMatches || [])
    setRequireRichData(existingPattern?.requireRichData || false)
    setOnlyLive(existingPattern?.onlyLive || false)
    setOnlyPreMatch(existingPattern?.onlyPreMatch || false)
    setMinConf(initial?.minConfidence ?? 50)
    setStep('overview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, existingPattern?.id])

  if (!open || !template) return null

  const cat = categorizeTemplate(template)
  const canSave = conditions.length > 0
  const buildPatternData = (status: 'active' | 'paused'): Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: template.name, description: template.description,
    conditions, severity, status, isTemplate: true, templateId: template.id,
    scope,
    scopeFilter: (scope === 'specific_leagues' || scope === 'specific_teams') && scopeFilter.length > 0 ? scopeFilter : undefined,
    matches: matchesFilter.length > 0 ? matchesFilter : undefined,
    excludeLeagues: excludeLeagues.length > 0 ? excludeLeagues : undefined,
    excludeTeams: excludeTeams.length > 0 ? excludeTeams : undefined,
    excludeMatches: excludeMatches.length > 0 ? excludeMatches : undefined,
    requireRichData: requireRichData || undefined,
    onlyLive: onlyLive || undefined,
    onlyPreMatch: onlyPreMatch || undefined,
    minConfidence: minConf, action,
    maxTriggersPerMatch: 2, antiDuplicateWindow: 5,
  })

  const handleAdvancedToggle = (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => {
    if (key === 'requireRichData') setRequireRichData(v)
    if (key === 'onlyLive') { setOnlyLive(v); if (v) setOnlyPreMatch(false) }
    if (key === 'onlyPreMatch') { setOnlyPreMatch(v); if (v) setOnlyLive(false) }
  }

  const steps: WizardStep<TemplateStep>[] = [
    { key: 'overview', label: 'Entenda o radar', valid: true, required: false },
    { key: 'conditions', label: 'Condições', valid: canSave, required: true },
    { key: 'scope_action', label: 'Escopo e ação', valid: true, required: false },
    { key: 'confidence', label: 'Confiança', valid: true, required: false },
    { key: 'review', label: 'Revisão', valid: canSave, required: false },
  ]
  const stepIndex = steps.findIndex(s => s.key === step)
  const goPrev = () => { if (stepIndex > 0) setStep(steps[stepIndex - 1].key) }
  const goNext = () => { if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1].key) }
  const isLast = step === 'review'

  return (
    <ModalShell open={open} onClose={onClose} title={template.name} subtitle={template.description} maxWidth="max-w-[1180px]"
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-400/20">{existingPattern ? 'Editando radar' : 'Rascunho'}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-white/[0.05] text-white/65 border border-white/[0.08]">Template GoalSense</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-white/[0.04] text-white/65 border border-white/[0.07]">{CATEGORY_LABELS[cat]}</span>
          <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md border ${severity === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : severity === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'}`}>{severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Info'}</span>
          {existingPattern && <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md border ${existingPattern.status === 'active' ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : 'bg-white/[0.05] text-white/65 border-white/[0.07]'}`}>{existingPattern.status === 'active' ? 'Ativo' : 'Pausado'}</span>}
        </div>
      }
      footer={
        <>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          {stepIndex > 0 && <button onClick={goPrev} type="button" className="px-3.5 py-2.5 rounded-xl text-[12px] font-medium text-white/75 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-all">Voltar</button>}
          {!isLast && <button onClick={goNext} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-all">Próximo</button>}
          <button onClick={() => { onSave(buildPatternData('paused')); onClose() }} disabled={!canSave} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar pausado</button>
          <button onClick={() => { onSave(buildPatternData('active')); onClose() }} disabled={!canSave} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-bold bg-gradient-to-r from-cyan-500/22 to-blue-500/22 text-cyan-200 border border-cyan-400/30 hover:from-cyan-500/32 hover:to-blue-500/32 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_28px_-8px_rgba(34,211,238,0.6)]">Salvar e ativar</button>
        </>
      }
    >
      {/* Progress rail at top */}
      <div className="mb-7 px-1">
        <WizardProgressRail steps={steps} current={step} onSelect={setStep} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Step content */}
        <div className="lg:col-span-8 min-w-0">
          <div className="animate-fadeIn" key={step}>
            {step === 'overview' && (
              <>
                <WizardStepHeader index={1} total={steps.length} title="Entenda este template" description="Antes de configurar, veja o que ele faz, quando aparece e quais dados ele usa." />
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-cyan-500/[0.05] via-white/[0.02] to-transparent p-5 mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-300/85">{CATEGORY_LABELS[cat]}</span>
                    <span className="h-px flex-1 bg-cyan-400/15" />
                    <span className={`text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-md border ${severity === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : severity === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'}`}>{severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Info'}</span>
                  </div>
                  <h5 className="text-[18px] font-bold text-white/95 mb-1.5 tracking-tight">{template.name}</h5>
                  <p className="text-[13px] text-white/75 leading-relaxed">{template.description}</p>
                </div>
                <Section title="Condições padrão deste template">
                  <ul className="space-y-1.5">
                    {template.conditions.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-white/85"><span className="mt-1.5 h-1 w-1 rounded-full bg-cyan-400/70 shrink-0" /><span>{formatConditionHuman(c)}</span></li>
                    ))}
                  </ul>
                </Section>
                <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.04] px-4 py-3.5">
                  <p className="text-[11px] text-cyan-100/85 leading-relaxed">
                    <span className="font-bold">Importante:</span> este radar não é uma previsão. Ele monitora condições reais ao vivo e sinaliza quando todas forem verdadeiras simultaneamente.
                  </p>
                </div>
              </>
            )}
            {step === 'conditions' && (
              <>
                <WizardStepHeader index={2} total={steps.length} title="Condições" description="Edite os parâmetros, remova ou adicione condições. Todas precisam ser verdadeiras para o radar disparar." />
                <ConditionsEditor conditions={conditions} onChange={setConditions} />
                {!canSave && <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3 mt-4"><p className="text-[11px] text-amber-200">É necessário pelo menos uma condição para salvar este radar.</p></div>}
              </>
            )}
            {step === 'scope_action' && (
              <>
                <WizardStepHeader index={3} total={steps.length} title="Escopo e ação" description="Defina onde o radar é avaliado e o que acontece quando ele detecta um sinal." />
                <Section title="Escopo de análise">
                  <ScopePicker
                    scope={scope}
                    scopeFilter={scopeFilter}
                    matches={matchesFilter}
                    excludeLeagues={excludeLeagues}
                    excludeTeams={excludeTeams}
                    excludeMatches={excludeMatches}
                    requireRichData={requireRichData}
                    onlyLive={onlyLive}
                    onlyPreMatch={onlyPreMatch}
                    availableLeagues={availableLeagues}
                    availableTeams={availableTeams}
                    availableMatches={availableMatches}
                    onScopeChange={setScope}
                    onScopeFilterChange={setScopeFilter}
                    onMatchesChange={setMatchesFilter}
                    onExcludeLeaguesChange={setExcludeLeagues}
                    onExcludeTeamsChange={setExcludeTeams}
                    onExcludeMatchesChange={setExcludeMatches}
                    onAdvancedToggle={handleAdvancedToggle}
                  />
                </Section>
                <Section title="Ação ao detectar">
                  <ActionCardPicker value={action} onChange={setAction} />
                </Section>
                <Section title="Severidade visual">
                  <SeverityPicker value={severity} onChange={setSeverity} />
                </Section>
              </>
            )}
            {step === 'confidence' && (
              <>
                <WizardStepHeader index={4} total={steps.length} title="Qual rigor o radar deve ter?" description="Quanto maior, menos alertas falsos. O radar só dispara quando a confiança calculada for igual ou superior." />
                <ConfidenceSlider value={minConf} onChange={setMinConf} action={action} />
              </>
            )}
            {step === 'review' && (
              <>
                <WizardStepHeader index={5} total={steps.length} title="Revisão" description="Confira a configuração final antes de salvar. Você pode voltar e ajustar." />
                <RadarPreview name={template.name} severity={severity} scope={scope} scopeFilter={scopeFilter} matches={matchesFilter} excludeLeagues={excludeLeagues} excludeTeams={excludeTeams} excludeMatches={excludeMatches} requireRichData={requireRichData} onlyLive={onlyLive} onlyPreMatch={onlyPreMatch} action={action} minConf={minConf} conditions={conditions} />
                <p className="text-[11px] text-white/45 leading-snug mt-4">Após salvar, este radar aparecerá em "Radares configurados" no Pattern Studio.</p>
              </>
            )}
          </div>
        </div>

        {/* Radar summary right */}
        <aside className="lg:col-span-4 hidden lg:block">
          <RadarSummaryPanel
            name={template.name}
            status={existingPattern ? (existingPattern.status === 'active' ? 'active' : 'paused') : 'draft'}
            severity={severity}
            scope={scope}
            scopeFilter={scopeFilter}
            matches={matchesFilter}
            action={action}
            minConf={minConf}
            conditions={conditions}
            requireRichData={requireRichData}
            onlyLive={onlyLive}
            onlyPreMatch={onlyPreMatch}
            currentStepLabel={steps[stepIndex]?.label}
            totalSteps={steps.length}
            currentStepIndex={stepIndex}
          />
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
function RadarPreview({ name, severity, scope, scopeFilter, matches, excludeLeagues, excludeTeams, excludeMatches, requireRichData, onlyLive, onlyPreMatch, action, minConf, conditions }: { name: string; severity: 'critical' | 'attention' | 'info'; scope: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'; scopeFilter?: string[]; matches?: string[]; excludeLeagues?: string[]; excludeTeams?: string[]; excludeMatches?: string[]; requireRichData?: boolean; onlyLive?: boolean; onlyPreMatch?: boolean; action: 'register_alert' | 'suggest_only' | 'highlight'; minConf: number; conditions: PatternCondition[] }) {
  const sevLabel = severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Info'
  const scopeLabel = scope === 'favorites_only'
    ? 'apenas favoritos'
    : scope === 'specific_leagues' && scopeFilter && scopeFilter.length > 0
    ? `${scopeFilter.length} liga${scopeFilter.length === 1 ? '' : 's'} selecionada${scopeFilter.length === 1 ? '' : 's'}`
    : scope === 'specific_teams' && scopeFilter && scopeFilter.length > 0
    ? `${scopeFilter.length} time${scopeFilter.length === 1 ? '' : 's'} selecionado${scopeFilter.length === 1 ? '' : 's'}`
    : scope === 'specific_matches' && matches && matches.length > 0
    ? `${matches.length} partida${matches.length === 1 ? '' : 's'} específica${matches.length === 1 ? '' : 's'}`
    : 'todos os jogos'
  const actionLabel = action === 'register_alert' ? 'registra alerta em /app/alerts' : action === 'suggest_only' ? 'apenas sugere no Cockpit/Scanner' : 'destaca no Scanner'
  const willResolve = action === 'register_alert'
  const stateFlag = onlyLive ? 'apenas ao vivo' : onlyPreMatch ? 'apenas pré-jogo' : null
  const hasExclusions = (excludeLeagues && excludeLeagues.length > 0) || (excludeTeams && excludeTeams.length > 0) || (excludeMatches && excludeMatches.length > 0)
  return (
    <section className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.05] via-blue-500/[0.025] to-transparent px-4 py-3.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300/85 mb-2">Resumo do radar</h4>
      <p className="text-[12px] text-white/85 font-semibold leading-snug">{name || 'Sem nome'}</p>
      <p className="text-[11px] text-white/65 leading-snug mt-1">
        Avaliado em <span className="text-white/85 font-semibold">{scopeLabel}</span>
        {stateFlag && <> · <span className="text-white/85 font-semibold">{stateFlag}</span></>}
        {requireRichData && <> · <span className="text-white/85 font-semibold">somente dados ricos</span></>}
        {' '}com confiança ≥ <span className="text-white/85 font-bold tabular-nums">{minConf}%</span>. Ao detectar, <span className="text-white/85 font-semibold">{actionLabel}</span>.
      </p>
      {scope === 'specific_leagues' && scopeFilter && scopeFilter.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {scopeFilter.slice(0, 5).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded">{s}</span>)}
          {scopeFilter.length > 5 && <span className="text-[10px] text-white/55">+{scopeFilter.length - 5}</span>}
        </div>
      )}
      {scope === 'specific_teams' && scopeFilter && scopeFilter.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {scopeFilter.slice(0, 5).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded">{s}</span>)}
          {scopeFilter.length > 5 && <span className="text-[10px] text-white/55">+{scopeFilter.length - 5}</span>}
        </div>
      )}
      {scope === 'specific_matches' && matches && matches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {matches.slice(0, 3).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded truncate max-w-[180px]">{s}</span>)}
          {matches.length > 3 && <span className="text-[10px] text-white/55">+{matches.length - 3}</span>}
        </div>
      )}
      {hasExclusions && (
        <div className="mt-2 flex flex-wrap gap-1">
          {excludeLeagues && excludeLeagues.map(s => <span key={s} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded">− {s}</span>)}
          {excludeTeams && excludeTeams.map(s => <span key={s} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded">− {s}</span>)}
          {excludeMatches && excludeMatches.map(s => <span key={s} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded truncate max-w-[180px]">− {s}</span>)}
        </div>
      )}
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

function CustomPatternModal({ open, initial, onClose, onSave, availableLeagues, availableTeams, availableMatches }: { open: boolean; initial: Pattern | null; onClose: () => void; onSave: (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void; availableLeagues: string[]; availableTeams: string[]; availableMatches: ScopeKbMatch[] }) {
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.description || '')
  const [severity, setSeverity] = useState<'critical' | 'attention' | 'info'>(initial?.severity || 'attention')
  const [scope, setScope] = useState<'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'>(initial?.scope || 'all')
  const [scopeFilter, setScopeFilter] = useState<string[]>(initial?.scopeFilter || [])
  const [matchesFilter, setMatchesFilter] = useState<string[]>(initial?.matches || [])
  const [excludeLeagues, setExcludeLeagues] = useState<string[]>(initial?.excludeLeagues || [])
  const [excludeTeams, setExcludeTeams] = useState<string[]>(initial?.excludeTeams || [])
  const [excludeMatches, setExcludeMatches] = useState<string[]>(initial?.excludeMatches || [])
  const [requireRichData, setRequireRichData] = useState<boolean>(initial?.requireRichData || false)
  const [onlyLive, setOnlyLive] = useState<boolean>(initial?.onlyLive || false)
  const [onlyPreMatch, setOnlyPreMatch] = useState<boolean>(initial?.onlyPreMatch || false)
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
    setScopeFilter(initial?.scopeFilter || [])
    setMatchesFilter(initial?.matches || [])
    setExcludeLeagues(initial?.excludeLeagues || [])
    setExcludeTeams(initial?.excludeTeams || [])
    setExcludeMatches(initial?.excludeMatches || [])
    setRequireRichData(initial?.requireRichData || false)
    setOnlyLive(initial?.onlyLive || false)
    setOnlyPreMatch(initial?.onlyPreMatch || false)
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
    scopeFilter: (scope === 'specific_leagues' || scope === 'specific_teams') && scopeFilter.length > 0 ? scopeFilter : undefined,
    matches: matchesFilter.length > 0 ? matchesFilter : undefined,
    excludeLeagues: excludeLeagues.length > 0 ? excludeLeagues : undefined,
    excludeTeams: excludeTeams.length > 0 ? excludeTeams : undefined,
    excludeMatches: excludeMatches.length > 0 ? excludeMatches : undefined,
    requireRichData: requireRichData || undefined,
    onlyLive: onlyLive || undefined,
    onlyPreMatch: onlyPreMatch || undefined,
    minConfidence: minConf,
    action,
    maxTriggersPerMatch: initial?.maxTriggersPerMatch ?? 2,
    antiDuplicateWindow: initial?.antiDuplicateWindow ?? 5,
  })

  const handleAdvancedToggle = (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => {
    if (key === 'requireRichData') setRequireRichData(v)
    if (key === 'onlyLive') { setOnlyLive(v); if (v) setOnlyPreMatch(false) }
    if (key === 'onlyPreMatch') { setOnlyPreMatch(v); if (v) setOnlyLive(false) }
  }

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
    <ModalShell open={open} onClose={onClose} title={initial ? 'Editar radar' : 'Criar radar personalizado'} subtitle="Configure uma regra inteligente para o GoalSense monitorar partidas em tempo real." maxWidth="max-w-[1200px]"
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-400/20">{initial ? 'Editando radar' : 'Rascunho'}</span>
          {initial && <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md border ${initial.status === 'active' ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : 'bg-white/[0.05] text-white/65 border-white/[0.07]'}`}>{initial.status === 'active' ? 'Ativo' : 'Pausado'}</span>}
        </div>
      }
      footer={
        <>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          {stepIndex > 0 && <button onClick={goPrev} type="button" className="px-3.5 py-2.5 rounded-xl text-[12px] font-medium text-white/75 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-all">Voltar</button>}
          {stepIndex < steps.length - 1 && <button onClick={goNext} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-all">Próximo</button>}
          <button onClick={() => { onSave(buildData('paused')); onClose() }} disabled={!canSave} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar pausado</button>
          <button onClick={() => { onSave(buildData('active')); onClose() }} disabled={!canSave} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-bold bg-gradient-to-r from-cyan-500/22 to-blue-500/22 text-cyan-200 border border-cyan-400/30 hover:from-cyan-500/32 hover:to-blue-500/32 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_28px_-8px_rgba(34,211,238,0.6)]">{initial ? 'Salvar e ativar' : 'Criar e ativar'}</button>
        </>
      }
    >
      {/* Progress rail at top */}
      <div className="mb-7 px-1">
        <WizardProgressRail steps={steps} current={step} onSelect={setStep} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Step content */}
        <div className="lg:col-span-8 min-w-0 space-y-5">
          <div className="animate-fadeIn" key={step}>
            {step === 'identity' && (
              <>
                <WizardStepHeader index={1} total={steps.length} title="Dê identidade ao radar" description="Escolha um nome claro e uma severidade para organizar seus sinais." />
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 block mb-2">Nome do radar</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ex.: Pressão visitante na reta final"
                      autoFocus
                      className={`w-full h-14 rounded-2xl border bg-white/[0.025] px-5 text-[16px] font-semibold text-white/95 placeholder:text-white/30 placeholder:font-normal outline-none transition-all focus:bg-white/[0.04] focus:shadow-[0_0_28px_-12px_rgba(34,211,238,0.5)] ${name.trim() ? 'border-white/[0.1] focus:border-cyan-400/45' : 'border-amber-400/25 focus:border-amber-400/45'}`}
                    />
                    {!hasName && <p className="text-[11px] text-amber-300/85 mt-2 font-medium">O nome é obrigatório.</p>}
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 block mb-2">Descrição (opcional)</label>
                    <input
                      value={desc}
                      onChange={e => setDesc(e.target.value)}
                      placeholder="Quando este radar é útil?"
                      className="w-full h-12 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-[13px] text-white/95 placeholder:text-white/35 outline-none transition-all focus:border-cyan-400/40 focus:bg-white/[0.04]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 block mb-2">Severidade</label>
                    <p className="text-[11px] text-white/45 mb-3 leading-snug">Reflete a urgência do sinal no Scanner e nos alertas.</p>
                    <SeverityPicker value={severity} onChange={setSeverity} />
                  </div>
                </div>
              </>
            )}
            {step === 'scope' && (
              <>
                <WizardStepHeader index={2} total={steps.length} title="Onde este radar deve atuar?" description="Escolha o escopo de partidas em que este radar pode disparar." />
                <ScopePicker
                  scope={scope}
                  scopeFilter={scopeFilter}
                  matches={matchesFilter}
                  excludeLeagues={excludeLeagues}
                  excludeTeams={excludeTeams}
                  excludeMatches={excludeMatches}
                  requireRichData={requireRichData}
                  onlyLive={onlyLive}
                  onlyPreMatch={onlyPreMatch}
                  availableLeagues={availableLeagues}
                  availableTeams={availableTeams}
                  availableMatches={availableMatches}
                  onScopeChange={setScope}
                  onScopeFilterChange={setScopeFilter}
                  onMatchesChange={setMatchesFilter}
                  onExcludeLeaguesChange={setExcludeLeagues}
                  onExcludeTeamsChange={setExcludeTeams}
                  onExcludeMatchesChange={setExcludeMatches}
                  onAdvancedToggle={handleAdvancedToggle}
                />
              </>
            )}
            {step === 'conditions' && (
              <>
                <WizardStepHeader index={3} total={steps.length} title={`Quais sinais precisam acontecer?`} description="Cada condição precisa ser verdadeira para o radar disparar. Use as categorias abaixo para adicionar." />
                <ConditionsEditor conditions={conditions} onChange={setConditions} />
                {!hasConditions && <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3 mt-4"><p className="text-[11px] text-amber-200 font-medium">É necessário pelo menos uma condição para salvar este radar.</p></div>}
              </>
            )}
            {step === 'action' && (
              <>
                <WizardStepHeader index={4} total={steps.length} title="O que fazer quando bater?" description="Escolha o destino do sinal quando este radar detectar todas as condições." />
                <ActionCardPicker value={action} onChange={setAction} />
              </>
            )}
            {step === 'confidence' && (
              <>
                <WizardStepHeader index={5} total={steps.length} title="Qual rigor o radar deve ter?" description="Quanto maior, menos alertas falsos. Recomendado: 50% para começar." />
                <ConfidenceSlider value={minConf} onChange={setMinConf} action={action} />
              </>
            )}
            {step === 'review' && (
              <>
                <WizardStepHeader index={6} total={steps.length} title="Revise antes de ativar" description="Confira a configuração final. Você pode voltar e ajustar antes de salvar." />
                <RadarPreview name={name.trim()} severity={severity} scope={scope} scopeFilter={scopeFilter} matches={matchesFilter} excludeLeagues={excludeLeagues} excludeTeams={excludeTeams} excludeMatches={excludeMatches} requireRichData={requireRichData} onlyLive={onlyLive} onlyPreMatch={onlyPreMatch} action={action} minConf={minConf} conditions={conditions} />
                <p className="text-[11px] text-white/45 leading-snug mt-4">Após salvar, este radar aparecerá em &ldquo;Radares configurados&rdquo; no Pattern Studio.</p>
              </>
            )}
          </div>
        </div>

        {/* Right panel — radar summary */}
        <aside className="lg:col-span-4 hidden lg:block">
          <RadarSummaryPanel
            name={name.trim()}
            status={initial ? (initial.status === 'active' ? 'active' : 'paused') : 'draft'}
            severity={severity}
            scope={scope}
            scopeFilter={scopeFilter}
            matches={matchesFilter}
            action={action}
            minConf={minConf}
            conditions={conditions}
            requireRichData={requireRichData}
            onlyLive={onlyLive}
            onlyPreMatch={onlyPreMatch}
            currentStepLabel={steps[stepIndex]?.label}
            totalSteps={steps.length}
            currentStepIndex={stepIndex}
          />
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
        {/* HERO STATUS — full width banner at top of grid */}
        <div className="lg:col-span-2">
          <div className={`rounded-2xl border bg-gradient-to-br p-5 ${isActive
            ? 'border-emerald-400/25 from-emerald-500/[0.07] via-emerald-500/[0.03] to-transparent shadow-[0_0_40px_-16px_rgba(52,211,153,0.4)]'
            : config.userConfigured
              ? 'border-cyan-400/22 from-cyan-500/[0.06] via-blue-500/[0.025] to-transparent'
              : 'border-white/[0.08] from-white/[0.03] via-white/[0.012] to-transparent'}`}>
            <div className="flex items-start gap-4">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-emerald-500/20 border border-emerald-400/35' : config.userConfigured ? 'bg-cyan-500/15 border border-cyan-400/25' : 'bg-white/[0.05] border border-white/[0.08]'}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.6)]' : config.userConfigured ? 'bg-cyan-400' : 'bg-white/30'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[15px] font-bold text-white/95 mb-1">
                  {isActive ? 'Motor automático monitorando' : config.userConfigured ? 'Motor configurado, mas pausado' : 'Motor automático desligado'}
                </h4>
                <p className="text-[12px] text-white/65 leading-relaxed">
                  {isActive
                    ? <>Descobrindo padrões em partidas reais com confiança ≥ <span className="text-white/95 font-semibold tabular-nums">{config.minConfidence}%</span>. {config.registerAlertAuto ? 'Registrando alertas automaticamente.' : 'Apenas sugerindo, sem registrar alerta.'}</>
                    : config.userConfigured
                      ? 'Configuração salva. Ative o motor para começar a monitorar partidas.'
                      : 'Configure as preferências abaixo e ative para que o GoalSense procure padrões automaticamente.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* LEFT COLUMN */}
        <div className="space-y-5">
          <Section title="Cobertura" hint="Quais partidas o motor pode analisar.">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] px-5 py-3">
              <ToggleSettingRow title="Monitorar favoritos" description="Inclui partidas com times favoritos." checked={config.monitorFavorites} onChange={v => onChange({ monitorFavorites: v })} />
              <ToggleSettingRow title="Ligas principais" description="Brasileirão, Premier League, La Liga e equivalentes." checked={config.monitorMainLeagues} onChange={v => onChange({ monitorMainLeagues: v })} />
              <ToggleSettingRow title="Todas as ligas" description="Inclui partidas de todas as competições disponíveis." checked={config.monitorAllLeagues} onChange={v => onChange({ monitorAllLeagues: v })} />
            </div>
          </Section>

          <Section title="Momentos do jogo" hint="Quando o motor pode procurar sinais.">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] px-5 py-3">
              <ToggleSettingRow title="Incluir pré-jogo" description="Sinais antes da bola rolar (forma, H2H, perfil de gols)." checked={config.includePreMatch} onChange={v => onChange({ includePreMatch: v })} />
              <ToggleSettingRow title="Incluir ao vivo" description="Sinais durante a partida com base em estatísticas reais." checked={config.includeLive} onChange={v => onChange({ includeLive: v })} />
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
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] px-5 py-3">
              <ToggleSettingRow title="Registrar alerta automaticamente" description="Quando ativo, descobertas viram alertas em /app/alerts e são acompanhadas pelo motor de resolução. Quando desligado, descobertas só aparecem como sugestões no Cockpit/Scanner." checked={config.registerAlertAuto} onChange={v => onChange({ registerAlertAuto: v })} />
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
function PatternsView({ patterns, templates, createFromTemplate, createPattern, updatePattern, togglePattern, deletePattern, isAdvanced, showBuilder, setShowBuilder, discoveryConfig, updateDiscoveryConfig, triggeredAlerts, fixtures, prefilledDraft, clearPrefilledDraft }: { patterns: Pattern[]; templates: PatternTemplate[]; createFromTemplate: (id: string) => Pattern | null; createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern; updatePattern: (id: string, patch: Partial<Pattern>) => void; togglePattern: (id: string) => void; deletePattern: (id: string) => void; isAdvanced: boolean; showBuilder: boolean; setShowBuilder: (v: boolean) => void; discoveryConfig: AutoDiscoveryConfig; updateDiscoveryConfig: (p: Partial<AutoDiscoveryConfig>) => void; triggeredAlerts: TriggeredAlert[]; fixtures: LiveFixture[]; prefilledDraft: Pattern | null; clearPrefilledDraft: () => void }) {
  const [showAutoConfig, setShowAutoConfig] = useState(false)
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null)
  const [templateModal, setTemplateModal] = useState<{ template: PatternTemplate; existing: Pattern | null } | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all')

  // When a prefilled draft arrives (e.g. from Match Detail "Criar radar"), use it
  // as the initial value of the CustomPatternModal. The draft is then cleared.
  useEffect(() => {
    if (prefilledDraft) {
      setEditingPattern(prefilledDraft)
    }
  }, [prefilledDraft])


  // Real lists derived from current fixtures + accumulated patterns + Scope KB
  const availableLeagues = useMemo(() => {
    const set = new Set<string>()
    for (const fx of fixtures) if (fx.league?.name) set.add(fx.league.name)
    for (const p of patterns) {
      if (p.scope === 'specific_leagues' && p.scopeFilter) for (const l of p.scopeFilter) set.add(l)
      if (p.excludeLeagues) for (const l of p.excludeLeagues) set.add(l)
    }
    for (const l of getKnownLeagues()) set.add(l)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [fixtures, patterns])

  const availableTeams = useMemo(() => {
    const set = new Set<string>()
    for (const fx of fixtures) {
      if (fx.homeTeam?.name) set.add(fx.homeTeam.name)
      if (fx.awayTeam?.name) set.add(fx.awayTeam.name)
    }
    for (const p of patterns) {
      if (p.scope === 'specific_teams' && p.scopeFilter) for (const t of p.scopeFilter) set.add(t)
      if (p.excludeTeams) for (const t of p.excludeTeams) set.add(t)
    }
    for (const t of getKnownTeams()) set.add(t)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [fixtures, patterns])

  const availableMatches = useMemo(() => {
    // Combine current fixtures + Scope KB. Dedupe by canonicalMatchId.
    const map = new Map<string, ScopeKbMatch>()
    for (const fx of fixtures) {
      if (!fx.homeTeam?.name || !fx.awayTeam?.name) continue
      const cmid = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
      map.set(cmid, {
        canonicalMatchId: cmid,
        homeTeam: fx.homeTeam.name,
        awayTeam: fx.awayTeam.name,
        league: fx.league?.name,
        date: fx.date,
        status: fx.status?.short,
        provider: fx.provider,
        lastSeen: Date.now(),
      })
    }
    for (const m of getKnownMatches()) if (!map.has(m.canonicalMatchId)) map.set(m.canonicalMatchId, m)
    return Array.from(map.values()).sort((a, b) => b.lastSeen - a.lastSeen)
  }, [fixtures])


  const handleCustomSave = (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => {
    // 'draft' is the synthetic id used by prefilled drafts coming from Match Detail.
    // It must not trigger an update — it's a brand new pattern.
    if (editingPattern && editingPattern.id !== 'draft') updatePattern(editingPattern.id, data)
    else createPattern(data)
    setEditingPattern(null)
    if (prefilledDraft) clearPrefilledDraft()
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
      <CustomPatternModal open={showBuilder} initial={editingPattern} onClose={() => { setShowBuilder(false); setEditingPattern(null); if (prefilledDraft) clearPrefilledDraft() }} onSave={handleCustomSave} availableLeagues={availableLeagues} availableTeams={availableTeams} availableMatches={availableMatches} />
      <TemplateConfigModal open={!!templateModal} template={templateModal?.template || null} existingPattern={templateModal?.existing || null} onClose={() => setTemplateModal(null)} onSave={handleTemplateSave} availableLeagues={availableLeagues} availableTeams={availableTeams} availableMatches={availableMatches} />
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

      {/* Scope intelligence — compact panel showing the Knowledge Base footprint */}
      <ScopeHealthPanel availableLeagues={availableLeagues} availableTeams={availableTeams} availableMatches={availableMatches} fixturesCount={fixtures.length} patternsCount={patterns.length} />

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

// ═══ SCOPE HEALTH PANEL — small premium panel showing Scope KB footprint
function ScopeHealthPanel({ availableLeagues, availableTeams, availableMatches, fixturesCount, patternsCount }: { availableLeagues: string[]; availableTeams: string[]; availableMatches: ScopeKbMatch[]; fixturesCount: number; patternsCount: number }) {
  const navigate = useNavigate()
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-gradient-to-r from-cyan-500/[0.03] via-white/[0.012] to-transparent p-4 flex items-center gap-4 flex-wrap">
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-cyan-500/12 border border-cyan-400/20"><Eye size={16} className="text-cyan-300" /></div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[12px] font-bold text-white/90 tracking-tight">Inteligência de escopo</h3>
        <p className="text-[11px] text-white/55 mt-0.5 leading-snug">A biblioteca local cresce com o uso real e melhora as sugestões do ScopePicker.</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <ScopeStat label="Ligas" value={availableLeagues.length} />
        <ScopeStat label="Times" value={availableTeams.length} />
        <ScopeStat label="Partidas" value={availableMatches.length} />
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-white/45">
        <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">{fixturesCount} fixtures atuais</span>
        <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">{patternsCount} padrões</span>
      </div>
      <button onClick={() => navigate('/app/settings')} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/65 hover:text-white/95 border border-white/[0.07] hover:border-white/[0.12] transition-all">Gerenciar em Settings</button>
    </section>
  )
}

function ScopeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <span className="text-[16px] font-bold text-white/95 block leading-none tabular-nums">{value}</span>
      <span className="text-[9px] text-white/55 uppercase tracking-wider font-semibold mt-0.5 block">{label}</span>
    </div>
  )
}

// ═══ CONFIGURED RADAR ROW
function scopeShortLabel(p: Pattern): string {
  if (p.scope === 'favorites_only') return 'Favoritos'
  if (p.scope === 'specific_leagues' && p.scopeFilter && p.scopeFilter.length > 0) return `${p.scopeFilter.length} liga${p.scopeFilter.length === 1 ? '' : 's'}`
  if (p.scope === 'specific_teams' && p.scopeFilter && p.scopeFilter.length > 0) return `${p.scopeFilter.length} time${p.scopeFilter.length === 1 ? '' : 's'}`
  if (p.scope === 'specific_matches' && p.matches && p.matches.length > 0) return `${p.matches.length} partida${p.matches.length === 1 ? '' : 's'}`
  if (p.matches && p.matches.length > 0) return `${p.matches.length} partida${p.matches.length === 1 ? '' : 's'}`
  return 'Todos'
}

// ═══ Audit helper: describe scope & filters of a pattern in human language
function describePatternScope(p: Pattern): string[] {
  const parts: string[] = []
  if (p.scope === 'favorites_only') parts.push('Apenas favoritos')
  else if (p.scope === 'specific_leagues' && p.scopeFilter && p.scopeFilter.length > 0) parts.push(`${p.scopeFilter.length} liga${p.scopeFilter.length === 1 ? '' : 's'} selecionada${p.scopeFilter.length === 1 ? '' : 's'}`)
  else if (p.scope === 'specific_teams' && p.scopeFilter && p.scopeFilter.length > 0) parts.push(`${p.scopeFilter.length} time${p.scopeFilter.length === 1 ? '' : 's'} selecionado${p.scopeFilter.length === 1 ? '' : 's'}`)
  else if (p.scope === 'specific_matches' && p.matches && p.matches.length > 0) parts.push(`${p.matches.length} partida${p.matches.length === 1 ? '' : 's'} específica${p.matches.length === 1 ? '' : 's'}`)
  else parts.push('Todos os jogos')
  if (p.matches && p.matches.length > 0 && p.scope !== 'specific_matches') parts.push(`+${p.matches.length} partida${p.matches.length === 1 ? '' : 's'}`)
  if (p.requireRichData) parts.push('dados ricos')
  if (p.onlyLive) parts.push('apenas ao vivo')
  if (p.onlyPreMatch) parts.push('apenas pré-jogo')
  if (p.excludeLeagues && p.excludeLeagues.length > 0) parts.push(`exceto ${p.excludeLeagues.length} liga${p.excludeLeagues.length === 1 ? '' : 's'}`)
  if (p.excludeTeams && p.excludeTeams.length > 0) parts.push(`exceto ${p.excludeTeams.length} time${p.excludeTeams.length === 1 ? '' : 's'}`)
  if (p.excludeMatches && p.excludeMatches.length > 0) parts.push(`exceto ${p.excludeMatches.length} partida${p.excludeMatches.length === 1 ? '' : 's'}`)
  return parts
}

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
            <span>· {scopeShortLabel(pattern)}</span>
            {pattern.onlyLive && <span>· ao vivo</span>}
            {pattern.onlyPreMatch && <span>· pré-jogo</span>}
            {pattern.requireRichData && <span>· dados ricos</span>}
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
        <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-2">
          {(() => {
            const detail = describePatternScope(pattern)
            if (detail.length === 0) return null
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Escopo:</span>
                {detail.map((s, i) => <span key={i} className="text-[10px] text-white/65 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded">{s}</span>)}
              </div>
            )
          })()}
          {(pattern.scope === 'specific_leagues' && pattern.scopeFilter && pattern.scopeFilter.length > 0) && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Ligas:</span>
              {pattern.scopeFilter.slice(0, 3).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded">{s}</span>)}
              {pattern.scopeFilter.length > 3 && <span className="text-[10px] text-white/45">+{pattern.scopeFilter.length - 3}</span>}
            </div>
          )}
          {(pattern.scope === 'specific_teams' && pattern.scopeFilter && pattern.scopeFilter.length > 0) && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Times:</span>
              {pattern.scopeFilter.slice(0, 3).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded">{s}</span>)}
              {pattern.scopeFilter.length > 3 && <span className="text-[10px] text-white/45">+{pattern.scopeFilter.length - 3}</span>}
            </div>
          )}
          {pattern.matches && pattern.matches.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Partidas:</span>
              {pattern.matches.slice(0, 3).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded truncate max-w-[200px]">{s}</span>)}
              {pattern.matches.length > 3 && <span className="text-[10px] text-white/45">+{pattern.matches.length - 3}</span>}
            </div>
          )}
          {((pattern.excludeLeagues?.length || 0) + (pattern.excludeTeams?.length || 0) + (pattern.excludeMatches?.length || 0) > 0) && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-rose-300 font-semibold">Exclusões:</span>
              {pattern.excludeLeagues?.slice(0, 2).map(s => <span key={`el-${s}`} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded">− {s}</span>)}
              {pattern.excludeTeams?.slice(0, 2).map(s => <span key={`et-${s}`} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded">− {s}</span>)}
              {pattern.excludeMatches?.slice(0, 2).map(s => <span key={`em-${s}`} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded truncate max-w-[160px]">− {s}</span>)}
            </div>
          )}
          <div className="text-[10px] text-white/45 font-mono">
            id:{pattern.id.slice(0, 12)} · template:{pattern.templateId || 'custom'} · max/jogo:{pattern.maxTriggersPerMatch} · anti-dup:{pattern.antiDuplicateWindow}min
          </div>
        </div>
      )}
    </div>
  )
}


// ═══ SCANNER ═══
type ScannerFilter = 'all' | 'critical' | 'attention' | 'favorites' | 'live' | 'soon' | 'rich'

function ScannerView({ hasIntelligence, entries, openMatch, isAdvanced, onGoToPatterns, patterns }: { hasIntelligence: boolean; entries: ScannerEntry[]; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; onGoToPatterns: () => void; patterns: Pattern[] }) {
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
            {filteredEntries.map(entry => <ScannerRow key={entry.fixture.id} entry={entry} openMatch={openMatch} isAdvanced={isAdvanced} isFavoriteTeam={isFavoriteTeam} patterns={patterns} />)}
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

function ScannerRow({ entry, openMatch, isAdvanced, isFavoriteTeam, patterns }: { entry: ScannerEntry; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; isFavoriteTeam: (name: string) => boolean; patterns: Pattern[] }) {
  const fx = entry.fixture
  const live = isLiveFx(fx)
  const isFav = isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const accentBorder = entry.priority === 'critical' ? 'border-l-rose-400/55' : entry.priority === 'attention' ? 'border-l-amber-400/55' : 'border-l-cyan-400/45'
  const statusLabel = live ? 'Batendo' : entry.topPattern ? 'Pronto' : 'Sugerido'
  const statusColor = live ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : entry.topPattern ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15' : 'bg-white/[0.04] text-white/55 border-white/[0.07]'
  const fullPattern = entry.topPattern ? patterns.find(p => p.id === entry.topPattern!.patternId) : null
  const scopeAudit = fullPattern ? describePatternScope(fullPattern) : null

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
        {scopeAudit && scopeAudit.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Escopo:</span>
            {scopeAudit.map((s, i) => (
              <span key={i} className="text-[10px] text-white/65 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded">{s}</span>
            ))}
          </div>
        )}
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

