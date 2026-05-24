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
          <section className="rounded-2xl border border-white/[0.04] bg-white/[0.008] p-8 text-center">
            <p className="text-[14px] text-white/40">Nenhum sinal detectado agora</p>
            <p className="text-[12px] text-white/25 mt-1">Monitorando {fixtures.length} partidas com {activePatternCount} padrões ativos</p>
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
      <section className="rounded-xl border border-white/[0.05] bg-white/[0.008] p-5">
        <div className="flex items-center justify-between"><div><h3 className="text-[13px] font-semibold text-white/60">Motor automático</h3><p className="text-[11px] text-white/30 mt-0.5">{discoveryConfig.enabled && discoveryConfig.userConfigured ? 'Ativo — detectando sinais automaticamente' : 'Desligado — configure para ativar'}</p></div><button onClick={() => setShowConfig(true)} className={`px-4 py-2 rounded-xl text-[11px] font-medium transition-all ${discoveryConfig.enabled && discoveryConfig.userConfigured ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 hover:bg-cyan-500/15'}`} type="button">{discoveryConfig.enabled && discoveryConfig.userConfigured ? 'Configurado ✓' : 'Configurar'}</button></div>
      </section>

      {/* Meus padrões */}
      {patterns.length > 0 && (<section><div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/40">Meus padrões</h3><button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} className="text-[11px] text-cyan-400/60 hover:text-cyan-400 font-medium flex items-center gap-1 transition-colors" type="button"><Plus size={12} />Criar</button></div><div className="space-y-2">{patterns.map(p => (<div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.008] px-5 py-3.5"><div className={`h-2.5 w-2.5 rounded-full shrink-0 ${p.status === 'active' ? 'bg-emerald-400' : 'bg-white/20'}`} /><div className="flex-1 min-w-0"><span className="text-[13px] font-medium text-white/70 block">{p.name}</span><span className="text-[11px] text-white/35 block mt-0.5">{p.description || `${p.conditions.length} condições`}{p.scope !== 'all' ? ` · ${p.scope === 'favorites_only' ? 'Favoritos' : p.scope === 'specific_leagues' ? `${p.scopeFilter?.length || 0} ligas` : `${p.scopeFilter?.length || 0} times`}` : ''}</span></div><button onClick={() => handleEdit(p)} className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/[0.03] transition-all" type="button">Editar</button><button onClick={() => handleDuplicate(p)} className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/[0.03] transition-all" type="button">Duplicar</button><button onClick={() => togglePattern(p.id)} className={`text-[10px] px-3 py-1 rounded-lg border transition-all ${p.status === 'active' ? 'border-emerald-500/15 text-emerald-400/70' : 'border-white/[0.05] text-white/30'}`} type="button">{p.status === 'active' ? 'Ativo' : 'Pausado'}</button><button onClick={() => deletePattern(p.id)} className="text-[12px] text-white/20 hover:text-rose-400/60 transition-colors px-1" type="button">×</button></div>))}</div></section>)}

      {/* Templates */}
      <section><div className="flex items-center justify-between mb-3"><h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/40">Templates recomendados</h3>{!showBuilder && patterns.length === 0 && <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} className="text-[11px] text-cyan-400/60 hover:text-cyan-400 font-medium flex items-center gap-1 transition-colors" type="button"><Plus size={12} />Personalizado</button>}</div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{templates.map(t => { const active = patterns.some(p => p.templateId === t.id && p.status === 'active'); return (<div key={t.id} className="rounded-xl border border-white/[0.05] bg-white/[0.006] p-4 hover:border-white/[0.08] transition-all"><div className="flex items-start justify-between mb-2"><div><span className="text-[12px] font-medium text-white/60 block">{t.name}</span><span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg mt-1 inline-block ${t.severity === 'critical' ? 'bg-rose-500/10 text-rose-400/60' : t.severity === 'attention' ? 'bg-amber-500/8 text-amber-400/50' : 'bg-white/[0.03] text-white/25'}`}>{t.severity}</span></div>{active ? <span className="text-[10px] text-emerald-400/60 font-medium">✓ Ativo</span> : <button onClick={() => createFromTemplate(t.id)} className="text-[10px] text-cyan-400/60 hover:text-cyan-400 font-medium transition-colors" type="button">Ativar</button>}</div><p className="text-[11px] text-white/35 leading-relaxed">{t.description}</p></div>) })}</div></section>
    </div>
  )
}

// ═══ AUTO CONFIG PANEL ═══
function AutoConfigPanel({ config, onChange, onClose, onActivate }: { config: AutoDiscoveryConfig; onChange: (p: Partial<AutoDiscoveryConfig>) => void; onClose: () => void; onActivate: () => void }) {
  return (<div className="rounded-xl border border-cyan-500/12 bg-gradient-to-b from-cyan-500/[0.02] to-transparent p-6"><div className="flex items-center justify-between mb-4"><h3 className="text-[14px] font-semibold text-white/60">Configurar motor automático</h3><button onClick={onClose} className="text-white/25 hover:text-white/50" type="button"><X size={16} /></button></div><div className="grid grid-cols-2 gap-4 mb-5"><Toggle label="Monitorar favoritos" checked={config.monitorFavorites} onChange={v => onChange({ monitorFavorites: v })} /><Toggle label="Ligas principais" checked={config.monitorMainLeagues} onChange={v => onChange({ monitorMainLeagues: v })} /><Toggle label="Todas as ligas" checked={config.monitorAllLeagues} onChange={v => onChange({ monitorAllLeagues: v })} /><Toggle label="Incluir pré-jogo" checked={config.includePreMatch} onChange={v => onChange({ includePreMatch: v })} /><Toggle label="Incluir ao vivo" checked={config.includeLive} onChange={v => onChange({ includeLive: v })} /><Toggle label="Registrar alerta auto" checked={config.registerAlertAuto} onChange={v => onChange({ registerAlertAuto: v })} /><div><span className="text-[10px] text-white/35 block mb-1">Confiança mín.</span><input type="number" value={config.minConfidence} onChange={e => onChange({ minConfidence: Number(e.target.value) })} className="w-20 h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[11px] text-white outline-none" min={20} max={95} /></div><div><span className="text-[10px] text-white/35 block mb-1">Max alertas/jogo</span><input type="number" value={config.maxAlertsPerMatch} onChange={e => onChange({ maxAlertsPerMatch: Number(e.target.value) })} className="w-20 h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[11px] text-white outline-none" min={1} max={10} /></div></div><button onClick={onActivate} className="w-full py-3 rounded-xl text-[12px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/20 transition-colors" type="button">Salvar e ativar motor</button></div>)
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return (<button onClick={() => onChange(!checked)} className="flex items-center gap-2.5 text-left" type="button"><div className={`w-8 h-[18px] rounded-full transition-colors ${checked ? 'bg-cyan-500/30' : 'bg-white/[0.08]'}`}><div className={`w-3.5 h-3.5 rounded-full mt-[2px] transition-all ${checked ? 'ml-[17px] bg-cyan-400' : 'ml-[2px] bg-white/25'}`} /></div><span className="text-[11px] text-white/50">{label}</span></button>) }

// ═══ PATTERN BUILDER ═══
const COND_LABELS: Record<PatternConditionType, string> = { is_live: 'Jogo ao vivo', is_final_phase: 'Reta final (70\'+)', is_pre_live: 'Começa em breve', minute_between: 'Minuto entre', score_tied: 'Placar empatado', score_diff_lte: 'Diferença gols ≤', favorite_involved: 'Favorito envolvido', shots_recent_gte: 'Finalizações ≥', shots_on_target_gte: 'No alvo ≥', corners_gte: 'Escanteios ≥', cards_gte: 'Cartões ≥', possession_gte: 'Posse ≥', goals_total_gte: 'Gols totais ≥', goals_total_lte: 'Gols totais ≤', away_shots_on_target_gte: 'Visitante no alvo ≥', away_goals_gte: 'Gols visitante ≥', away_possession_gte: 'Posse visitante ≥' }

function PatternBuilderPanel({ onSave, onCancel, initial }: { onSave: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void; onCancel: () => void; initial?: Pattern | null }) {
  const [name, setName] = useState(initial?.name || ''); const [desc, setDesc] = useState(initial?.description || ''); const [severity, setSeverity] = useState<'critical' | 'attention' | 'info'>(initial?.severity || 'attention'); const [scope, setScope] = useState<'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams'>(initial?.scope || 'all'); const [scopeFilter, setScopeFilter] = useState<string[]>(initial?.scopeFilter || []); const [scopeInput, setScopeInput] = useState(''); const [minConf, setMinConf] = useState(initial?.minConfidence ?? 50); const [action, setAction] = useState<'register_alert' | 'suggest_only' | 'highlight'>(initial?.action || 'register_alert'); const [conditions, setConditions] = useState<PatternCondition[]>(initial?.conditions || [{ type: 'is_live', params: {} }])
  const addCond = (type: PatternConditionType) => { const params: Record<string, number | string | boolean> = {}; if (type === 'minute_between') { params.min = 60; params.max = 90 } else if (type === 'score_diff_lte') { params.maxDiff = 1 } else if (type === 'goals_total_lte') { params.value = 1 } else if (type === 'is_pre_live') { params.minutes = 60 } else if (['shots_recent_gte', 'shots_on_target_gte', 'corners_gte', 'cards_gte', 'goals_total_gte', 'away_shots_on_target_gte', 'away_goals_gte'].includes(type)) { params.value = 3 } else if (['possession_gte', 'away_possession_gte'].includes(type)) { params.value = 58 }; setConditions(prev => [...prev, { type, params }]) }
  const updateParam = (idx: number, key: string, val: number) => { setConditions(prev => prev.map((c, i) => i === idx ? { ...c, params: { ...c.params, [key]: val } } : c)) }
  const save = () => { if (!name.trim() || conditions.length === 0) return; onSave({ name: name.trim(), description: desc.trim(), conditions, severity, status: initial?.status || 'active', isTemplate: initial?.isTemplate || false, templateId: initial?.templateId, scope, scopeFilter: (scope === 'specific_leagues' || scope === 'specific_teams') ? scopeFilter : undefined, minConfidence: minConf, action, maxTriggersPerMatch: 2, antiDuplicateWindow: 5 }) }
  const addScopeItem = () => { if (scopeInput.trim() && !scopeFilter.includes(scopeInput.trim())) { setScopeFilter(prev => [...prev, scopeInput.trim()]); setScopeInput('') } }

  return (<div className="rounded-xl border border-cyan-500/12 bg-gradient-to-b from-cyan-500/[0.015] to-transparent p-6"><div className="flex items-center justify-between mb-4"><h3 className="text-[14px] font-medium text-white/60">{initial ? 'Editar padrão' : 'Criar padrão'}</h3><button onClick={onCancel} className="text-white/25 hover:text-white/50" type="button"><X size={16} /></button></div><div className="space-y-4"><input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do padrão" className="w-full h-10 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 text-[12px] text-white placeholder:text-white/25 outline-none focus:border-white/[0.12]" /><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descrição (opcional)" className="w-full h-10 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 text-[12px] text-white placeholder:text-white/25 outline-none focus:border-white/[0.12]" /><div className="flex gap-4 flex-wrap"><div><span className="text-[10px] text-white/35 block mb-1.5">Severidade</span><div className="flex gap-1.5">{(['critical', 'attention', 'info'] as const).map(s => (<button key={s} onClick={() => setSeverity(s)} className={`text-[10px] px-3 py-1.5 rounded-lg border transition-all ${severity === s ? 'border-white/[0.12] text-white/70 bg-white/[0.04]' : 'border-white/[0.04] text-white/25'}`} type="button">{s === 'critical' ? 'Crítico' : s === 'attention' ? 'Atenção' : 'Info'}</button>))}</div></div><div><span className="text-[10px] text-white/35 block mb-1.5">Escopo</span><div className="flex gap-1.5 flex-wrap">{(['all', 'favorites_only', 'specific_leagues', 'specific_teams'] as const).map(s => (<button key={s} onClick={() => setScope(s)} className={`text-[10px] px-3 py-1.5 rounded-lg border transition-all ${scope === s ? 'border-white/[0.12] text-white/70 bg-white/[0.04]' : 'border-white/[0.04] text-white/25'}`} type="button">{s === 'all' ? 'Todos' : s === 'favorites_only' ? 'Favoritos' : s === 'specific_leagues' ? 'Ligas' : 'Times'}</button>))}</div>{(scope === 'specific_leagues' || scope === 'specific_teams') && (<div className="mt-2"><div className="flex gap-1.5"><input value={scopeInput} onChange={e => setScopeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addScopeItem()} placeholder={scope === 'specific_leagues' ? 'Nome da liga' : 'Nome do time'} className="flex-1 h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[10px] text-white placeholder:text-white/20 outline-none" /><button onClick={addScopeItem} className="text-[10px] text-cyan-400/60 px-2" type="button">+</button></div>{scopeFilter.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{scopeFilter.map((f, i) => (<span key={i} className="text-[10px] text-white/50 bg-white/[0.04] px-2.5 py-1 rounded-lg flex items-center gap-1.5">{f}<button onClick={() => setScopeFilter(prev => prev.filter((_, j) => j !== i))} className="text-white/25 hover:text-rose-400/60" type="button">×</button></span>))}</div>}</div>)}</div><div><span className="text-[10px] text-white/35 block mb-1.5">Confiança mín.</span><input type="number" value={minConf} onChange={e => setMinConf(Number(e.target.value))} className="w-20 h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[11px] text-white outline-none" min={20} max={95} /></div><div><span className="text-[10px] text-white/35 block mb-1.5">Ação</span><div className="flex gap-1.5">{(['register_alert', 'suggest_only', 'highlight'] as const).map(a => (<button key={a} onClick={() => setAction(a)} className={`text-[10px] px-3 py-1.5 rounded-lg border transition-all ${action === a ? 'border-white/[0.12] text-white/70 bg-white/[0.04]' : 'border-white/[0.04] text-white/25'}`} type="button">{a === 'register_alert' ? 'Alerta' : a === 'suggest_only' ? 'Sugerir' : 'Destacar'}</button>))}</div></div></div><div><span className="text-[10px] text-white/35 block mb-2">Condições ({conditions.length})</span><div className="space-y-1.5">{conditions.map((c, i) => { const hasValue = c.params.value !== undefined || c.params.maxDiff !== undefined; const hasMinMax = c.params.min !== undefined; return (<div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.025] px-4 py-2 border border-white/[0.04]"><span className="text-[11px] text-white/55 flex-1">{COND_LABELS[c.type] || c.type}</span>{hasMinMax && <><input type="number" value={Number(c.params.min) || 0} onChange={e => updateParam(i, 'min', Number(e.target.value))} className="w-14 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 text-[10px] text-white text-center outline-none" /><span className="text-[10px] text-white/25">-</span><input type="number" value={Number(c.params.max) || 90} onChange={e => updateParam(i, 'max', Number(e.target.value))} className="w-14 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 text-[10px] text-white text-center outline-none" /></>}{hasValue && <input type="number" value={Number(c.params.value ?? c.params.maxDiff) || 0} onChange={e => updateParam(i, c.params.value !== undefined ? 'value' : 'maxDiff', Number(e.target.value))} className="w-16 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 text-[10px] text-white text-center outline-none" />}<button onClick={() => setConditions(prev => prev.filter((_, j) => j !== i))} className="text-[11px] text-white/20 hover:text-rose-400/60" type="button">×</button></div>) })}</div><div className="flex flex-wrap gap-1.5 mt-3">{(Object.keys(COND_LABELS) as PatternConditionType[]).filter(t => !conditions.some(c => c.type === t)).slice(0, 8).map(t => (<button key={t} onClick={() => addCond(t)} className="text-[9px] text-white/30 hover:text-white/55 bg-white/[0.02] hover:bg-white/[0.03] px-3 py-1.5 rounded-lg border border-white/[0.04] transition-all" type="button">+ {COND_LABELS[t]}</button>))}</div></div><div className="flex justify-end gap-3 pt-2"><button onClick={onCancel} className="text-[11px] text-white/30 hover:text-white/50 px-4 py-2" type="button">Cancelar</button><button onClick={save} disabled={!name.trim() || conditions.length === 0} className="text-[11px] text-cyan-400/80 hover:text-cyan-400 font-semibold px-5 py-2 rounded-xl border border-cyan-500/20 hover:border-cyan-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all" type="button">{initial ? 'Salvar alterações' : 'Criar padrão'}</button></div></div></div>)
}


// ═══ SCANNER ═══
function ScannerView({ hasIntelligence, entries, openMatch, isAdvanced, onGoToPatterns }: { hasIntelligence: boolean; entries: ScannerEntry[]; openMatch: (fx: LiveFixture) => void; isAdvanced: boolean; onGoToPatterns: () => void }) {
  if (!hasIntelligence) { return (<div className="rounded-2xl border border-white/[0.05] border-dashed bg-white/[0.008] p-10 text-center"><Eye size={24} className="mx-auto text-white/20 mb-3" /><p className="text-[14px] text-white/40 font-medium">Nenhum radar configurado</p><p className="text-[12px] text-white/25 mt-1.5 max-w-[400px] mx-auto">Crie um padrão ou configure o modo automático para começar a escanear partidas.</p><div className="flex justify-center gap-3 mt-5"><button onClick={onGoToPatterns} className="px-5 py-2.5 rounded-xl text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors" type="button">Ativar template</button><button onClick={onGoToPatterns} className="px-5 py-2.5 rounded-xl text-[11px] font-medium text-white/40 border border-white/[0.06] hover:text-white/60 transition-colors" type="button">Configurar automático</button></div></div>) }
  if (entries.length === 0) { return (<div className="rounded-2xl border border-white/[0.04] bg-white/[0.006] p-10 text-center"><p className="text-[14px] text-white/40">Nenhum sinal detectado agora</p><p className="text-[12px] text-white/25 mt-1">O motor está analisando partidas ao vivo com os padrões configurados.</p></div>) }
  return (<div className="space-y-4"><p className="text-[12px] text-white/35">{entries.length} {entries.length === 1 ? 'jogo com sinal' : 'jogos com sinais'} detectados</p><div className="space-y-2">{entries.map(entry => { const fx = entry.fixture; return (<div key={fx.id} onClick={() => openMatch(fx)} className="group flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.006] px-5 py-3.5 cursor-pointer hover:border-white/[0.08] transition-all" role="button"><span className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded-lg shrink-0 ${entry.priority === 'critical' ? 'bg-rose-500/10 text-rose-400/70' : entry.priority === 'attention' ? 'bg-amber-500/8 text-amber-400/60' : 'bg-cyan-500/6 text-cyan-400/50'}`}>{entry.priority === 'critical' ? 'CRÍT' : entry.priority === 'attention' ? 'ATEN' : 'OBS'}</span><span className={`text-[11px] font-medium tabular-nums w-9 shrink-0 ${isLiveFx(fx) ? 'text-emerald-400' : 'text-white/25'}`}>{isLiveFx(fx) ? `${fx.status.elapsed || ''}'` : ''}</span><ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={18} /><span className="text-[13px] text-white/65 truncate flex-1">{fx.homeTeam.name} {fx.score.home ?? '-'}:{fx.score.away ?? '-'} {fx.awayTeam.name}</span><ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={18} /><span className="text-[11px] text-white/35 shrink-0 max-w-[120px] truncate">{entry.reason}</span><span className="text-[11px] text-white/25 tabular-nums shrink-0">{entry.confidence}%</span>{isAdvanced && <span className="text-[9px] text-white/15 font-mono shrink-0">{entry.patterns.length}p</span>}<ChevronRight size={12} className="text-white/15 group-hover:text-white/35 shrink-0" /></div>) })}</div></div>)
}

// ═══ ALERTS ═══
function AlertsView({ triggeredAlerts, isAdvanced, openMatch, fixtures, navigate }: { triggeredAlerts: TriggeredAlert[]; isAdvanced: boolean; openMatch: (fx: LiveFixture) => void; fixtures: LiveFixture[]; navigate: (path: string) => void }) {
  if (triggeredAlerts.length === 0) { return (<div className="rounded-2xl border border-white/[0.04] border-dashed bg-white/[0.006] p-10 text-center"><Zap size={24} className="mx-auto text-white/20 mb-3" /><p className="text-[14px] text-white/40">Nenhum alerta disparado</p><p className="text-[12px] text-white/25 mt-1">Quando padrões baterem em jogos ao vivo, os alertas aparecerão aqui</p><button onClick={() => navigate('/app/alerts')} className="mt-4 text-[11px] text-cyan-400/60 hover:text-cyan-400 font-medium transition-colors" type="button">Gerenciar alertas →</button></div>) }
  return (<div className="space-y-4"><div className="flex items-center justify-between"><h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/35">Alertas disparados</h3><button onClick={() => navigate('/app/alerts')} className="text-[11px] text-cyan-400/50 hover:text-cyan-400 font-medium transition-colors" type="button">Ver em /app/alerts →</button></div><div className="space-y-2">{triggeredAlerts.map(t => { const fx = fixtures.find(f => f.id === t.fixtureId); const sl = t.status === 'pending' ? 'Pendente' : t.status === 'confirmed' ? 'Confirmado' : (t.status as string) === 'confirmed_partial' ? 'Parcial' : t.status === 'failed' ? 'Falhou' : t.status === 'expired' ? 'Expirado' : 'Desconhecido'; const sc = t.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' : t.status === 'failed' ? 'bg-rose-500/10 text-rose-400' : t.status === 'pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/[0.04] text-white/35'; return (<div key={t.id} onClick={() => fx && openMatch(fx)} className={`rounded-xl border border-white/[0.04] bg-white/[0.006] px-5 py-3.5 ${fx ? 'cursor-pointer hover:border-white/[0.08]' : ''} transition-all`} role={fx ? 'button' : undefined}><div className="flex items-center justify-between mb-1.5"><div className="flex items-center gap-2"><span className="text-[13px] font-medium text-white/65">{t.patternName}</span><span className="text-[11px] text-white/30 tabular-nums">{t.confidence}%</span></div><span className={`text-[9px] font-semibold px-2.5 py-1 rounded-lg ${sc}`}>{sl}</span></div><div className="flex items-center gap-2 text-[11px] text-white/40"><span>{t.homeTeam} x {t.awayTeam}</span>{t.minute && <span>· {t.minute}'</span>}<span>· {t.league}</span></div>{isAdvanced && <div className="mt-1.5 text-[10px] text-white/20 font-mono">{t.reasons.slice(0, 3).join(' · ')} | {t.scoreAtTrigger.home}-{t.scoreAtTrigger.away}</div>}<span className="text-[10px] text-white/20 mt-1 block">{new Date(t.timestamp).toLocaleString('pt-BR')}</span></div>) })}</div></div>)
}

// ═══ PERFORMANCE ═══
function PerformanceView({ patterns, triggeredAlerts, isAdvanced }: { patterns: Pattern[]; triggeredAlerts: TriggeredAlert[]; isAdvanced: boolean }) {
  const stats = useMemo(() => patterns.map(p => { const a = triggeredAlerts.filter(t => t.patternId === p.id); const confirmed = a.filter(t => t.status === 'confirmed').length; const partial = a.filter(t => (t.status as string) === 'confirmed_partial').length; const failed = a.filter(t => t.status === 'failed').length; const expired = a.filter(t => t.status === 'expired').length; const unknown = a.filter(t => t.status === 'unknown').length; const resolved = confirmed + failed; const hitRate = resolved >= 5 ? Math.round((confirmed / resolved) * 100) : null; const avgConf = a.length > 0 ? Math.round(a.reduce((s, x) => s + x.confidence, 0) / a.length) : null; const needsReview = (unknown > 3 && unknown > confirmed) || (resolved >= 5 && (hitRate ?? 100) < 30); const reviewReason = unknown > 3 ? 'Muitos alertas sem dados' : (resolved >= 5 && (hitRate ?? 100) < 30) ? 'Taxa baixa' : ''; return { pattern: p, total: a.length, confirmed, partial, failed, expired, unknown, hitRate, avgConf, lastHit: a[0]?.timestamp || null, needsReview, reviewReason } }), [patterns, triggeredAlerts])
  const totalD = triggeredAlerts.length; const totalC = triggeredAlerts.filter(t => t.status === 'confirmed').length; const totalF = triggeredAlerts.filter(t => t.status === 'failed').length; const pNeedReview = stats.filter(s => s.needsReview)

  if (patterns.length === 0) { return (<div className="rounded-2xl border border-white/[0.04] border-dashed bg-white/[0.006] p-10 text-center"><BarChart3 size={24} className="mx-auto text-white/20 mb-3" /><p className="text-[14px] text-white/40">Sem dados de performance</p><p className="text-[12px] text-white/25 mt-1">Ative padrões para começar a medir resultados</p></div>) }

  return (<div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><MCard label="Disparos" value={totalD} color="white" /><MCard label="Confirmados" value={totalC} color="emerald" /><MCard label="Falhados" value={totalF} color="rose" /><MCard label="Padrões" value={patterns.length} color="cyan" /></div>
    {pNeedReview.length > 0 && (<section className="rounded-xl border border-amber-500/12 bg-amber-500/[0.02] p-5"><h4 className="text-[12px] font-semibold text-amber-400/60 mb-2">Padrões que precisam de revisão</h4><div className="space-y-2">{pNeedReview.map(s => (<div key={s.pattern.id} className="flex items-center justify-between"><span className="text-[12px] text-white/55">{s.pattern.name}</span><span className="text-[11px] text-amber-400/50">{s.reviewReason}</span></div>))}</div></section>)}
    <section><h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/35 mb-3">Por padrão</h4><div className="space-y-2">{stats.map(s => (<div key={s.pattern.id} className="rounded-xl border border-white/[0.04] bg-white/[0.006] px-5 py-3.5"><div className="flex items-center justify-between mb-1"><span className="text-[13px] font-medium text-white/65">{s.pattern.name}</span><span className={`text-[9px] px-2.5 py-1 rounded-lg ${s.pattern.status === 'active' ? 'bg-emerald-500/8 text-emerald-400/60' : 'bg-white/[0.03] text-white/20'}`}>{s.pattern.status}</span></div><div className="flex items-center gap-4 text-[11px] text-white/40 flex-wrap"><span>{s.total} disparos</span>{s.hitRate !== null ? <span className="text-emerald-400/70 font-medium">Taxa: {s.hitRate}%</span> : <span className="text-white/25">Insuficiente ({s.confirmed + s.failed}/5)</span>}{s.partial > 0 && <span className="text-cyan-400/50">Parciais: {s.partial}</span>}{s.avgConf !== null && <span>Conf: {s.avgConf}%</span>}{s.lastHit && <span>Último: {new Date(s.lastHit).toLocaleDateString('pt-BR')}</span>}</div>{isAdvanced && <div className="mt-1.5 text-[10px] text-white/20 font-mono">✓{s.confirmed} · ~{s.partial} · ✗{s.failed} · ⏱{s.expired} · ?{s.unknown}</div>}</div>))}</div></section>
  </div>)
}
function MCard({ label, value, color }: { label: string; value: number; color: string }) { const cc = value > 0 ? (color === 'emerald' ? 'text-emerald-400' : color === 'cyan' ? 'text-cyan-400' : color === 'rose' ? 'text-rose-400' : 'text-white/70') : 'text-white/20'; return (<div className="rounded-xl border border-white/[0.04] bg-white/[0.006] px-4 py-3.5 text-center"><span className={`text-[20px] font-bold tabular-nums block ${cc}`}>{value}</span><span className="text-[10px] text-white/35">{label}</span></div>) }
