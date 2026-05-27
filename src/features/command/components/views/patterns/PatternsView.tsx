/**
 * PatternsView — Command Center "Padrões" tab (Pattern Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 * Owns the local state for the three modals (Custom / Template / Auto), the
 * template search and category filter, and derives every list shown on the
 * page (rich leagues / teams / matches, health snapshot, reviewable radars,
 * visible templates) from the props passed by CommandCenterPage.
 *
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 * Auto discovery activation, template anti-duplication by `templateId`,
 * prefilled drafts coming from Match Detail and the deletion / duplication
 * paths all stay identical.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import type { LiveFixture } from '@/lib/apiClient'
import type { CommandCenterAlert } from '@/context/AlertsContext'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { getKnownLeagues, getKnownTeams, getKnownMatches, getKnownLeaguesRich, getKnownTeamsRich, type ScopeKbLeague, type ScopeKbMatch, type ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import type { AutoDiscoveryConfig, Pattern, PatternTemplate, TriggeredAlert } from '../../../types/commandTypes'
import { CATEGORY_LABELS, categorizeTemplate, type TemplateCategory } from '../../../utils/commandFormatters'
import { buildPatternHealth, isReviewableHealth, type PatternHealth } from '../../../intelligence/patternHealthEngine'
import { PremiumToggle } from '../../pattern-studio/shell/PremiumToggle'
import { CounterCell } from '../shared/CounterCell'
import { ConfiguredRadarRow } from './ConfiguredRadarRow'
import { ReviewableRow } from './ReviewableRow'
import { ScopeHealthPanel } from './ScopeHealthPanel'
import { TemplateCard } from './TemplateCard'

// V4.3 — lazy load the three large Pattern Studio modals so the initial chunk
// of the Command Center doesn't pay for them. They only ship when the user
// actually clicks "Criar radar", "Configurar template" or "Configurar motor".
//
// V4.4 — share the import promises with the prefetch helpers via
// `./modalPreload` so hover/focus on the relevant CTA can warm the chunk
// before the click without ever ending up with two separate chunks.
import { importAutoDiscoveryConfigModal, importCustomPatternModal, importTemplateConfigModal, preloadAutoDiscoveryConfigModal, preloadCustomPatternModal, preloadTemplateConfigModal } from '../../pattern-studio/modals/modalPreload'

const CustomPatternModal = lazy(() =>
  importCustomPatternModal().then(m => ({ default: m.CustomPatternModal }))
)
const TemplateConfigModal = lazy(() =>
  importTemplateConfigModal().then(m => ({ default: m.TemplateConfigModal }))
)
const AutoDiscoveryConfigModal = lazy(() =>
  importAutoDiscoveryConfigModal().then(m => ({ default: m.AutoDiscoveryConfigModal }))
)

/**
 * ModalLoadingFallback — discreet centered indicator shown while a Pattern
 * Studio modal chunk is being fetched. Stays brief because chunks are tiny
 * relative to the rest of the app, but renders something honest so the user
 * never sees a frozen UI.
 */
function ModalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0b0d12]/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 rounded-full border-2 border-white/[0.08] border-t-cyan-400/80 animate-spin" />
        <span className="text-[11px] tracking-wider uppercase text-white/45">Carregando estúdio</span>
      </div>
    </div>
  )
}

export interface PatternsViewProps {
  patterns: Pattern[]
  templates: PatternTemplate[]
  createFromTemplate: (id: string) => Pattern | null
  createPattern: (p: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => Pattern
  updatePattern: (id: string, patch: Partial<Pattern>) => void
  togglePattern: (id: string) => void
  deletePattern: (id: string) => void
  isAdvanced: boolean
  showBuilder: boolean
  setShowBuilder: (v: boolean) => void
  discoveryConfig: AutoDiscoveryConfig
  updateDiscoveryConfig: (p: Partial<AutoDiscoveryConfig>) => void
  triggeredAlerts: TriggeredAlert[]
  commandAlerts: CommandCenterAlert[]
  fixtures: LiveFixture[]
  prefilledDraft: Pattern | null
  clearPrefilledDraft: () => void
}

export function PatternsView({ patterns, templates, createFromTemplate: _createFromTemplate, createPattern, updatePattern, togglePattern, deletePattern, isAdvanced, showBuilder, setShowBuilder, discoveryConfig, updateDiscoveryConfig, triggeredAlerts, commandAlerts, fixtures, prefilledDraft, clearPrefilledDraft }: PatternsViewProps) {
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
      {/* Modals — lazy-loaded and conditionally mounted so their JS chunk
          only ships when the user actually opens one. The local Suspense
          renders a discreet overlay during the (typically tiny) network
          fetch the first time. After mount they keep working as before. */}
      <Suspense fallback={<ModalLoadingFallback />}>
        {showBuilder && (
          <CustomPatternModal open={showBuilder} initial={editingPattern} onClose={() => { setShowBuilder(false); setEditingPattern(null); if (prefilledDraft) clearPrefilledDraft() }} onSave={handleCustomSave} availableMatches={availableMatches} availableLeaguesRich={availableLeaguesRich} availableTeamsRich={availableTeamsRich} />
        )}
        {templateModal && (
          <TemplateConfigModal open={!!templateModal} template={templateModal.template} existingPattern={templateModal.existing} onClose={() => setTemplateModal(null)} onSave={handleTemplateSave} availableMatches={availableMatches} availableLeaguesRich={availableLeaguesRich} availableTeamsRich={availableTeamsRich} />
        )}
        {showAutoConfig && (
          <AutoDiscoveryConfigModal open={showAutoConfig} config={discoveryConfig} onClose={() => setShowAutoConfig(false)} onChange={updateDiscoveryConfig} onActivate={handleActivateAuto} onDeactivate={handleDeactivateAuto} />
        )}
      </Suspense>

      {/* Header — Pattern Studio premium */}
      <header className="rounded-[20px] border border-white/[0.06] bg-white/[0.012] p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 block mb-1.5">Pattern Studio</span>
            <h2 className="text-[22px] sm:text-[24px] font-semibold text-white/95 tracking-tight leading-[1.15]">Crie radares inteligentes</h2>
            <p className="text-[13px] text-white/55 mt-2 max-w-[560px] leading-relaxed">Combine gatilhos reais e configure o motor automático para detectar sinais ao vivo nas partidas.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowAutoConfig(true)} onMouseEnter={preloadAutoDiscoveryConfigModal} onFocus={preloadAutoDiscoveryConfigModal} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] transition-colors flex items-center gap-1.5">
              <Sparkles size={13} />Configurar motor
            </button>
            <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} onMouseEnter={preloadCustomPatternModal} onFocus={preloadCustomPatternModal} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold border border-white/30 bg-white/[0.95] hover:bg-white transition-colors duration-200 flex items-center gap-1.5" style={{ color: '#0b0d12' }}>
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
      <section onMouseEnter={preloadAutoDiscoveryConfigModal} className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
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
          <button onClick={() => setShowAutoConfig(true)} onFocus={preloadAutoDiscoveryConfigModal} type="button" className="px-3.5 py-2 rounded-xl text-[11.5px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] transition-colors">Configurar</button>
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
                onPrefetch={preloadCustomPatternModal}
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
            <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} onMouseEnter={preloadCustomPatternModal} onFocus={preloadCustomPatternModal} type="button" className="text-[11px] font-medium text-white/65 hover:text-white/95 transition-colors flex items-center gap-1"><Plus size={11} />Novo radar</button>
          </div>
          <div className="space-y-2">
            {patterns.map(p => <ConfiguredRadarRow key={p.id} pattern={p} health={healthByPattern.get(p.id)} triggeredAlerts={triggeredAlerts} onToggle={() => togglePattern(p.id)} onEdit={() => { setEditingPattern(p); setShowBuilder(true) }} onDuplicate={() => { createPattern({ ...p, name: `${p.name} (cópia)`, status: 'paused', isTemplate: false, templateId: undefined }) }} onDelete={() => deletePattern(p.id)} isAdvanced={isAdvanced} onPrefetch={preloadCustomPatternModal} />)}
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
            <button onClick={() => { setEditingPattern(null); setShowBuilder(true) }} onMouseEnter={preloadCustomPatternModal} onFocus={preloadCustomPatternModal} type="button" className="px-4 py-2 rounded-xl text-[12px] font-semibold border border-white/30 bg-white/[0.95] hover:bg-white transition-colors duration-200" style={{ color: '#0b0d12' }}>+ Criar radar personalizado</button>
            {templates.length > 0 && (
              <button onClick={() => { const first = templates[0]; if (first) handleTemplateConfigure(first) }} onMouseEnter={preloadTemplateConfigModal} onFocus={preloadTemplateConfigModal} type="button" className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-colors">Ativar template</button>
            )}
            <button onClick={() => setShowAutoConfig(true)} onMouseEnter={preloadAutoDiscoveryConfigModal} onFocus={preloadAutoDiscoveryConfigModal} type="button" className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-colors">Configurar motor</button>
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
              return <TemplateCard key={t.id} template={t} existing={existing} isActive={isActiveTpl} health={tplHealth} onToggle={() => handleTemplateToggle(t)} onConfigure={() => handleTemplateConfigure(t)} onPrefetch={preloadTemplateConfigModal} />
            })}
          </div>
        )}
      </section>
    </div>
  )
}
