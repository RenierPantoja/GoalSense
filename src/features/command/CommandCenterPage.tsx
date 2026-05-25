/**
 * Command Center V3.6 — Wide cockpit layout, intelligence gate, no false positives.
 * Only shows signals when user has configured patterns or auto-discovery.
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
      {activeTab === 'patterns' && <PatternsView patterns={patterns} templates={templates} createFromTemplate={createFromTemplate} createPattern={createPattern} updatePattern={updatePattern} togglePattern={togglePattern} deletePattern={deletePattern} isAdvanced={isAdvanced} showBuilder={showBuilder} setShowBuilder={setShowBuilder} discoveryConfig={discoveryConfig} updateDiscoveryConfig={updateDiscoveryConfig} />}
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


// ═══ PATTERNS VIEW ═══
function PatternsView({ patterns, templates, createFromTemplate, createPattern, updatePattern, togglePattern, deletePattern, isAdvanced, showBuilder, setShowBuilder, discoveryConfig, updateDiscoveryConfig }: { patterns: Pattern[]; templates: PatternTemplate[]; createFromTemplate: (id: string) => Pattern | null; createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern; updatePattern: (id: string, patch: Partial<Pattern>) => void; togglePattern: (id: string) => void; deletePattern: (id: string) => void; isAdvanced: boolean; showBuilder: boolean; setShowBuilder: (v: boolean) => void; discoveryConfig: AutoDiscoveryConfig; updateDiscoveryConfig: (p: Partial<AutoDiscoveryConfig>) => void }) {
  const [showConfig, setShowConfig] = useState(false)
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null)
  const handleEdit = (p: Pattern) => { setEditingPattern(p); setShowBuilder(true) }
  const handleDuplicate = (p: Pattern) => { createPattern({ ...p, name: `${p.name} (cópia)`, status: 'paused', isTemplate: false, templateId: undefined }) }
  const handleSave = (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => { if (editingPattern) { updatePattern(editingPattern.id, data); setEditingPattern(null) } else { createPattern(data) }; setShowBuilder(false) }
  const handleActivateAuto = () => { updateDiscoveryConfig({ enabled: true, userConfigured: true }); setShowConfig(false) }

  return (
    <div className="space-y-6">
      {showBuilder && <PatternBuilderPanel onSave={handleSave} onCancel={() => { setShowBuilder(false); setEditingPattern(null) }} initial={editingPattern} />}
      {showConfig && <AutoConfigPanel config={discoveryConfig} onChange={updateDiscoveryConfig} onClose={() => setShowConfig(false)} onActivate={handleActivateAuto} />}

      {/* Motor automático */}
      <section className="rounded-[20px] border border-white/[0.08] bg-gradient-to-r from-white/[0.02] to-transparent p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-white/75">Motor automático</h3>
            <p className="text-[12px] text-white/40 mt-1">{discoveryConfig.enabled && discoveryConfig.userConfigured ? 'Configurado e monitorando — detectando sinais automaticamente' : 'Desligado — configure para permitir descobertas sem padrões manuais'}</p>
          </div>
          <button onClick={() => setShowConfig(true)} className={`px-5 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${discoveryConfig.enabled && discoveryConfig.userConfigured ? 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/20' : 'bg-cyan-500/12 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/18'}`} type="button">{discoveryConfig.enabled && discoveryConfig.userConfigured ? 'Configurado ✓' : 'Configurar motor'}</button>
        </div>
      </section>

      {/* Meus padrões */}
      {patterns.length > 0 && (<section><div className="flex items-center justify-between mb-4"><h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/55">Radares configurados</h3><button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} className="px-4 py-2 rounded-xl text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/15 flex items-center gap-1.5 transition-colors" type="button"><Plus size={12} />Criar padrão</button></div><div className="space-y-2.5">{patterns.map(p => (<div key={p.id} className={`flex items-center gap-4 rounded-[18px] border bg-white/[0.012] px-6 py-4 ${p.status === 'active' ? 'border-white/[0.08]' : 'border-white/[0.05] opacity-70'}`}><div className={`h-3 w-3 rounded-full shrink-0 ${p.status === 'active' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.3)]' : 'bg-white/20'}`} /><div className="flex-1 min-w-0"><span className="text-[14px] font-medium text-white/85 block">{p.name}</span><span className="text-[12px] text-white/40 block mt-0.5">{p.description || `${p.conditions.length} condições`}{p.scope !== 'all' ? ` · ${p.scope === 'favorites_only' ? 'Favoritos' : p.scope === 'specific_leagues' ? `${p.scopeFilter?.length || 0} ligas` : `${p.scopeFilter?.length || 0} times`}` : ''} · Conf ≥{p.minConfidence}%</span>{isAdvanced && <span className="text-[11px] text-white/25 font-mono mt-0.5 block">action:{p.action} · scope:{p.scope}</span>}</div><button onClick={() => handleEdit(p)} className="text-[11px] text-white/40 hover:text-white/70 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-all" type="button">Editar</button><button onClick={() => handleDuplicate(p)} className="text-[11px] text-white/40 hover:text-white/70 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-all" type="button">Duplicar</button><button onClick={() => togglePattern(p.id)} className={`text-[11px] px-4 py-1.5 rounded-lg border transition-all font-medium ${p.status === 'active' ? 'border-emerald-500/20 text-emerald-400/80 bg-emerald-500/8' : 'border-white/[0.06] text-white/35'}`} type="button">{p.status === 'active' ? 'Ativo' : 'Pausado'}</button><button onClick={() => deletePattern(p.id)} className="text-[13px] text-white/25 hover:text-rose-400/70 transition-colors px-2" type="button">×</button></div>))}</div></section>)}

      {/* Templates */}
      <section><div className="flex items-center justify-between mb-4"><h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/55">Templates recomendados</h3>{!showBuilder && patterns.length === 0 && <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} className="px-4 py-2 rounded-xl text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/15 flex items-center gap-1.5 transition-colors" type="button"><Plus size={12} />Personalizado</button>}</div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{templates.map(t => { const active = patterns.some(p => p.templateId === t.id && p.status === 'active'); return (<div key={t.id} className="rounded-[18px] border border-white/[0.06] bg-white/[0.01] p-5 hover:border-white/[0.1] hover:bg-white/[0.018] transition-all"><div className="flex items-start justify-between mb-2.5"><div><span className="text-[14px] font-medium text-white/80 block">{t.name}</span><span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg mt-1.5 inline-block ${t.severity === 'critical' ? 'bg-rose-500/12 text-rose-400/70' : t.severity === 'attention' ? 'bg-amber-500/10 text-amber-400/60' : 'bg-white/[0.04] text-white/35'}`}>{t.severity}</span></div>{active ? <span className="text-[11px] text-emerald-400/70 font-medium">✓ Ativo</span> : <button onClick={() => createFromTemplate(t.id)} className="px-3.5 py-1.5 rounded-lg text-[11px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors" type="button">Ativar</button>}</div><p className="text-[12px] text-white/45 leading-relaxed">{t.description}</p></div>) })}</div></section>
    </div>
  )
}

// ═══ AUTO CONFIG PANEL ═══
function AutoConfigPanel({ config, onChange, onClose, onActivate }: { config: AutoDiscoveryConfig; onChange: (p: Partial<AutoDiscoveryConfig>) => void; onClose: () => void; onActivate: () => void }) {
  return (<div className="rounded-[20px] border border-cyan-500/15 bg-gradient-to-b from-cyan-500/[0.025] to-transparent p-7">
    <div className="flex items-center justify-between mb-2"><h3 className="text-[18px] font-semibold text-white/80">Configurar motor automático</h3><button onClick={onClose} className="text-white/30 hover:text-white/60 p-1" type="button"><X size={18} /></button></div>
    <p className="text-[13px] text-white/40 mb-6">O motor automático só começa a procurar sinais depois que você salvar esta configuração.</p>
    <div className="space-y-5">
      <div><h4 className="text-[12px] font-semibold text-white/55 mb-3 uppercase tracking-wider">Cobertura</h4><div className="grid grid-cols-2 gap-3"><Toggle label="Monitorar favoritos" checked={config.monitorFavorites} onChange={v => onChange({ monitorFavorites: v })} /><Toggle label="Ligas principais" checked={config.monitorMainLeagues} onChange={v => onChange({ monitorMainLeagues: v })} /><Toggle label="Todas as ligas" checked={config.monitorAllLeagues} onChange={v => onChange({ monitorAllLeagues: v })} /></div></div>
      <div className="border-t border-white/[0.06] pt-5"><h4 className="text-[12px] font-semibold text-white/55 mb-3 uppercase tracking-wider">Momentos do jogo</h4><div className="grid grid-cols-2 gap-3"><Toggle label="Incluir pré-jogo" checked={config.includePreMatch} onChange={v => onChange({ includePreMatch: v })} /><Toggle label="Incluir ao vivo" checked={config.includeLive} onChange={v => onChange({ includeLive: v })} /></div></div>
      <div className="border-t border-white/[0.06] pt-5"><h4 className="text-[12px] font-semibold text-white/55 mb-3 uppercase tracking-wider">Qualidade e alertas</h4><div className="grid grid-cols-2 gap-3"><div><span className="text-[11px] text-white/45 block mb-1.5">Confiança mínima</span><input type="number" value={config.minConfidence} onChange={e => onChange({ minConfidence: Number(e.target.value) })} className="w-24 h-9 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-white/90 outline-none focus:border-white/[0.15]" min={20} max={95} /></div><div><span className="text-[11px] text-white/45 block mb-1.5">Max alertas/jogo</span><input type="number" value={config.maxAlertsPerMatch} onChange={e => onChange({ maxAlertsPerMatch: Number(e.target.value) })} className="w-24 h-9 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-white/90 outline-none focus:border-white/[0.15]" min={1} max={10} /></div><Toggle label="Registrar alerta automaticamente" checked={config.registerAlertAuto} onChange={v => onChange({ registerAlertAuto: v })} /></div>{config.registerAlertAuto && <p className="text-[11px] text-cyan-400/40 mt-2">Alertas automáticos serão registrados em /app/alerts e acompanhados pelo motor de resolução.</p>}</div>
    </div>
    <button onClick={onActivate} className="w-full mt-6 py-3.5 rounded-xl text-[13px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/22 transition-colors" type="button">Salvar e ativar motor</button>
  </div>)
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return (<button onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left py-1" type="button"><div className={`w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-cyan-500/35' : 'bg-white/[0.08]'}`}><div className={`w-4 h-4 rounded-full mt-[2px] transition-all ${checked ? 'ml-[18px] bg-cyan-400' : 'ml-[2px] bg-white/30'}`} /></div><span className="text-[12px] text-white/55">{label}</span></button>) }

// ═══ PATTERN BUILDER ═══
const COND_LABELS: Record<PatternConditionType, string> = { is_live: 'Jogo ao vivo', is_final_phase: 'Reta final (70\'+)', is_pre_live: 'Começa em breve', minute_between: 'Minuto entre', score_tied: 'Placar empatado', score_diff_lte: 'Diferença gols ≤', favorite_involved: 'Favorito envolvido', shots_recent_gte: 'Finalizações ≥', shots_on_target_gte: 'No alvo ≥', corners_gte: 'Escanteios ≥', cards_gte: 'Cartões ≥', possession_gte: 'Posse ≥', goals_total_gte: 'Gols totais ≥', goals_total_lte: 'Gols totais ≤', away_shots_on_target_gte: 'Visitante no alvo ≥', away_goals_gte: 'Gols visitante ≥', away_possession_gte: 'Posse visitante ≥' }

function PatternBuilderPanel({ onSave, onCancel, initial }: { onSave: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void; onCancel: () => void; initial?: Pattern | null }) {
  const [name, setName] = useState(initial?.name || ''); const [desc, setDesc] = useState(initial?.description || ''); const [severity, setSeverity] = useState<'critical' | 'attention' | 'info'>(initial?.severity || 'attention'); const [scope, setScope] = useState<'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams'>(initial?.scope || 'all'); const [scopeFilter, setScopeFilter] = useState<string[]>(initial?.scopeFilter || []); const [scopeInput, setScopeInput] = useState(''); const [minConf, setMinConf] = useState(initial?.minConfidence ?? 50); const [action, setAction] = useState<'register_alert' | 'suggest_only' | 'highlight'>(initial?.action || 'register_alert'); const [conditions, setConditions] = useState<PatternCondition[]>(initial?.conditions || [{ type: 'is_live', params: {} }])
  const addCond = (type: PatternConditionType) => { const params: Record<string, number | string | boolean> = {}; if (type === 'minute_between') { params.min = 60; params.max = 90 } else if (type === 'score_diff_lte') { params.maxDiff = 1 } else if (type === 'goals_total_lte') { params.value = 1 } else if (type === 'is_pre_live') { params.minutes = 60 } else if (['shots_recent_gte', 'shots_on_target_gte', 'corners_gte', 'cards_gte', 'goals_total_gte', 'away_shots_on_target_gte', 'away_goals_gte'].includes(type)) { params.value = 3 } else if (['possession_gte', 'away_possession_gte'].includes(type)) { params.value = 58 }; setConditions(prev => [...prev, { type, params }]) }
  const updateParam = (idx: number, key: string, val: number) => { setConditions(prev => prev.map((c, i) => i === idx ? { ...c, params: { ...c.params, [key]: val } } : c)) }
  const save = () => { if (!name.trim() || conditions.length === 0) return; onSave({ name: name.trim(), description: desc.trim(), conditions, severity, status: initial?.status || 'active', isTemplate: initial?.isTemplate || false, templateId: initial?.templateId, scope, scopeFilter: (scope === 'specific_leagues' || scope === 'specific_teams') ? scopeFilter : undefined, minConfidence: minConf, action, maxTriggersPerMatch: 2, antiDuplicateWindow: 5 }) }
  const addScopeItem = () => { if (scopeInput.trim() && !scopeFilter.includes(scopeInput.trim())) { setScopeFilter(prev => [...prev, scopeInput.trim()]); setScopeInput('') } }

  return (<div className="rounded-[20px] border border-cyan-500/15 bg-gradient-to-b from-cyan-500/[0.02] to-transparent p-7">
    <div className="flex items-center justify-between mb-2"><h3 className="text-[18px] font-semibold text-white/80">{initial ? 'Editar padrão' : 'Criar padrão personalizado'}</h3><button onClick={onCancel} className="text-white/30 hover:text-white/60 p-1" type="button"><X size={18} /></button></div>
    <p className="text-[13px] text-white/40 mb-6">Defina exatamente quais sinais o GoalSense deve procurar nas partidas.</p>
    <div className="space-y-6">
      {/* Identidade */}
      <div className="space-y-3"><h4 className="text-[12px] font-semibold text-white/55 uppercase tracking-wider">Identidade do radar</h4><input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do padrão" className="w-full h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[13px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/[0.15]" /><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrição — quando este padrão é útil?" className="w-full h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[13px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/[0.15]" /><div><span className="text-[11px] text-white/45 block mb-2">Severidade</span><div className="flex gap-2">{(['critical', 'attention', 'info'] as const).map(s => (<button key={s} onClick={() => setSeverity(s)} className={`px-4 py-2 rounded-xl text-[12px] font-medium border transition-all ${severity === s ? (s === 'critical' ? 'border-rose-500/25 text-rose-300 bg-rose-500/10' : s === 'attention' ? 'border-amber-500/25 text-amber-300 bg-amber-500/10' : 'border-white/[0.12] text-white/70 bg-white/[0.04]') : 'border-white/[0.05] text-white/30 hover:text-white/50'}`} type="button">{s === 'critical' ? 'Crítico' : s === 'attention' ? 'Atenção' : 'Informação'}</button>))}</div></div></div>
      {/* Escopo */}
      <div className="border-t border-white/[0.06] pt-5"><h4 className="text-[12px] font-semibold text-white/55 uppercase tracking-wider mb-3">Escopo de análise</h4><div className="flex gap-2 flex-wrap">{(['all', 'favorites_only', 'specific_leagues', 'specific_teams'] as const).map(s => (<button key={s} onClick={() => setScope(s)} className={`px-4 py-2 rounded-xl text-[12px] font-medium border transition-all ${scope === s ? 'border-white/[0.15] text-white/80 bg-white/[0.05]' : 'border-white/[0.05] text-white/35 hover:text-white/55'}`} type="button">{s === 'all' ? 'Todos os jogos' : s === 'favorites_only' ? 'Apenas favoritos' : s === 'specific_leagues' ? 'Ligas específicas' : 'Times específicos'}</button>))}</div>{(scope === 'specific_leagues' || scope === 'specific_teams') && (<div className="mt-3"><div className="flex gap-2"><input value={scopeInput} onChange={e => setScopeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addScopeItem()} placeholder={scope === 'specific_leagues' ? 'Nome da liga' : 'Nome do time'} className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] text-white placeholder:text-white/25 outline-none" /><button onClick={addScopeItem} className="px-3 text-[12px] text-cyan-400/70 hover:text-cyan-400 font-medium" type="button">Adicionar</button></div>{scopeFilter.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{scopeFilter.map((f, i) => (<span key={i} className="text-[11px] text-white/60 bg-white/[0.05] px-3 py-1.5 rounded-lg flex items-center gap-2">{f}<button onClick={() => setScopeFilter(prev => prev.filter((_, j) => j !== i))} className="text-white/30 hover:text-rose-400/70" type="button">×</button></span>))}</div>}</div>)}</div>
      {/* Condições */}
      <div className="border-t border-white/[0.06] pt-5"><h4 className="text-[12px] font-semibold text-white/55 uppercase tracking-wider mb-3">Condições de disparo ({conditions.length})</h4><div className="space-y-2">{conditions.map((c, i) => { const hasValue = c.params.value !== undefined || c.params.maxDiff !== undefined; const hasMinMax = c.params.min !== undefined; return (<div key={i} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-5 py-3 border border-white/[0.06]"><span className="text-[13px] text-white/65 flex-1">{COND_LABELS[c.type] || c.type}</span>{hasMinMax && <><input type="number" value={Number(c.params.min) || 0} onChange={e => updateParam(i, 'min', Number(e.target.value))} className="w-16 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[12px] text-white/90 text-center outline-none" /><span className="text-[12px] text-white/30">até</span><input type="number" value={Number(c.params.max) || 90} onChange={e => updateParam(i, 'max', Number(e.target.value))} className="w-16 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[12px] text-white/90 text-center outline-none" /></>}{hasValue && <input type="number" value={Number(c.params.value ?? c.params.maxDiff) || 0} onChange={e => updateParam(i, c.params.value !== undefined ? 'value' : 'maxDiff', Number(e.target.value))} className="w-16 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[12px] text-white/90 text-center outline-none" />}<button onClick={() => setConditions(prev => prev.filter((_, j) => j !== i))} className="text-[13px] text-white/25 hover:text-rose-400/70 transition-colors" type="button">×</button></div>) })}</div><div className="flex flex-wrap gap-2 mt-3">{(Object.keys(COND_LABELS) as PatternConditionType[]).filter(t => !conditions.some(c => c.type === t)).map(t => (<button key={t} onClick={() => addCond(t)} className="text-[11px] text-white/40 hover:text-white/65 bg-white/[0.025] hover:bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/[0.05] transition-all" type="button">+ {COND_LABELS[t]}</button>))}</div></div>
      {/* Ação */}
      <div className="border-t border-white/[0.06] pt-5"><h4 className="text-[12px] font-semibold text-white/55 uppercase tracking-wider mb-3">Ação ao detectar</h4><div className="flex gap-2">{(['register_alert', 'suggest_only', 'highlight'] as const).map(a => (<button key={a} onClick={() => setAction(a)} className={`px-4 py-2 rounded-xl text-[12px] font-medium border transition-all ${action === a ? 'border-white/[0.15] text-white/80 bg-white/[0.05]' : 'border-white/[0.05] text-white/35 hover:text-white/55'}`} type="button">{a === 'register_alert' ? 'Registrar alerta' : a === 'suggest_only' ? 'Apenas sugerir' : 'Destacar no scanner'}</button>))}</div></div>
      {/* Confiança */}
      <div className="border-t border-white/[0.06] pt-5"><h4 className="text-[12px] font-semibold text-white/55 uppercase tracking-wider mb-2">Confiança mínima</h4><p className="text-[11px] text-white/35 mb-3">Quanto maior, menos alertas falsos, porém menos sinais encontrados.</p><input type="number" value={minConf} onChange={e => setMinConf(Number(e.target.value))} className="w-24 h-9 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-white/90 outline-none focus:border-white/[0.15]" min={20} max={95} /><span className="text-[12px] text-white/35 ml-2">%</span></div>
      {/* Footer */}
      <div className="border-t border-white/[0.06] pt-5 flex justify-end gap-3"><button onClick={onCancel} className="px-5 py-2.5 rounded-xl text-[12px] text-white/35 hover:text-white/55 border border-white/[0.06] transition-colors" type="button">Cancelar</button><button onClick={save} disabled={!name.trim() || conditions.length === 0} className="px-6 py-2.5 rounded-xl text-[12px] font-semibold text-cyan-300 bg-cyan-500/12 border border-cyan-500/25 hover:bg-cyan-500/18 disabled:opacity-30 disabled:cursor-not-allowed transition-all" type="button">{initial ? 'Salvar alterações' : 'Criar padrão'}</button></div>
    </div>
  </div>)
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

function CounterCell({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'amber' | 'cyan' | 'emerald' | 'white' }) {
  const c = value > 0
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
    partial: triggeredAlerts.filter(t => (t.status as string) === 'confirmed_partial').length,
    failed: triggeredAlerts.filter(t => t.status === 'failed').length,
    expired: triggeredAlerts.filter(t => t.status === 'expired' || t.status === 'unknown').length,
  }), [triggeredAlerts])

  const visible = useMemo(() => {
    if (filter === 'all') return triggeredAlerts
    if (filter === 'pending') return triggeredAlerts.filter(t => t.status === 'pending')
    if (filter === 'confirmed') return triggeredAlerts.filter(t => t.status === 'confirmed')
    if (filter === 'partial') return triggeredAlerts.filter(t => (t.status as string) === 'confirmed_partial')
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
  const stats = useMemo(() => patterns.map(p => { const a = triggeredAlerts.filter(t => t.patternId === p.id); const confirmed = a.filter(t => t.status === 'confirmed').length; const partial = a.filter(t => (t.status as string) === 'confirmed_partial').length; const failed = a.filter(t => t.status === 'failed').length; const expired = a.filter(t => t.status === 'expired').length; const unknown = a.filter(t => t.status === 'unknown').length; const resolved = confirmed + failed; const hitRate = resolved >= 5 ? Math.round((confirmed / resolved) * 100) : null; const avgConf = a.length > 0 ? Math.round(a.reduce((s, x) => s + x.confidence, 0) / a.length) : null; const needsReview = (unknown > 3 && unknown > confirmed) || (resolved >= 5 && (hitRate ?? 100) < 30); const reviewReason = unknown > 3 ? 'Muitos alertas sem dados' : (resolved >= 5 && (hitRate ?? 100) < 30) ? 'Taxa baixa' : ''; return { pattern: p, total: a.length, confirmed, partial, failed, expired, unknown, resolved, hitRate, avgConf, lastHit: a[0]?.timestamp || null, needsReview, reviewReason } }), [patterns, triggeredAlerts])

  const totalDispatched = triggeredAlerts.length
  const totalConfirmed = triggeredAlerts.filter(t => t.status === 'confirmed').length
  const totalPartial = triggeredAlerts.filter(t => (t.status as string) === 'confirmed_partial').length
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

