/**
 * Command Center V3.6 — Wide cockpit layout, intelligence gate, no false positives.
 * Only shows signals when user has configured patterns or auto-discovery.
 *
 * Since V3.18F this file is the orchestrator: it owns data fetching, pattern
 * evaluation, auto discovery, alert resolution and tab routing. Every tab
 * lives under `components/views/*` and is fed only the props it needs.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { RefreshCw, Zap, AlertCircle, Activity, Target, Eye, BarChart3, Database } from 'lucide-react'
import { getLiveFixtures, type LiveFixture } from '@/lib/apiClient'
import { storeFixtureForNavigation } from '@/lib/matchNavigation'
import { useFavorites } from '@/context/FavoritesContext'
import { useAlerts } from '@/context/AlertsContext'
import { useViewMode } from '@/context/ViewModeContext'
import { useBackendSync } from '@/services/useBackendSync'
import { usePatternWriteThrough } from '@/services/usePatternWriteThrough'
import { useAlertWriteThrough } from '@/services/useAlertWriteThrough'
import { useBackendPerformance } from '@/services/useBackendPerformance'
import { useBackendAlertsMirror } from '@/services/useBackendAlertsMirror'
import { usePatterns } from './contexts/PatternContext'
import { evaluateAllPatterns } from './intelligence/patternEvaluator'
import { applyPrecisionChecks } from './intelligence/patternPrecisionEngine'
import { validateAutoDiscoveryCandidate, buildAutoDiscoveryCandidate } from './intelligence/autoDiscoveryPrecisionGate'
import { isDuplicateAlert } from './intelligence/alertDuplicateGuard'
import { extractEspnTimedEvents, type CommandTimedEvent } from './intelligence/commandTimedEvents'
import { feedScoreCacheFromEvents } from '@/lib/liveScoreCache'
import { runAutoDiscovery } from './intelligence/autoDiscoveryEngine'
import { resolveAlert } from './intelligence/patternResolutionEngine'
import { recordScopeEntities } from '@/services/intelligence/scopeKnowledgeBase'
import { isLiveFx, detectChanges, type ChangeEvent } from './commandHelpers'
import { getCommandCenterPollingInterval } from '@/lib/liveFreshness'
import type { Pattern, FixtureStatsForPattern, ScannerEntry } from './types/commandTypes'
import { useCommandAlertNotifications } from '@/features/notifications/useCommandAlertNotifications'
import { CockpitView } from './components/views/cockpit/CockpitView'
import { PatternsView } from './components/views/patterns/PatternsView'
import { ScannerView } from './components/views/scanner/ScannerView'
import { AlertsView } from './components/views/alerts/AlertsView'
import { PerformanceView } from './components/views/performance/PerformanceView'

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
  const [eventsMap, setEventsMap] = useState<Map<number, CommandTimedEvent[]>>(new Map())
  const [activeTab, setActiveTab] = useState<Tab>('cockpit')
  const [showBuilder, setShowBuilder] = useState(false)
  const [prefilledDraft, setPrefilledDraft] = useState<Pattern | null>(null)
  const prevRef = useRef<LiveFixture[] | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { isFavoriteTeam } = useFavorites()
  const { enabledCount, registerCommandAlert, updateCommandAlertStatus, commandAlerts } = useAlerts()
  const { isAdvanced } = useViewMode()
  const { patterns, templates, createPattern, createFromTemplate, updatePattern, togglePattern, deletePattern, getActivePatterns, triggeredAlerts, triggerAlert, getRecentTriggered, resolveExpired, discoveryConfig, updateDiscoveryConfig, activePatternCount, triggeredTodayCount } = usePatterns()
  const backendSync = useBackendSync(patterns)
  const writeThrough = usePatternWriteThrough(
    { createPattern, createFromTemplate, updatePattern, deletePattern, togglePattern, patterns },
    backendSync.online,
  )
  const alertWT = useAlertWriteThrough(
    { registerCommandAlert, updateCommandAlertStatus, commandAlerts },
    backendSync.online,
  )
  const backendPerf = useBackendPerformance(backendSync.online)
  const backendAlertsMirror = useBackendAlertsMirror(backendSync.online)

  // ═══ INTELLIGENCE GATE ═══
  const hasManualPatterns = activePatternCount > 0
  const hasAutoDiscovery = discoveryConfig.enabled && discoveryConfig.userConfigured
  const hasIntelligence = hasManualPatterns || hasAutoDiscovery

  // V5.1 — opt-in foreground notification stream. Hook ignores backlog and
  // only fires for ids that appear after first mount. Every guard (opt-in,
  // permission, dedup, rate limit) lives inside the bridge.
  useCommandAlertNotifications(commandAlerts)

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
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${fx.id}`, { cache: 'no-store' })
      if (!res.ok) return null
      const json = await res.json()
      const hS = json.boxscore?.teams?.[0]?.statistics || []; const aS = json.boxscore?.teams?.[1]?.statistics || []
      const g = (arr: any[], n: string) => { const s = arr.find((x: any) => x.name === n || x.label === n); return s ? parseFloat(s.displayValue) || 0 : 0 }
      const stats = { possession: { home: g(hS, 'possessionPct') || g(hS, 'POSSESSION'), away: g(aS, 'possessionPct') || g(aS, 'POSSESSION') }, shots: { home: g(hS, 'totalShots') || g(hS, 'SHOTS'), away: g(aS, 'totalShots') || g(aS, 'SHOTS') }, shotsOnTarget: { home: g(hS, 'shotsOnTarget') || g(hS, 'ON GOAL'), away: g(aS, 'shotsOnTarget') || g(aS, 'ON GOAL') }, corners: { home: g(hS, 'wonCorners') || g(hS, 'Corner Kicks'), away: g(aS, 'wonCorners') || g(aS, 'Corner Kicks') }, yellowCards: { home: g(hS, 'yellowCards') || g(hS, 'Yellow Cards'), away: g(aS, 'yellowCards') || g(aS, 'Yellow Cards') } } as FixtureStatsForPattern
      // V5 Phase 6: extract timed events from the same ESPN response
      const timedEvents = extractEspnTimedEvents(json, fx.id, fx.homeTeam.name, fx.awayTeam.name)
      // V14: Feed score cache from goal events so Live Radar/Matches get fresh score
      const goalEvts = timedEvents.filter(e => e.type === 'goal' || e.type === 'own_goal' || e.type === 'penalty_scored')
      if (goalEvts.length > 0) {
        feedScoreCacheFromEvents(fx.id, fx.score.home ?? 0, fx.score.away ?? 0, goalEvts.map(e => ({ type: e.type, side: e.side, minute: e.minute, playerName: e.playerName })))
      }
      return { id: fx.id, stats, events: timedEvents }
    }))
    const m = new Map<number, FixtureStatsForPattern>()
    const em = new Map<number, CommandTimedEvent[]>()
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        m.set(r.value.id, r.value.stats)
        if (r.value.events.length > 0) em.set(r.value.id, r.value.events)
      }
    }
    setStatsMap(m)
    setEventsMap(em)
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
    const interval = getCommandCenterPollingInterval(liveMatches, hasManualPatterns)
    intervalRef.current = setInterval(() => { fetchData(true); resolveExpired() }, interval)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchData, liveMatches.length, resolveExpired, hasManualPatterns])

  const toggleAuto = () => { const n = !autoRefresh; setAutoRefresh(n); try { localStorage.setItem('goalsense_cmd_auto', String(n)) } catch {} }

  // ─── Pattern Evaluation (ONLY if intelligence active) ──────────────────────
  const patternHits = useMemo(() => {
    if (!hasManualPatterns) return []
    return evaluateAllPatterns(getActivePatterns(), fixtures, statsMap, isFavoriteTeam)
  }, [hasManualPatterns, patterns, fixtures, statsMap, isFavoriteTeam, getActivePatterns])

  useEffect(() => {
    if (!hasIntelligence) return
    for (const hit of patternHits) {
      const pat = patterns.find(p => p.id === hit.patternId)
      if (!pat) continue
      const fx = hit.fixture
      const fxStats = statsMap.get(fx.id)

      // V5 Precision Engine: validate before alerting
      const precision = applyPrecisionChecks(hit, pat, fx, fxStats, eventsMap.get(fx.id))

      if (!precision.shouldAlert) continue

      // V12: Content-aware duplicate guard
      const dupCheck = isDuplicateAlert(
        { fixtureId: fx.id, patternId: hit.patternId, score: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 }, minute: fx.status.elapsed || null, momentumSource: undefined },
        commandAlerts,
        { includeResolved: true }
      )
      if (dupCheck.duplicate) continue

      // Build temporal evidence for audit trail
      const fxEvts = eventsMap.get(fx.id)
      const recentWindow = 10
      const recentEvts = fxEvts && fx.status.elapsed ? fxEvts.filter(e => e.minute >= (fx.status.elapsed! - recentWindow) && e.minute <= fx.status.elapsed!).slice(0, 5) : []
      const offTypes = ['shot_on_target', 'shot_off_target', 'corner', 'dangerous_attack', 'goal', 'penalty_scored']
      const offRecent = recentEvts.filter(e => offTypes.includes(e.type))
      const momSrc = offRecent.length >= 1 ? 'timed_events' : fxStats ? 'stats_proxy' : 'insufficient'
      const recConf = offRecent.length >= 3 ? 85 : offRecent.length >= 1 ? 65 : 35

      triggerAlert({ patternId: hit.patternId, patternName: hit.patternName, fixtureId: fx.id, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, league: fx.league.name, minute: fx.status.elapsed, confidence: precision.adjustedConfidence, reasons: hit.reasons, timestamp: new Date().toISOString(), status: 'pending', scoreAtTrigger: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 } })
      alertWT.registerCommandAlertWT({ source: 'command_center', patternId: hit.patternId, patternName: hit.patternName, fixtureId: fx.id, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, competition: fx.league.name, minuteAtTrigger: fx.status.elapsed, scoreAtTrigger: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 }, confidence: precision.adjustedConfidence, severity: hit.severity, evidences: [...hit.reasons, ...precision.reasons], status: 'pending', triggerSnapshot: { minute: fx.status.elapsed, homeScore: fx.score.home ?? 0, awayScore: fx.score.away ?? 0, status: fx.status.short, competition: fx.league.name, provider: fx.provider, homeTeam: fx.homeTeam.name, awayTeam: fx.awayTeam.name, homeLogo: fx.homeTeam.logo, awayLogo: fx.awayTeam.logo, favoriteInvolved: isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name), conditionsMatched: hit.matchedConditions, conditionsTotal: hit.totalConditions, confidenceAtTrigger: precision.adjustedConfidence, ...(fxStats ? { stats: fxStats } : {}) }, temporalEvidence: { momentumSource: momSrc as any, recencyConfidence: recConf, windowMinutes: recentWindow, recentEventsUsed: recentEvts.map(e => ({ minute: e.minute, type: e.type, side: e.side, teamName: e.teamName, playerName: e.playerName })) } })
    }
  }, [patternHits, hasIntelligence, triggerAlert, patterns, alertWT, isFavoriteTeam, statsMap, commandAlerts, eventsMap])

  // ─── Resolution ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (fixtures.length === 0 || commandAlerts.length === 0) return
    const pending = commandAlerts.filter(a => a.status === 'pending')
    if (pending.length === 0) return
    const fxMap = new Map(fixtures.map(f => [f.id, f]))
    for (const alert of pending) {
      const fx = fxMap.get(alert.fixtureId)
      const result = resolveAlert({ id: alert.id, patternName: alert.patternName, fixtureId: alert.fixtureId, minuteAtTrigger: alert.minuteAtTrigger, scoreAtTrigger: alert.scoreAtTrigger, confidence: alert.confidence, createdAt: alert.createdAt, status: 'pending' }, fx)
      if (result) { const finalStatus = result.strength === 'partial_confirmation' ? 'confirmed_partial' as const : result.status; alertWT.updateCommandAlertStatusWT(alert.id, finalStatus, { score: result.scoreAtResolution, reason: result.reason }) }
    }
  }, [fixtures, commandAlerts, alertWT])

  // ─── Auto Discovery (ONLY if configured) ──────────────────────────────────
  const discoveries = useMemo(() => {
    if (!hasAutoDiscovery) return []
    return runAutoDiscovery(fixtures, statsMap, isFavoriteTeam, discoveryConfig)
  }, [hasAutoDiscovery, fixtures, statsMap, isFavoriteTeam, discoveryConfig])

  // ─── Auto Discovery → Alert (ONLY when registerAlertAuto is on) ──────────
  // V11: Auto-discovery now passes through the Precision Gate before alerting.
  // Honors: hasAutoDiscovery + discoveryConfig.registerAlertAuto + precision validation.
  // Anti-duplicate is enforced both by the precision gate (manualAlertFixtureIds)
  // and inside registerCommandAlert (5min window per pattern+fixture).
  useEffect(() => {
    if (!hasAutoDiscovery) return
    if (!discoveryConfig.registerAlertAuto) return

    // Collect fixture ids that already have manual pattern alerts to avoid duplication
    const manualAlertFixtureIds = new Set(
      commandAlerts
        .filter(a => !a.patternId.startsWith('auto_') && a.status === 'pending')
        .map(a => a.fixtureId)
    )

    for (const d of discoveries) {
      if (d.confidence < discoveryConfig.minConfidence) continue
      const fx = d.fixture
      const fxStats = statsMap.get(fx.id)
      const fxEvents = eventsMap.get(fx.id)

      // V11: Build candidate and validate through precision gate
      const candidate = buildAutoDiscoveryCandidate(d, discoveryConfig)
      const validation = validateAutoDiscoveryCandidate(
        candidate,
        fx,
        fxStats,
        fxEvents,
        discoveryConfig,
        manualAlertFixtureIds,
      )

      // Only register alert if precision gate says ready_to_alert
      if (!validation.wouldAlert) continue

      // V12: Content-aware duplicate guard
      const syntheticPatternId = `auto_${d.type}`
      const dupCheck = isDuplicateAlert(
        { fixtureId: fx.id, patternId: syntheticPatternId, score: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 }, minute: fx.status.elapsed || null, momentumSource: validation.momentumSource, discoveryType: d.type },
        commandAlerts,
        { includeResolved: true }
      )
      if (dupCheck.duplicate) continue

      const patternName = d.insight || 'Descoberta automática'
      const inferredSeverity = candidate.syntheticPatternLike.severity

      triggerAlert({
        patternId: syntheticPatternId,
        patternName,
        fixtureId: fx.id,
        homeTeam: fx.homeTeam.name,
        awayTeam: fx.awayTeam.name,
        league: fx.league.name,
        minute: fx.status.elapsed,
        confidence: validation.adjustedConfidence,
        reasons: [...candidate.reasons, ...validation.reasons].filter(Boolean),
        timestamp: new Date().toISOString(),
        status: 'pending',
        scoreAtTrigger: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 },
      })
      alertWT.registerCommandAlertWT({
        source: 'command_center',
        patternId: syntheticPatternId,
        patternName,
        fixtureId: fx.id,
        homeTeam: fx.homeTeam.name,
        awayTeam: fx.awayTeam.name,
        competition: fx.league.name,
        minuteAtTrigger: fx.status.elapsed,
        scoreAtTrigger: { home: fx.score.home ?? 0, away: fx.score.away ?? 0 },
        confidence: validation.adjustedConfidence,
        severity: inferredSeverity,
        evidences: [...candidate.reasons, ...validation.reasons].filter(Boolean),
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
          confidenceAtTrigger: validation.adjustedConfidence,
          ...(fxStats ? { stats: fxStats } : {}),
        },
        temporalEvidence: validation.temporalEvidence,
      })
    }
  }, [hasAutoDiscovery, discoveryConfig, discoveries, triggerAlert, alertWT, isFavoriteTeam, statsMap, eventsMap, commandAlerts])

  // ─── Scanner (ONLY signals) — V5 with precision states ──────────────────────
  const scannerEntries = useMemo((): ScannerEntry[] => {
    if (!hasIntelligence) return []
    const hitIds = new Set(patternHits.map(h => h.fixtureId))
    const discIds = new Set(discoveries.map(d => d.fixtureId))
    const entries: ScannerEntry[] = []
    for (const fx of fixtures) {
      const fxHits = patternHits.filter(h => h.fixtureId === fx.id)
      if (!hitIds.has(fx.id) && !discIds.has(fx.id)) continue
      const top = fxHits[0] || null
      const disc = discoveries.find(d => d.fixtureId === fx.id)
      const fxStats = statsMap.get(fx.id)

      // Run precision on top hit for signal state
      let signalState: ScannerEntry['signalState']
      let adjustedConf = top?.confidence || disc?.confidence || 0
      let blockersList: string[] | undefined
      let dq: ScannerEntry['dataQuality']

      if (top) {
        const pat = patterns.find(p => p.id === top.patternId)
        if (pat) {
          const precision = applyPrecisionChecks(top, pat, fx, fxStats, eventsMap.get(fx.id))
          signalState = precision.signalState
          adjustedConf = precision.adjustedConfidence
          if (precision.blockers.length > 0) blockersList = precision.blockers
          dq = precision.dataQuality
        }
      }

      // V5 Phase 7B: extract momentum/events data for UI
      const fxEvents = eventsMap.get(fx.id)
      let momentumSrc: ScannerEntry['momentumSource']
      let recencyConf: number | undefined
      let recentEvts: ScannerEntry['recentEventsUsed']
      if (fxEvents && fxEvents.length > 0 && fx.status.elapsed) {
        const recent = fxEvents.filter(e => e.minute >= (fx.status.elapsed! - 10) && e.minute <= fx.status.elapsed!)
        const offensiveTypes = ['shot_on_target', 'shot_off_target', 'corner', 'dangerous_attack', 'goal', 'penalty_scored', 'penalty_missed']
        const offensiveRecent = recent.filter(e => offensiveTypes.includes(e.type))
        momentumSrc = offensiveRecent.length >= 1 ? 'timed_events' : 'stats_proxy'
        recencyConf = offensiveRecent.length >= 3 ? 85 : offensiveRecent.length >= 1 ? 65 : 35
        recentEvts = recent.slice(0, 5).map(e => ({ minute: e.minute, type: e.type, side: e.side, teamName: e.teamName, playerName: e.playerName }))
      } else {
        momentumSrc = fxStats ? 'stats_proxy' : 'insufficient'
      }

      const conf = adjustedConf
      const priority: ScannerEntry['priority'] = conf >= 75 ? 'critical' : conf >= 50 ? 'attention' : conf >= 35 ? 'watch' : 'low'
      entries.push({ fixture: fx, patterns: fxHits, topPattern: top, priority, confidence: conf, reason: top?.patternName || disc?.insight || '', signalState, blockers: blockersList, dataQuality: dq, momentumSource: momentumSrc, recencyConfidence: recencyConf, recentEventsUsed: recentEvts })
    }
    return entries.sort((a, b) => b.confidence - a.confidence)
  }, [hasIntelligence, fixtures, patternHits, discoveries, statsMap, patterns])

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
              <p className="text-[14px] text-white/45 mt-1.5">Motor de decisão em tempo real{timeSince !== null && <span className="text-white/30"> · atualizado {timeSince < 60 ? `${timeSince}s` : `${Math.floor(timeSince / 60)}min`} atrás</span>}{refreshing && <span className="text-cyan-400/50 ml-2 animate-pulse">●</span>}{isAdvanced && backendSync.enabled && <span className={`ml-2 text-[10px] ${backendSync.online ? 'text-emerald-400/60' : 'text-white/25'}`}>· Backend {backendSync.online ? 'online' : 'offline'}{backendSync.online && backendSync.patternMirror.summary ? ` · ${backendSync.patternMirror.summary}` : ''}</span>}</p>
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

      {/* ═══ BACKEND SYNC DIAGNOSTICS (Advanced Mode Only) ═══ */}
      {isAdvanced && backendSync.enabled && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Database size={13} className={backendSync.online ? 'text-emerald-400/70' : 'text-white/25'} />
              <span className="text-[11px] font-medium text-white/50">
                {!backendSync.online
                  ? 'Backend offline — usando localStorage'
                  : backendSync.patternMirror.loading
                    ? 'Carregando espelho...'
                    : `Write-Through ativo — ${backendSync.patternMirror.localCount} local / ${backendSync.patternMirror.backendCount} backend`
                }
              </span>
              {backendSync.online && !backendSync.patternMirror.loading && backendSync.patternMirror.diagnostics && (
                <span className="text-[10px] text-white/35 ml-1">
                  {backendSync.patternMirror.matchedCount > 0 && <span className="text-emerald-400/50">{backendSync.patternMirror.matchedCount} ✓</span>}
                  {backendSync.patternMirror.divergentCount > 0 && <span className="text-amber-400/60 ml-1.5">{backendSync.patternMirror.divergentCount} divergentes</span>}
                  {backendSync.patternMirror.onlyLocalCount > 0 && <span className="text-white/30 ml-1.5">{backendSync.patternMirror.onlyLocalCount} apenas local</span>}
                  {backendSync.patternMirror.onlyBackendCount > 0 && <span className="text-cyan-400/50 ml-1.5">{backendSync.patternMirror.onlyBackendCount} apenas backend</span>}
                </span>
              )}
              {(() => { const pending = patterns.filter(p => p.syncStatus === 'pending_create' || p.syncStatus === 'pending_update' || p.syncStatus === 'pending_delete'); return pending.length > 0 ? <span className="text-[10px] text-amber-400/60 ml-1.5">· {pending.length} padrão pendente{pending.length > 1 ? 's' : ''}</span> : null })()}
              {(() => { const errs = patterns.filter(p => p.syncStatus === 'error'); return errs.length > 0 ? <span className="text-[10px] text-rose-400/60 ml-1.5">· {errs.length} padrão erro{errs.length > 1 ? 's' : ''}</span> : null })()}
              {alertWT.pendingAlertSyncCount > 0 && <span className="text-[10px] text-amber-400/60 ml-1.5">· {alertWT.pendingAlertSyncCount} alerta pendente{alertWT.pendingAlertSyncCount > 1 ? 's' : ''}</span>}
              {alertWT.errorAlertSyncCount > 0 && <span className="text-[10px] text-rose-400/60 ml-1.5">· {alertWT.errorAlertSyncCount} alerta erro{alertWT.errorAlertSyncCount > 1 ? 's' : ''}</span>}
            </div>
            <div className="flex items-center gap-2">
              {backendSync.patternMirror.error && <span className="text-[10px] text-rose-400/60">{backendSync.patternMirror.error}</span>}
              <button onClick={() => { backendSync.refreshBackendHealth(); backendSync.refreshPatternMirror() }} className="text-[10px] text-white/30 hover:text-white/60 transition-colors" type="button">↻ Mirror</button>
              {(patterns.some(p => p.syncStatus === 'pending_create' || p.syncStatus === 'pending_update' || p.syncStatus === 'pending_delete' || p.syncStatus === 'error') || alertWT.pendingAlertSyncCount > 0 || alertWT.errorAlertSyncCount > 0) && (
                <button onClick={() => { writeThrough.syncPending(); alertWT.syncPendingAlertsManual() }} className="text-[10px] text-cyan-400/40 hover:text-cyan-400/70 transition-colors" type="button">⟳ Sync pendentes</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ BACKEND WORKER ALERTS (Advanced Mode Only) ═══ */}
      {isAdvanced && backendSync.enabled && backendSync.online && backendAlertsMirror.totalCount > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[11px] font-medium text-white/50">Backend Alerts</span>
              <span className="text-[10px] text-white/35">{backendAlertsMirror.totalCount} total</span>
              {backendAlertsMirror.workerCreatedCount > 0 && <span className="text-[10px] text-cyan-400/50">· {backendAlertsMirror.workerCreatedCount} worker</span>}
              {backendAlertsMirror.pendingCount > 0 && <span className="text-[10px] text-amber-400/50">· {backendAlertsMirror.pendingCount} pending</span>}
              {backendAlertsMirror.confirmedCount > 0 && <span className="text-[10px] text-emerald-400/50">· {backendAlertsMirror.confirmedCount} ✓</span>}
              {backendAlertsMirror.failedCount > 0 && <span className="text-[10px] text-rose-400/50">· {backendAlertsMirror.failedCount} ✗</span>}
              {backendAlertsMirror.unknownCount > 0 && <span className="text-[10px] text-white/30">· {backendAlertsMirror.unknownCount} ?</span>}
            </div>
            <div className="flex items-center gap-2">
              {backendAlertsMirror.workerStatuses.patternWorker && (
                <span className={`text-[9px] ${backendAlertsMirror.workerStatuses.patternWorker.enabled ? 'text-emerald-400/50' : 'text-white/25'}`}>
                  PW:{backendAlertsMirror.workerStatuses.patternWorker.enabled ? 'on' : 'off'}
                </span>
              )}
              {backendAlertsMirror.workerStatuses.resolutionWorker && (
                <span className={`text-[9px] ${backendAlertsMirror.workerStatuses.resolutionWorker.enabled ? 'text-emerald-400/50' : 'text-white/25'}`}>
                  RW:{backendAlertsMirror.workerStatuses.resolutionWorker.enabled ? 'on' : 'off'}
                </span>
              )}
              {backendAlertsMirror.workerStatuses.liveMonitor && (
                <span className={`text-[9px] ${backendAlertsMirror.workerStatuses.liveMonitor.enabled ? 'text-emerald-400/50' : 'text-white/25'}`}>
                  LM:{backendAlertsMirror.workerStatuses.liveMonitor.enabled ? 'on' : 'off'}
                </span>
              )}
              <button onClick={() => backendAlertsMirror.refreshBackendAlerts()} className="text-[10px] text-white/30 hover:text-white/60 transition-colors" type="button">↻ Alerts</button>
            </div>
          </div>
        </div>
      )}

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
      {activeTab === 'cockpit' && <CockpitView hasIntelligence={hasIntelligence} decisionMatch={decisionMatch} decisionHit={decisionHit} decisionDiscovery={decisionDiscovery} patternHits={patternHits} discoveries={discoveries} changes={changes} fixtures={fixtures} openMatch={openMatch} isAdvanced={isAdvanced} activePatternCount={activePatternCount} enabledCount={enabledCount} triggeredAlerts={getRecentTriggered(5)} onGoToPatterns={() => setActiveTab('patterns')} navigate={navigate} templates={templates} createFromTemplate={writeThrough.createFromTemplateWT} />}
      {activeTab === 'patterns' && <PatternsView patterns={patterns} templates={templates} createFromTemplate={writeThrough.createFromTemplateWT} createPattern={writeThrough.createPatternWT} updatePattern={writeThrough.updatePatternWT} togglePattern={writeThrough.togglePatternWT} deletePattern={writeThrough.deletePatternWT} isAdvanced={isAdvanced} showBuilder={showBuilder} setShowBuilder={setShowBuilder} discoveryConfig={discoveryConfig} updateDiscoveryConfig={updateDiscoveryConfig} triggeredAlerts={triggeredAlerts} commandAlerts={commandAlerts} fixtures={fixtures} statsMap={statsMap} eventsMap={eventsMap} isFavoriteTeam={isFavoriteTeam} prefilledDraft={prefilledDraft} clearPrefilledDraft={() => setPrefilledDraft(null)} />}
      {activeTab === 'scanner' && <ScannerView hasIntelligence={hasIntelligence} entries={scannerEntries} openMatch={openMatch} isAdvanced={isAdvanced} onGoToPatterns={() => setActiveTab('patterns')} patterns={patterns} />}
      {activeTab === 'alerts' && <AlertsView triggeredAlerts={getRecentTriggered(30)} isAdvanced={isAdvanced} openMatch={openMatch} fixtures={fixtures} navigate={navigate} />}
      {activeTab === 'performance' && <PerformanceView patterns={patterns} triggeredAlerts={triggeredAlerts} commandAlerts={commandAlerts} isAdvanced={isAdvanced} backendReports={backendPerf.reports} performanceSource={backendPerf.source} />}
    </div>
  )
}
