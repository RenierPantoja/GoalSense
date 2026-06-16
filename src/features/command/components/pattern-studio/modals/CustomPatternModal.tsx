/**
 * CustomPatternModal — Radar Composer 2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Native-feeling composer for creating/editing a custom radar. Replaces the
 * horizontal wizard with a 3-column layout: compact lateral nav · modular
 * canvas · intelligent preview, plus a fixed action footer.
 *
 * FUNCTIONAL CONTRACT IS PRESERVED VERBATIM:
 *   - `CustomPatternModalProps` is unchanged (PatternsView keeps working).
 *   - `buildData()` emits the exact same `Omit<Pattern,'id'|'createdAt'|'updatedAt'>`
 *     payload as the previous wizard — the backend/sync sees no difference.
 *   - Validations preserved: name required, at least one condition required.
 *   - Dry-run ("Testar ao vivo") is client-side only and never persists data.
 *   - `useScopeLookups` is invoked before any early-return (Rules of Hooks).
 *
 * Keyboard: Esc closes (confirm if dirty) · Cmd/Ctrl+S saves paused ·
 * Cmd/Ctrl+Enter creates & activates when valid.
 */
import { useEffect, useState } from 'react'
import type { Pattern, PatternCondition, FixtureStatsForPattern } from '../../../types/commandTypes'
import type { LiveFixture } from '@/lib/apiClient'
import type { CommandTimedEvent } from '../../../intelligence/commandTimedEvents'
import type { CommandCenterAlert } from '@/context/AlertsContext'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { runPatternDryRun, validateDryRunPattern } from '../../../intelligence/patternDryRunEngine'
import { useScopeLookups } from '../../../utils/patternStudioHelpers'
import { ModalShell } from '../shell/ModalShell'
import { ComposerNav, type ComposerNavItem } from '../shell/ComposerNav'
import { ScopePicker } from '../scope/ScopePicker'
import { TriggerComposer } from '../triggers/TriggerComposer'
import { SeverityPicker } from '../form-controls/SeverityPicker'
import { ActionCardPicker } from '../form-controls/ActionCardPicker'
import { ConfidenceSlider } from '../form-controls/ConfidenceSlider'
import { RadarInspectorPanel } from '../inspector/RadarInspectorPanel'
import { RadarPreview } from '../preview/RadarPreview'
import { PatternDryRunPanel } from '../dryrun/PatternDryRunPanel'

type CustomStep = 'identity' | 'scope' | 'conditions' | 'action' | 'confidence' | 'review'

export interface CustomPatternModalProps {
  open: boolean
  initial: Pattern | null
  onClose: () => void
  onSave: (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void
  availableMatches: ScopeKbMatch[]
  availableLeaguesRich: ScopeKbLeague[]
  availableTeamsRich: ScopeKbTeam[]
  /** V10: fixtures for dry-run testing. */
  fixtures: LiveFixture[]
  /** V10: stats map for dry-run testing. */
  statsMap: Map<number, FixtureStatsForPattern>
  /** V10: events map for dry-run testing. */
  eventsMap: Map<number, CommandTimedEvent[]>
  /** V10: favorite team checker for dry-run scope. */
  isFavoriteTeam: (name: string) => boolean
  /** V10: advanced mode for dry-run detail. */
  isAdvanced?: boolean
  /** V12: existing alerts for duplicate guard in dry-run. */
  commandAlerts?: CommandCenterAlert[]
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h4 className="text-[16px] font-semibold text-white/95 tracking-tight leading-tight">{title}</h4>
      <p className="text-[12px] text-white/50 mt-1 leading-relaxed">{description}</p>
    </div>
  )
}

export function CustomPatternModal({ open, initial, onClose, onSave, availableMatches, availableLeaguesRich, availableTeamsRich, fixtures, statsMap, eventsMap, isFavoriteTeam, isAdvanced = false, commandAlerts = [] }: CustomPatternModalProps) {
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
  const [showDryRun, setShowDryRun] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<ReturnType<typeof runPatternDryRun> | null>(null)
  const [dryRunErrors, setDryRunErrors] = useState<string[]>([])

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
    setShowDryRun(false)
    setDryRunResults(null)
    setDryRunErrors([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const { leagueLookup, teamLookup, matchLookup } = useScopeLookups(availableLeaguesRich, availableTeamsRich, availableMatches)

  // ─── Derived (pure, safe to compute every render) ──────────────────────────
  const hasName = name.trim().length > 0
  const hasConditions = conditions.length > 0
  const canSave = hasName && hasConditions
  const canActivate = canSave // Composer shows the full preview at all times; no forced step walk.

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

  const savePaused = () => { if (canSave) { onSave(buildData('paused')); onClose() } }
  const createActivate = () => { if (canActivate) { onSave(buildData('active')); onClose() } }

  const isDirty = (): boolean => {
    if (!initial) {
      return name.trim() !== '' || desc.trim() !== '' || conditions.length !== 1 || conditions[0]?.type !== 'is_live'
        || scope !== 'all' || action !== 'register_alert' || minConf !== 50 || severity !== 'attention'
    }
    return name.trim() !== (initial.name || '')
      || desc.trim() !== (initial.description || '')
      || JSON.stringify(conditions) !== JSON.stringify(initial.conditions || [])
      || severity !== initial.severity || scope !== initial.scope || action !== initial.action
      || minConf !== (initial.minConfidence ?? 50)
  }
  const requestClose = () => {
    if (isDirty() && !window.confirm('Descartar as alterações deste radar?')) return
    onClose()
  }

  const handleDryRun = () => {
    const draft = buildData('active')
    const validation = validateDryRunPattern(draft)
    if (!validation.valid) { setDryRunErrors(validation.errors); return }
    setDryRunErrors([])
    const results = runPatternDryRun({ pattern: draft, fixtures, statsMap, eventsMap, isFavoriteTeam, commandAlerts })
    setDryRunResults(results)
    setShowDryRun(true)
  }

  const handleAdvancedToggle = (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => {
    if (key === 'requireRichData') setRequireRichData(v)
    if (key === 'onlyLive') { setOnlyLive(v); if (v) setOnlyPreMatch(false) }
    if (key === 'onlyPreMatch') { setOnlyPreMatch(v); if (v) setOnlyLive(false) }
  }

  // ─── Keyboard shortcuts (before early-return to respect Rules of Hooks) ─────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); savePaused() }
      else if (mod && e.key === 'Enter') { e.preventDefault(); createActivate() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canSave, canActivate, name, desc, severity, scope, scopeFilter, matchesFilter, excludeLeagues, excludeTeams, excludeMatches, requireRichData, onlyLive, onlyPreMatch, minConf, action, conditions])

  if (!open) return null

  // ─── Nav model ─────────────────────────────────────────────────────────────
  const sevLabel = severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Informação'
  const scopeCount = scope === 'specific_leagues' || scope === 'specific_teams' ? scopeFilter.length : scope === 'specific_matches' ? matchesFilter.length : 0
  const scopeLabel = scope === 'favorites_only' ? 'Favoritos'
    : scope === 'specific_leagues' ? `${scopeCount} liga${scopeCount === 1 ? '' : 's'}`
    : scope === 'specific_teams' ? `${scopeCount} time${scopeCount === 1 ? '' : 's'}`
    : scope === 'specific_matches' ? `${scopeCount} partida${scopeCount === 1 ? '' : 's'}`
    : 'Todos os jogos'
  const actionLabel = action === 'register_alert' ? 'Registrar alerta' : action === 'suggest_only' ? 'Apenas sugerir' : 'Destacar no Scanner'

  const navItems: ComposerNavItem<CustomStep>[] = [
    { key: 'identity', label: 'Identidade', summary: name.trim() ? `${name.trim()} · ${sevLabel}` : 'Sem nome', complete: hasName, error: !hasName },
    { key: 'scope', label: 'Escopo', summary: scopeLabel, complete: true },
    { key: 'conditions', label: 'Condições', summary: hasConditions ? 'Todas precisam bater' : 'Adicione gatilhos', count: conditions.length, error: !hasConditions },
    { key: 'action', label: 'Ação', summary: actionLabel, complete: true },
    { key: 'confidence', label: 'Rigor', summary: `≥ ${minConf}%`, complete: true },
    { key: 'review', label: 'Revisão', summary: canSave ? 'Pronto para salvar' : 'Pendências', complete: canSave, error: !canSave },
  ]

  const statusDraft = initial ? (initial.status === 'active' ? 'Editando radar ativo' : 'Editando radar pausado') : (canSave ? 'Pronto para salvar' : 'Rascunho · não salvo')

  return (
    <ModalShell
      open={open}
      onClose={requestClose}
      title={initial ? 'Editar radar' : 'Criar radar'}
      subtitle="Configure um sinal para monitoramento em tempo real."
      maxWidth="max-w-[1180px]"
      headerExtra={
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`h-1.5 w-1.5 rounded-full ${initial ? (initial.status === 'active' ? 'bg-emerald-400/85' : 'bg-white/40') : (canSave ? 'bg-emerald-400/85' : 'bg-cyan-300/70')}`} />
          <span className="text-white/55">{statusDraft}</span>
        </div>
      }
      footer={
        <>
          <button onClick={requestClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          <button onClick={handleDryRun} disabled={!hasConditions} title={!hasConditions ? 'Adicione ao menos uma condição para testar' : 'Testar nos jogos ao vivo sem registrar alertas'} type="button" className="px-3.5 py-2.5 rounded-xl text-[11px] font-medium text-cyan-300/80 border border-cyan-400/15 bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08] hover:border-cyan-400/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Testar ao vivo</button>
          <button onClick={savePaused} disabled={!canSave} title={!canSave ? 'Dê um nome e adicione ao menos uma condição' : 'Cmd/Ctrl+S'} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar pausado</button>
          <button onClick={createActivate} disabled={!canActivate} title={!canActivate ? 'Dê um nome e adicione ao menos uma condição' : 'Cmd/Ctrl+Enter'} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-white/[0.95] hover:bg-white border border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200" style={{ color: '#0b0d12' }}>{initial ? 'Salvar e ativar' : 'Criar e ativar'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)_300px] gap-5 lg:h-[min(70vh,600px)]">
        {/* Left: compact nav */}
        <div className="lg:overflow-y-auto sidebar-scroll lg:pr-0.5">
          <ComposerNav items={navItems} current={step} onSelect={setStep} />
        </div>

        {/* Center: modular canvas */}
        <div className="lg:overflow-y-auto sidebar-scroll min-w-0 lg:pr-1">
          <div className="animate-fadeIn" key={step}>
            {step === 'identity' && (
              <>
                <SectionHeader title="Identidade" description="Escolha um nome claro e a severidade do sinal." />
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Nome do radar</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Pressão final com placar curto" autoFocus className={`w-full h-12 rounded-xl border bg-white/[0.018] px-4 text-[15px] font-medium text-white/95 placeholder:text-white/25 placeholder:font-normal outline-none transition-colors duration-200 ${name.trim() ? 'border-white/[0.08] focus:border-white/30 focus:bg-white/[0.03]' : 'border-amber-300/20 focus:border-amber-300/40'}`} />
                    {!hasName && <p className="text-[11px] text-amber-300/75 mt-2">O nome é obrigatório.</p>}
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Descrição <span className="text-white/25 normal-case tracking-normal font-normal">· opcional</span></label>
                    <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Quando este radar é útil?" className="w-full h-11 rounded-xl border border-white/[0.07] bg-white/[0.018] px-4 text-[13px] text-white/90 placeholder:text-white/25 outline-none transition-colors duration-200 focus:border-white/30 focus:bg-white/[0.03]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Severidade</label>
                    <SeverityPicker value={severity} onChange={setSeverity} />
                  </div>
                </div>
              </>
            )}
            {step === 'scope' && (
              <>
                <SectionHeader title="Escopo" description="Onde este radar pode disparar." />
                <ScopePicker
                  scope={scope} scopeFilter={scopeFilter} matches={matchesFilter}
                  excludeLeagues={excludeLeagues} excludeTeams={excludeTeams} excludeMatches={excludeMatches}
                  requireRichData={requireRichData} onlyLive={onlyLive} onlyPreMatch={onlyPreMatch}
                  availableMatches={availableMatches} availableLeaguesRich={availableLeaguesRich} availableTeamsRich={availableTeamsRich}
                  onScopeChange={setScope} onScopeFilterChange={setScopeFilter} onMatchesChange={setMatchesFilter}
                  onExcludeLeaguesChange={setExcludeLeagues} onExcludeTeamsChange={setExcludeTeams} onExcludeMatchesChange={setExcludeMatches}
                  onAdvancedToggle={handleAdvancedToggle}
                />
              </>
            )}
            {step === 'conditions' && (
              <>
                <SectionHeader title="Condições" description="Combine gatilhos. Todas precisam ser verdadeiras para o radar bater." />
                <TriggerComposer conditions={conditions} onChange={setConditions} />
              </>
            )}
            {step === 'action' && (
              <>
                <SectionHeader title="Ação" description="O que fazer quando todas as condições baterem." />
                <ActionCardPicker value={action} onChange={setAction} />
              </>
            )}
            {step === 'confidence' && (
              <>
                <SectionHeader title="Rigor do radar" description="Quanto maior, menos alertas falsos. 50% é recomendado para começar." />
                <ConfidenceSlider value={minConf} onChange={setMinConf} action={action} />
              </>
            )}
            {step === 'review' && (
              <>
                <SectionHeader title="Contrato do radar" description="Confira exatamente o que este radar fará antes de salvar." />
                <RadarPreview name={name.trim()} severity={severity} scope={scope} scopeFilter={scopeFilter} matches={matchesFilter} excludeLeagues={excludeLeagues} excludeTeams={excludeTeams} excludeMatches={excludeMatches} requireRichData={requireRichData} onlyLive={onlyLive} onlyPreMatch={onlyPreMatch} action={action} minConf={minConf} conditions={conditions} />
                <p className="text-[11px] text-white/45 leading-snug mt-4">Após salvar, este radar aparecerá em &ldquo;Radares configurados&rdquo;. Use &ldquo;Criar e ativar&rdquo; para começar a monitorar imediatamente.</p>
              </>
            )}
          </div>
        </div>

        {/* Right: intelligent preview */}
        <aside className="hidden lg:block lg:overflow-y-auto sidebar-scroll">
          <RadarInspectorPanel
            heading="Preview do radar"
            name={name.trim()}
            status={initial ? (initial.status === 'active' ? 'active' : 'paused') : 'draft'}
            severity={severity} scope={scope} scopeFilter={scopeFilter} matches={matchesFilter}
            action={action} minConf={minConf} conditions={conditions}
            requireRichData={requireRichData} onlyLive={onlyLive} onlyPreMatch={onlyPreMatch}
            excludeLeagues={excludeLeagues} excludeTeams={excludeTeams} excludeMatches={excludeMatches}
            leagueLookup={leagueLookup} teamLookup={teamLookup} matchLookup={matchLookup}
            canSave={canSave}
          />
        </aside>
      </div>

      {/* Dry-run validation errors */}
      {dryRunErrors.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-4 py-3">
          <p className="text-[11px] text-amber-200 font-medium mb-1">Não é possível testar:</p>
          <ul className="space-y-0.5">{dryRunErrors.map((e, i) => <li key={i} className="text-[11px] text-amber-200/70">· {e}</li>)}</ul>
        </div>
      )}
      {/* Dry-run results */}
      {showDryRun && dryRunResults && (
        <PatternDryRunPanel results={dryRunResults} onClose={() => setShowDryRun(false)} isAdvanced={isAdvanced} />
      )}
    </ModalShell>
  )
}
