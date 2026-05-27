/**
 * Command Center V3.6 — Wide cockpit layout, intelligence gate, no false positives.
 * Only shows signals when user has configured patterns or auto-discovery.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { RefreshCw, Zap, ChevronRight, AlertCircle, Plus, Activity, Target, Eye, BarChart3, Sparkles } from 'lucide-react'
import { getLiveFixtures, type LiveFixture } from '@/lib/apiClient'
import { storeFixtureForNavigation } from '@/lib/matchNavigation'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { useFavorites } from '@/context/FavoritesContext'
import { useAlerts, type CommandCenterAlert } from '@/context/AlertsContext'
import { useViewMode } from '@/context/ViewModeContext'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { getMatchImportanceScore } from '@/utils/matchImportance'
import { usePatterns } from './contexts/PatternContext'
import { evaluateAllPatterns } from './intelligence/patternEvaluator'
import { runAutoDiscovery, type AutoDiscovery } from './intelligence/autoDiscoveryEngine'
import { resolveAlert } from './intelligence/patternResolutionEngine'
import { buildPatternHealth, isReviewableHealth, HEALTH_TONE, type PatternHealth } from './intelligence/patternHealthEngine'
import { buildPreMatchOutcomeSummary } from '@/services/intelligence/preMatchOutcomePerformance'
import { recordScopeEntities, getKnownLeagues, getKnownTeams, getKnownMatches, getKnownLeaguesRich, getKnownTeamsRich, type ScopeKbMatch, type ScopeKbLeague, type ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { isLiveFx, detectChanges, type ChangeEvent } from './commandHelpers'
import type { Pattern, PatternTemplate, PatternHit, FixtureStatsForPattern, ScannerEntry, TriggeredAlert, AutoDiscoveryConfig } from './types/commandTypes'
import { formatConditionHuman, categorizeTemplate, CATEGORY_LABELS, type TemplateCategory } from './utils/commandFormatters'
import { PremiumToggle } from './components/pattern-studio/shell/PremiumToggle'
import { CustomPatternModal } from './components/pattern-studio/modals/CustomPatternModal'
import { TemplateConfigModal } from './components/pattern-studio/modals/TemplateConfigModal'
import { AutoDiscoveryConfigModal } from './components/pattern-studio/modals/AutoDiscoveryConfigModal'

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
      {activeTab === 'patterns' && <PatternsView patterns={patterns} templates={templates} createFromTemplate={createFromTemplate} createPattern={createPattern} updatePattern={updatePattern} togglePattern={togglePattern} deletePattern={deletePattern} isAdvanced={isAdvanced} showBuilder={showBuilder} setShowBuilder={setShowBuilder} discoveryConfig={discoveryConfig} updateDiscoveryConfig={updateDiscoveryConfig} triggeredAlerts={triggeredAlerts} commandAlerts={commandAlerts} fixtures={fixtures} prefilledDraft={prefilledDraft} clearPrefilledDraft={() => setPrefilledDraft(null)} />}
      {activeTab === 'scanner' && <ScannerView hasIntelligence={hasIntelligence} entries={scannerEntries} openMatch={openMatch} isAdvanced={isAdvanced} onGoToPatterns={() => setActiveTab('patterns')} patterns={patterns} />}
      {activeTab === 'alerts' && <AlertsView triggeredAlerts={getRecentTriggered(30)} isAdvanced={isAdvanced} openMatch={openMatch} fixtures={fixtures} navigate={navigate} />}
      {activeTab === 'performance' && <PerformanceView patterns={patterns} triggeredAlerts={triggeredAlerts} commandAlerts={commandAlerts} isAdvanced={isAdvanced} />}
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
// All Pattern Studio UI now lives under `components/pattern-studio/`:
//   - shell/        ModalShell, PremiumToggle, Section, ToggleSettingRow,
//                   WizardProgressRail, WizardStepHeader
//   - scope/        EntityAvatar, LeaguePicker, TeamPicker, MatchPicker,
//                   ScopePicker
//   - triggers/     ConditionsEditor, ParamField
//   - form-controls/ ActionCardPicker, ConfidenceSlider, SeverityPicker
//   - inspector/    InspectorPrimitives, RadarInspectorPanel
//   - preview/      RadarPreview
//   - modals/       CustomPatternModal, TemplateConfigModal,
//                   AutoDiscoveryConfigModal
// Pure helpers live in `utils/commandFormatters`, `utils/patternStudioHelpers`,
// `intelligence/triggerLibrary` and `intelligence/triggerRecipes`. Non-UI
// callers (tests, evaluators) can reuse them without dragging React in.

// ═══ PATTERN STUDIO (PatternsView)
function PatternsView({ patterns, templates, createFromTemplate, createPattern, updatePattern, togglePattern, deletePattern, isAdvanced, showBuilder, setShowBuilder, discoveryConfig, updateDiscoveryConfig, triggeredAlerts, commandAlerts, fixtures, prefilledDraft, clearPrefilledDraft }: { patterns: Pattern[]; templates: PatternTemplate[]; createFromTemplate: (id: string) => Pattern | null; createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern; updatePattern: (id: string, patch: Partial<Pattern>) => void; togglePattern: (id: string) => void; deletePattern: (id: string) => void; isAdvanced: boolean; showBuilder: boolean; setShowBuilder: (v: boolean) => void; discoveryConfig: AutoDiscoveryConfig; updateDiscoveryConfig: (p: Partial<AutoDiscoveryConfig>) => void; triggeredAlerts: TriggeredAlert[]; commandAlerts: CommandCenterAlert[]; fixtures: LiveFixture[]; prefilledDraft: Pattern | null; clearPrefilledDraft: () => void }) {
  const [showAutoConfig, setShowAutoConfig] = useState(false)
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null)
  const [templateModal, setTemplateModal] = useState<{ template: PatternTemplate; existing: Pattern | null } | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all')
  const [templateSearch, setTemplateSearch] = useState('')

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

  // V3.15 — rich lists for the ScopePicker cards (with logos and metadata).
  // Built from current fixtures (highest priority) + scope KB. Names are
  // matched case-insensitively so legacy patterns with bare names still find
  // their richer counterpart.
  const availableLeaguesRich = useMemo<ScopeKbLeague[]>(() => {
    const map = new Map<string, ScopeKbLeague>()
    const norm = (s: string) => s.trim().toLowerCase()
    for (const fx of fixtures) {
      if (!fx.league?.name) continue
      const k = norm(fx.league.name)
      const existing = map.get(k)
      const fresh: ScopeKbLeague = {
        id: String(fx.league.id ?? fx.league.name),
        name: fx.league.name,
        country: fx.league.country || undefined,
        logo: fx.league.logo || existing?.logo || null,
        season: fx.league.season ? String(fx.league.season) : existing?.season,
        provider: fx.provider,
        lastSeen: Date.now(),
        countSeen: (existing?.countSeen || 0) + 1,
      }
      map.set(k, fresh)
    }
    for (const l of getKnownLeaguesRich()) {
      const k = norm(l.name)
      if (!map.has(k)) map.set(k, l)
    }
    // Also pick up league names referenced inside KB matches so leagues we
    // only know through past matches still show up in the picker.
    for (const m of getKnownMatches()) {
      if (!m.league) continue
      const k = norm(m.league)
      if (!map.has(k)) {
        map.set(k, {
          id: m.league,
          name: m.league,
          logo: m.leagueLogo || null,
          provider: m.provider,
          lastSeen: m.lastSeen,
          countSeen: 0,
        })
      }
    }
    // Pattern-only references (no metadata) come last so they don't override richer data
    for (const p of patterns) {
      const refs = [...(p.scope === 'specific_leagues' && p.scopeFilter ? p.scopeFilter : []), ...(p.excludeLeagues || [])]
      for (const name of refs) {
        const k = norm(name)
        if (!map.has(k)) map.set(k, { id: name, name, lastSeen: 0, countSeen: 0 })
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.lastSeen + b.countSeen) - (a.lastSeen + a.countSeen) || a.name.localeCompare(b.name))
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

  const availableTeamsRich = useMemo<ScopeKbTeam[]>(() => {
    const map = new Map<string, ScopeKbTeam>()
    const norm = (s: string) => s.trim().toLowerCase()
    for (const fx of fixtures) {
      for (const team of [fx.homeTeam, fx.awayTeam]) {
        if (!team?.name) continue
        const k = norm(team.name)
        const existing = map.get(k)
        map.set(k, {
          id: String(team.id ?? team.name),
          name: team.name,
          logo: team.logo || existing?.logo || null,
          league: fx.league?.name || existing?.league,
          provider: fx.provider,
          lastSeen: Date.now(),
          countSeen: (existing?.countSeen || 0) + 1,
        })
      }
    }
    for (const t of getKnownTeamsRich()) {
      const k = norm(t.name)
      if (!map.has(k)) map.set(k, t)
    }
    // Pick up teams that only show up inside KB matches (home/away strings),
    // ensuring the team picker has full coverage even for clubs that we know
    // only via past matches.
    for (const m of getKnownMatches()) {
      for (const teamName of [m.homeTeam, m.awayTeam]) {
        if (!teamName) continue
        const k = norm(teamName)
        if (!map.has(k)) {
          map.set(k, {
            id: teamName,
            name: teamName,
            logo: teamName === m.homeTeam ? (m.homeLogo || null) : (m.awayLogo || null),
            league: m.league,
            provider: m.provider,
            lastSeen: m.lastSeen,
            countSeen: 0,
          })
        }
      }
    }
    for (const p of patterns) {
      const refs = [...(p.scope === 'specific_teams' && p.scopeFilter ? p.scopeFilter : []), ...(p.excludeTeams || [])]
      for (const name of refs) {
        const k = norm(name)
        if (!map.has(k)) map.set(k, { id: name, name, lastSeen: 0, countSeen: 0 })
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.lastSeen + b.countSeen) - (a.lastSeen + a.countSeen) || a.name.localeCompare(b.name))
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
        homeLogo: fx.homeTeam.logo || null,
        awayLogo: fx.awayTeam.logo || null,
        leagueLogo: fx.league?.logo || null,
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

  // V3.17 — health snapshot per pattern, derived from real triggered alerts
  // and command-center alerts. Used by ConfiguredRadarRow, the "para revisar"
  // section, and the templates panel.
  const cmdAlertsForHealth = useMemo(
    () => commandAlerts.map(a => ({ patternId: a.patternId, status: a.status, confidence: a.confidence, timestamp: a.createdAt })),
    [commandAlerts]
  )
  const healthByPattern = useMemo(() => {
    const m = new Map<string, PatternHealth>()
    for (const p of patterns) m.set(p.id, buildPatternHealth(p, triggeredAlerts, cmdAlertsForHealth))
    return m
  }, [patterns, triggeredAlerts, cmdAlertsForHealth])

  const reviewablePatterns = useMemo(() => {
    return patterns
      .map(p => ({ pattern: p, health: healthByPattern.get(p.id)! }))
      .filter(x => x.health && isReviewableHealth(x.health.status))
  }, [patterns, healthByPattern])

  const visibleTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return templates.filter(t => {
      if (categoryFilter !== 'all' && categorizeTemplate(t) !== categoryFilter) return false
      if (!q) return true
      const haystack = `${t.name} ${t.description}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return haystack.includes(q)
    })
  }, [templates, categoryFilter, templateSearch])

  return (
    <div className="space-y-6">
      {/* Modals */}
      <CustomPatternModal open={showBuilder} initial={editingPattern} onClose={() => { setShowBuilder(false); setEditingPattern(null); if (prefilledDraft) clearPrefilledDraft() }} onSave={handleCustomSave} availableMatches={availableMatches} availableLeaguesRich={availableLeaguesRich} availableTeamsRich={availableTeamsRich} />
      <TemplateConfigModal open={!!templateModal} template={templateModal?.template || null} existingPattern={templateModal?.existing || null} onClose={() => setTemplateModal(null)} onSave={handleTemplateSave} availableMatches={availableMatches} availableLeaguesRich={availableLeaguesRich} availableTeamsRich={availableTeamsRich} />
      <AutoDiscoveryConfigModal open={showAutoConfig} config={discoveryConfig} onClose={() => setShowAutoConfig(false)} onChange={updateDiscoveryConfig} onActivate={handleActivateAuto} onDeactivate={handleDeactivateAuto} />

      {/* Header — Pattern Studio premium */}
      <header className="rounded-[20px] border border-white/[0.06] bg-white/[0.012] p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 block mb-1.5">Pattern Studio</span>
            <h2 className="text-[22px] sm:text-[24px] font-semibold text-white/95 tracking-tight leading-[1.15]">Crie radares inteligentes</h2>
            <p className="text-[13px] text-white/55 mt-2 max-w-[560px] leading-relaxed">Combine gatilhos reais e configure o motor automático para detectar sinais ao vivo nas partidas.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowAutoConfig(true)} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] transition-colors flex items-center gap-1.5">
              <Sparkles size={13} />Configurar motor
            </button>
            <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold border border-white/30 bg-white/[0.95] hover:bg-white transition-colors duration-200 flex items-center gap-1.5" style={{ color: '#0b0d12' }}>
              <Plus size={14} />Criar radar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01]">
          <CounterCell label="Ativos" value={activeCount} tone="emerald" />
          <CounterCell label="Pausados" value={pausedCount} tone="white" />
          <CounterCell label="Templates" value={templates.length} tone="cyan" />
          <CounterCell label="Motor auto" value={isAutoActive ? 'On' : 'Off'} tone={isAutoActive ? 'emerald' : 'white'} />
          <CounterCell label="Disparos hoje" value={triggeredTodayCount} tone={triggeredTodayCount > 0 ? 'amber' : 'white'} />
        </div>
      </header>

      {/* Motor automático — quiet operational module */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${isAutoActive ? 'border-emerald-400/25 bg-emerald-500/[0.06]' : 'border-white/[0.08] bg-white/[0.04]'}`}>
            <Sparkles size={15} className={isAutoActive ? 'text-emerald-200/85' : 'text-white/55'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Motor automático</h3>
              <span className="flex items-center gap-1.5 text-[11px] text-white/55">
                <span className={`h-1.5 w-1.5 rounded-full ${isAutoActive ? 'bg-emerald-400/85' : discoveryConfig.userConfigured ? 'bg-cyan-300/70' : 'bg-white/30'}`} />
                {isAutoActive ? 'Monitorando' : discoveryConfig.userConfigured ? 'Configurado, pausado' : 'Desligado'}
              </span>
            </div>
            <p className="text-[12px] text-white/55 mt-1 leading-snug">
              {isAutoActive
                ? <>Confiança ≥ <span className="text-white/85 font-medium tabular-nums">{discoveryConfig.minConfidence}%</span> · {discoveryConfig.registerAlertAuto ? 'Registrando alertas' : 'Apenas sugerindo'} · {discoveryConfig.monitorAllLeagues ? 'todas as ligas' : discoveryConfig.monitorMainLeagues ? 'ligas principais' : 'favoritos'}</>
                : 'O motor só roda após configuração explícita. Ative para o GoalSense detectar sinais sem você criar padrões.'}
            </p>
          </div>
          <PremiumToggle checked={isAutoActive} onChange={(v) => { if (v && !discoveryConfig.userConfigured) setShowAutoConfig(true); else updateDiscoveryConfig({ enabled: v }) }} ariaLabel="Motor automático" />
          <button onClick={() => setShowAutoConfig(true)} type="button" className="px-3.5 py-2 rounded-xl text-[11.5px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] transition-colors">Configurar</button>
        </div>
      </section>

      {/* Scope intelligence — compact panel showing the Knowledge Base footprint */}
      <ScopeHealthPanel availableLeagues={availableLeagues} availableTeams={availableTeams} availableMatches={availableMatches} fixturesCount={fixtures.length} patternsCount={patterns.length} />

      {/* Radares para revisar — only renders when there are real signals */}
      {reviewablePatterns.length > 0 && (
        <section className="rounded-2xl border border-amber-300/15 bg-amber-500/[0.025] p-5">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/85">Radares para revisar</span>
            <span className="text-[11px] text-white/55">{reviewablePatterns.length} {reviewablePatterns.length === 1 ? 'radar' : 'radares'} pedindo atenção</span>
          </div>
          <div className="space-y-2">
            {reviewablePatterns.map(({ pattern: p, health }) => (
              <ReviewableRow
                key={p.id}
                pattern={p}
                health={health}
                onEdit={() => { setEditingPattern(p); setShowBuilder(true) }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Radares configurados */}
      {patterns.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Radares configurados</h3>
              <p className="text-[11px] text-white/40 mt-0.5">{activeCount} {activeCount === 1 ? 'ativo' : 'ativos'} · {pausedCount} {pausedCount === 1 ? 'pausado' : 'pausados'}</p>
            </div>
            <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} type="button" className="text-[11px] font-medium text-white/65 hover:text-white/95 transition-colors flex items-center gap-1"><Plus size={11} />Novo radar</button>
          </div>
          <div className="space-y-2">
            {patterns.map(p => <ConfiguredRadarRow key={p.id} pattern={p} health={healthByPattern.get(p.id)} triggeredAlerts={triggeredAlerts} onToggle={() => togglePattern(p.id)} onEdit={() => { setEditingPattern(p); setShowBuilder(true) }} onDuplicate={() => { createPattern({ ...p, name: `${p.name} (cópia)`, status: 'paused', isTemplate: false, templateId: undefined }) }} onDelete={() => deletePattern(p.id)} isAdvanced={isAdvanced} />)}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.005] p-8 text-center">
          <div className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-white/[0.04] border border-white/[0.07] mb-4">
            <Sparkles size={18} className="text-white/45" />
          </div>
          <p className="text-[15px] text-white/90 font-semibold">Você ainda não configurou nenhum radar</p>
          <p className="text-[12px] text-white/55 mt-1 max-w-[440px] mx-auto leading-relaxed">Comece por um template recomendado, crie um padrão personalizado do zero ou ative o motor automático para descobertas sem configuração.</p>
          <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
            <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} type="button" className="px-4 py-2 rounded-xl text-[12px] font-semibold border border-white/30 bg-white/[0.95] hover:bg-white transition-colors duration-200" style={{ color: '#0b0d12' }}>+ Criar radar personalizado</button>
            {templates.length > 0 && (
              <button onClick={() => { const first = templates[0]; if (first) handleTemplateConfigure(first) }} type="button" className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-colors">Ativar template</button>
            )}
            <button onClick={() => setShowAutoConfig(true)} type="button" className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-colors">Configurar motor</button>
          </div>
        </section>
      )}

      {/* Templates */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Biblioteca de templates</h3>
            <p className="text-[11px] text-white/40 mt-0.5">{visibleTemplates.length} {visibleTemplates.length === 1 ? 'disponível' : 'disponíveis'} · curados pelo GoalSense</p>
          </div>
          <input
            value={templateSearch}
            onChange={e => setTemplateSearch(e.target.value)}
            placeholder="Buscar template"
            className="h-9 w-full sm:w-[240px] rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/30 focus:bg-white/[0.04] transition-colors"
            aria-label="Buscar template"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3 overflow-x-auto no-scrollbar -mx-1 px-1">
          {([
            ['all', 'Todos'],
            ...(Object.entries(CATEGORY_LABELS) as [TemplateCategory, string][]),
          ] as [TemplateCategory | 'all', string][]).map(([k, label]) => {
            const active = categoryFilter === k
            const count = k === 'all' ? templates.length : templates.filter(t => categorizeTemplate(t) === k).length
            return (
              <button key={k} onClick={() => setCategoryFilter(k)} type="button" className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${active ? 'bg-white/[0.06] text-white/95 border border-white/[0.12]' : 'text-white/55 border border-transparent hover:text-white/85 hover:bg-white/[0.025]'}`}>
                {label}
                {count > 0 && <span className={`text-[10px] tabular-nums ${active ? 'text-white/70' : 'text-white/35'}`}>{count}</span>}
              </button>
            )
          })}
        </div>
        {visibleTemplates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.005] p-6 text-center">
            <p className="text-[12.5px] text-white/75 font-medium">Nenhum template encontrado</p>
            <p className="text-[11px] text-white/45 mt-1">Tente outra categoria ou ajuste a busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleTemplates.map(t => {
              const existing = patterns.find(p => p.templateId === t.id) || null
              const isActiveTpl = !!existing && existing.status === 'active'
              const tplHealth = existing ? healthByPattern.get(existing.id) : undefined
              return <TemplateCard key={t.id} template={t} existing={existing} isActive={isActiveTpl} health={tplHealth} onToggle={() => handleTemplateToggle(t)} onConfigure={() => handleTemplateConfigure(t)} />
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// ═══ TEMPLATE CARD
function TemplateCard({ template, existing, isActive, health, onToggle, onConfigure }: { template: PatternTemplate; existing: Pattern | null; isActive: boolean; health?: PatternHealth; onToggle: () => void; onConfigure: () => void }) {
  const cat = categorizeTemplate(template)
  const sevDot = template.severity === 'critical' ? 'bg-rose-300/85' : template.severity === 'attention' ? 'bg-amber-300/85' : 'bg-cyan-300/85'
  const sevLabel = template.severity === 'critical' ? 'Crítico' : template.severity === 'attention' ? 'Atenção' : 'Info'
  const healthTone = health ? HEALTH_TONE[health.status] : null
  // Border tone: rosé/amber for issues, soft emerald for healthy, neutral otherwise
  const borderTone = health
    ? (health.status === 'noisy' || health.status === 'underperforming' || health.status === 'needs_review' ? 'border-amber-300/25'
      : health.status === 'healthy' ? 'border-emerald-300/25'
      : 'border-white/[0.07]')
    : 'border-white/[0.07]'
  return (
    <div className={`group rounded-2xl border bg-white/[0.012] p-4 transition-colors duration-200 hover:border-white/[0.14] ${borderTone}`}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5 text-[10px]">
            <span className="flex items-center gap-1.5 text-white/55">
              <span className={`h-1.5 w-1.5 rounded-full ${sevDot}`} />
              <span className="font-medium">{sevLabel}</span>
            </span>
            <span className="text-white/20">·</span>
            <span className="text-white/45 font-medium">{CATEGORY_LABELS[cat]}</span>
            {health && healthTone ? (
              <span className={`ml-auto inline-flex items-center gap-1 text-[9.5px] font-medium ${healthTone.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${healthTone.dot}`} />
                {health.label}
              </span>
            ) : isActive ? (
              <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-emerald-300/80">Ativo</span>
            ) : existing && existing.status === 'paused' ? (
              <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/45">Pausado</span>
            ) : null}
          </div>
          <h4 className="text-[13.5px] font-semibold text-white/95 leading-tight tracking-tight">{template.name}</h4>
        </div>
        <PremiumToggle checked={isActive} onChange={onToggle} ariaLabel={`Ativar template ${template.name}`} size="sm" />
      </div>
      <p className="text-[11.5px] text-white/55 leading-snug mb-3 line-clamp-2">{template.description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {template.conditions.slice(0, 3).map((c, i) => (
          <span key={i} className="text-[10px] text-white/65 bg-white/[0.025] px-2 py-0.5 rounded border border-white/[0.06]">{formatConditionHuman(c)}</span>
        ))}
        {template.conditions.length > 3 && <span className="text-[10px] text-white/35">+{template.conditions.length - 3}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
        <span className="text-[10.5px] text-white/45">Confiança sugerida: <span className="text-white/75 font-semibold">{template.defaultConfidence}</span></span>
        <button onClick={onConfigure} type="button" className="text-[11px] font-medium text-white/85 hover:text-white transition-colors">Configurar →</button>
      </div>
    </div>
  )
}

// ═══ REVIEWABLE ROW — compact item for the "Radares para revisar" section.
// Shows the radar name, the health label, the reason in plain Portuguese,
// up to 3 actionable recommendations and an Edit shortcut. Tone is amber.
function ReviewableRow({ pattern, health, onEdit }: { pattern: Pattern; health: PatternHealth; onEdit: () => void }) {
  const tone = HEALTH_TONE[health.status]
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] px-4 py-3 flex items-start gap-3">
      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h4 className="text-[12.5px] font-semibold text-white/95 truncate">{pattern.name}</h4>
          <span className={`text-[10px] font-medium ${tone.text}`}>{health.label}</span>
        </div>
        <p className={`text-[11.5px] leading-snug ${tone.text}`}>{health.reason}</p>
        {health.recommendations.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {health.recommendations.slice(0, 3).map((r, i) => (
              <li key={i} className="text-[11px] text-white/65 leading-snug">· {r}</li>
            ))}
          </ul>
        )}
      </div>
      <button onClick={onEdit} type="button" className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-colors">Editar</button>
    </div>
  )
}

// ═══ HEALTH BREAKDOWN CHIP — used inside the advanced-mode of ConfiguredRadarRow.
function HealthBreakdownChip({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'cyan' | 'rose' | 'amber' | 'white' }) {
  if (value === 0) return null
  const cls = tone === 'emerald' ? 'text-emerald-200/85 bg-emerald-500/[0.05] border-emerald-400/15'
    : tone === 'cyan' ? 'text-cyan-200/85 bg-cyan-500/[0.05] border-cyan-400/15'
    : tone === 'rose' ? 'text-rose-200/85 bg-rose-500/[0.05] border-rose-400/15'
    : tone === 'amber' ? 'text-amber-200/85 bg-amber-500/[0.05] border-amber-400/15'
    : 'text-white/65 bg-white/[0.04] border-white/[0.07]'
  return <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${cls}`}><span className="font-semibold tabular-nums">{value}</span><span>{label}</span></span>
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

function ConfiguredRadarRow({ pattern, health, triggeredAlerts, onToggle, onEdit, onDuplicate, onDelete, isAdvanced }: { pattern: Pattern; health?: PatternHealth; triggeredAlerts: TriggeredAlert[]; onToggle: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; isAdvanced: boolean }) {
  const isActive = pattern.status === 'active'
  const lastHit = triggeredAlerts.find(t => t.patternId === pattern.id)?.timestamp || null
  const hits = triggeredAlerts.filter(t => t.patternId === pattern.id).length
  const sevTone = pattern.severity === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : pattern.severity === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'
  const origin = pattern.isTemplate || pattern.templateId ? 'Template' : 'Personalizado'
  const healthTone = health ? HEALTH_TONE[health.status] : null

  return (
    <div className={`rounded-2xl border ${isActive ? 'border-white/[0.08]' : 'border-white/[0.05] opacity-75'} bg-white/[0.012] px-5 py-4`}>
      <div className="flex items-center gap-4">
        <div className="shrink-0 flex items-center justify-center" style={{ width: 42 }}>
          <PremiumToggle checked={isActive} onChange={onToggle} ariaLabel={`${isActive ? 'Pausar' : 'Ativar'} ${pattern.name}`} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h4 className="text-[13px] font-bold text-white/95 truncate">{pattern.name}</h4>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${sevTone}`}>{pattern.severity === 'critical' ? 'Crítico' : pattern.severity === 'attention' ? 'Atenção' : 'Info'}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.04] text-white/65 border border-white/[0.07]">{origin}</span>
            {health && healthTone && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${healthTone.bg} ${healthTone.border} ${healthTone.text}`} title={health.reason}>
                <span className={`h-1.5 w-1.5 rounded-full ${healthTone.dot}`} />
                {health.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-white/55 flex-wrap">
            <span>{pattern.conditions.length} {pattern.conditions.length === 1 ? 'condição' : 'condições'}</span>
            <span>· Conf ≥ {pattern.minConfidence}%</span>
            <span>· {pattern.action === 'register_alert' ? 'Alerta' : pattern.action === 'suggest_only' ? 'Sugerir' : 'Destacar'}</span>
            <span>· {scopeShortLabel(pattern)}</span>
            {pattern.onlyLive && <span>· ao vivo</span>}
            {pattern.onlyPreMatch && <span>· pré-jogo</span>}
            {pattern.requireRichData && <span>· dados ricos</span>}
            {(() => {
              const exCount = (pattern.excludeLeagues?.length || 0) + (pattern.excludeTeams?.length || 0) + (pattern.excludeMatches?.length || 0)
              if (exCount === 0) return null
              return <span className="text-rose-200/80">· exceto {exCount} {exCount === 1 ? 'item' : 'itens'}</span>
            })()}
            {hits > 0 && <span>· <span className="text-white/85 font-semibold">{hits}</span> {hits === 1 ? 'disparo' : 'disparos'}</span>}
            {lastHit && <span>· Último {new Date(lastHit).toLocaleDateString('pt-BR')}</span>}
          </div>
          {health && health.reason && (
            <p className={`text-[11px] mt-1 ${healthTone?.text ?? 'text-white/55'} leading-snug`}>{health.reason}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/65 hover:text-white/95 hover:bg-white/[0.05] transition-colors">Editar</button>
          <button onClick={onDuplicate} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/65 hover:text-white/95 hover:bg-white/[0.05] transition-colors">Duplicar</button>
          <button onClick={onDelete} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/45 hover:text-rose-300 hover:bg-rose-500/8 transition-colors" aria-label="Excluir">Excluir</button>
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
          {health && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                <span className="text-white/45 uppercase tracking-wider font-semibold">Resoluções:</span>
                <HealthBreakdownChip label="confirmadas" value={health.confirmedCount} tone="emerald" />
                <HealthBreakdownChip label="parciais" value={health.partialCount} tone="cyan" />
                <HealthBreakdownChip label="falhas" value={health.failedCount} tone="rose" />
                <HealthBreakdownChip label="sem dados" value={health.unknownCount} tone="amber" />
                <HealthBreakdownChip label="expiradas" value={health.expiredCount} tone="white" />
                <HealthBreakdownChip label="pendentes" value={health.pendingCount} tone="white" />
                {health.hitRate !== null && (
                  <span className="text-[10px] text-white/65">· Confirmação <span className="text-white/95 font-semibold tabular-nums">{Math.round(health.hitRate * 100)}%</span></span>
                )}
                {health.avgConfidence !== null && (
                  <span className="text-[10px] text-white/65">· Confiança média <span className="text-white/95 font-semibold tabular-nums">{health.avgConfidence}%</span></span>
                )}
              </div>
              {health.recommendations.length > 0 && (
                <div className="flex items-start gap-1.5 flex-wrap text-[10.5px]">
                  <span className="text-amber-200/80 uppercase tracking-wider font-semibold text-[9.5px] mt-px">Sugestões:</span>
                  <ul className="flex-1 space-y-0.5 min-w-0">
                    {health.recommendations.map((r, i) => (
                      <li key={i} className="text-white/65 leading-snug">· {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
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
function PerformanceView({ patterns, triggeredAlerts, commandAlerts, isAdvanced }: { patterns: Pattern[]; triggeredAlerts: TriggeredAlert[]; commandAlerts: CommandCenterAlert[]; isAdvanced: boolean }) {
  // V3.17 — derive every per-pattern stat from the same Pattern Health engine
  // used by the Pattern Studio. Single source of truth for status, hit rate,
  // recommendations and review labels.
  const cmdAlertsForHealth = useMemo(
    () => commandAlerts.map(a => ({ patternId: a.patternId, status: a.status, confidence: a.confidence, timestamp: a.createdAt })),
    [commandAlerts]
  )
  const stats = useMemo(() => {
    return patterns.map(p => ({
      pattern: p,
      health: buildPatternHealth(p, triggeredAlerts, cmdAlertsForHealth),
      lastHit: triggeredAlerts.find(t => t.patternId === p.id)?.timestamp || null,
    }))
  }, [patterns, triggeredAlerts, cmdAlertsForHealth])

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
  const reviewable = stats.filter(s => isReviewableHealth(s.health.status))

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
        {reviewable.length > 0 && (
          <section className="rounded-2xl border border-amber-300/15 bg-amber-500/[0.025] p-5">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200/85 mb-3">Padrões para revisar</h4>
            <div className="space-y-2">
              {reviewable.map(s => (
                <div key={s.pattern.id} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-white/85 font-semibold truncate">{s.pattern.name}</span>
                  <span className={`text-[11px] font-medium shrink-0 ${HEALTH_TONE[s.health.status].text}`}>{s.health.label} · {s.health.reason}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Per-pattern breakdown */}
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Por padrão</h4>
          <div className="space-y-2">
            {stats.map(s => <PatternStatRow key={s.pattern.id} stat={s} isAdvanced={isAdvanced} />)}
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
            <SidebarRow label="Padrões para revisar" value={reviewable.length} tone={reviewable.length > 0 ? 'amber' : 'white'} />
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

function PatternStatRow({ stat, isAdvanced }: { stat: { pattern: Pattern; health: PatternHealth; lastHit: string | null }; isAdvanced: boolean }) {
  const { pattern, health, lastHit } = stat
  const total = Math.max(health.sampleSize, 1)
  const confirmedPct = (health.confirmedCount / total) * 100
  const partialPct = (health.partialCount / total) * 100
  const failedPct = (health.failedCount / total) * 100
  const sampleStatus = health.resolvedCount >= 5 ? 'utilizável' : health.resolvedCount >= 2 ? 'em observação' : 'insuficiente'
  const sampleTone = health.resolvedCount >= 5 ? 'text-emerald-300' : health.resolvedCount >= 2 ? 'text-cyan-300' : 'text-white/55'
  const healthTone = HEALTH_TONE[health.status]
  const hitRatePct = health.hitRate !== null ? Math.round(health.hitRate * 100) : null

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-gradient-to-r from-white/[0.012] to-white/[0.005] px-5 py-4">
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <span className="text-[13px] font-bold text-white/90 truncate flex-1 min-w-0">{pattern.name}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${pattern.status === 'active' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/15' : 'bg-white/[0.04] text-white/45 border border-white/[0.06]'}`}>{pattern.status === 'active' ? 'Ativo' : 'Pausado'}</span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border ${healthTone.bg} ${healthTone.border} ${healthTone.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${healthTone.dot}`} />
          {health.label}
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.04] ${sampleTone} border border-white/[0.06] whitespace-nowrap`}>{sampleStatus}</span>
      </div>
      {health.sampleSize > 0 && (
        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden flex mb-2.5">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${confirmedPct}%` }} />
          <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all" style={{ width: `${partialPct}%` }} />
          <div className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all" style={{ width: `${failedPct}%` }} />
        </div>
      )}
      <div className="flex items-center gap-3 text-[11px] text-white/65 flex-wrap">
        <span><span className="text-white/85 font-bold tabular-nums">{health.sampleSize}</span> disparos</span>
        {health.confirmedCount > 0 && <span className="text-emerald-300">✓ {health.confirmedCount}</span>}
        {health.partialCount > 0 && <span className="text-cyan-300">~ {health.partialCount}</span>}
        {health.failedCount > 0 && <span className="text-rose-300">✗ {health.failedCount}</span>}
        {health.expiredCount > 0 && <span className="text-white/45">⏱ {health.expiredCount}</span>}
        {health.unknownCount > 0 && <span className="text-amber-200/80">? {health.unknownCount}</span>}
        {hitRatePct !== null ? (
          <span className="ml-auto text-[12px] font-bold tabular-nums text-emerald-300">Taxa {hitRatePct}%</span>
        ) : (
          <span className="ml-auto text-[10px] text-white/45 font-medium">Amostra {health.resolvedCount}/5</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-white/45 mt-1.5 flex-wrap">
        {health.avgConfidence !== null && <span>Confiança média: <span className="text-white/75 font-semibold tabular-nums">{health.avgConfidence}%</span></span>}
        {lastHit && <span>Último: {new Date(lastHit).toLocaleDateString('pt-BR')}</span>}
        {health.reason && <span className={`${healthTone.text}`}>· {health.reason}</span>}
      </div>
      {isAdvanced && health.recommendations.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/[0.04]">
          <span className="text-[9.5px] uppercase tracking-wider text-amber-200/80 font-semibold">Sugestões</span>
          <ul className="mt-1 space-y-0.5">
            {health.recommendations.map((r, i) => <li key={i} className="text-[11px] text-white/65 leading-snug">· {r}</li>)}
          </ul>
        </div>
      )}
      {isAdvanced && (
        <div className="mt-2 text-[10px] text-white/45 font-mono">
          ✓{health.confirmedCount} · ~{health.partialCount} · ✗{health.failedCount} · ⏱{health.expiredCount} · ?{health.unknownCount} · pendentes:{health.pendingCount}
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

