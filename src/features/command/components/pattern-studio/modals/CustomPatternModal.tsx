/**
 * CustomPatternModal — Radar Blueprint 3.0 (logic-first native composer)
 * ─────────────────────────────────────────────────────────────────────────────
 * The user designs an OPERATIONAL RULE the engine will execute — not a form.
 * All CTA decisions derive from `getRadarReadiness` (single source of truth):
 *   - "Partida ao vivo" alone is eligibility, never a signal → cannot activate.
 *   - Defaults (scope/action/rigor) are not confirmations → surfaced as warnings.
 *   - A condition the backend worker cannot evaluate blocks activation.
 *   - Activation only after the executable contract is reviewed.
 *
 * FUNCTIONAL CONTRACT PRESERVED VERBATIM:
 *   - `CustomPatternModalProps` unchanged (PatternsView keeps working).
 *   - `buildData()` emits the same `Omit<Pattern,'id'|'createdAt'|'updatedAt'>`.
 *     `Pattern.status` has no `draft`, so "Salvar rascunho" persists as `paused`
 *     (same payload as "Salvar pausado"; only the gate/label differ).
 *   - Validations preserved/strengthened. Dry-run ("Validar no motor") is
 *     client-side only, never persists, never creates an alert.
 *   - `useScopeLookups` runs before any early-return (Rules of Hooks).
 */
import { useEffect, useState } from 'react'
import type { Pattern, PatternCondition, FixtureStatsForPattern } from '../../../types/commandTypes'
import type { LiveFixture } from '@/lib/apiClient'
import type { CommandTimedEvent } from '../../../intelligence/commandTimedEvents'
import type { CommandCenterAlert } from '@/context/AlertsContext'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { runPatternDryRun, validateDryRunPattern } from '../../../intelligence/patternDryRunEngine'
import { useScopeLookups } from '../../../utils/patternStudioHelpers'
import { getRadarReadiness, compileRadarContract, type RadarDraftInput } from '../../../intelligence/radarReadiness'
import { diagnoseBackendRadar, isBackendEnabled } from '@/services/commandBackendClient'
import { ModalShell } from '../shell/ModalShell'
import { BlueprintNav, type BlueprintNavItem, type SectionMaturity } from '../shell/BlueprintNav'
import { BlueprintSummary } from '../preview/BlueprintSummary'
import { ScopePicker } from '../scope/ScopePicker'
import { TriggerComposer } from '../triggers/TriggerComposer'
import { SeverityPicker } from '../form-controls/SeverityPicker'
import { ActionCardPicker } from '../form-controls/ActionCardPicker'
import { ConfidenceSlider } from '../form-controls/ConfidenceSlider'
import { EngineReadinessPanel } from '../inspector/EngineReadinessPanel'
import { RadarContractView } from '../preview/RadarContractView'
import { EngineDiagnosticPanel, type BackendDiagnostic } from '../dryrun/EngineDiagnosticPanel'
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
  fixtures: LiveFixture[]
  statsMap: Map<number, FixtureStatsForPattern>
  eventsMap: Map<number, CommandTimedEvent[]>
  isFavoriteTeam: (name: string) => boolean
  isAdvanced?: boolean
  commandAlerts?: CommandCenterAlert[]
}

const ACTION_LABEL = { register_alert: 'Registrar alerta', suggest_only: 'Apenas sugerir', highlight: 'Destacar no Scanner' } as const

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h4 className="text-[15px] font-semibold text-white/95 tracking-tight leading-tight">{title}</h4>
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
  // Confirmation flags — defaults are NOT confirmations.
  const [reviewed, setReviewed] = useState<boolean>(!!initial)
  const [scopeTouched, setScopeTouched] = useState<boolean>(!!initial)
  const [actionTouched, setActionTouched] = useState<boolean>(!!initial)
  const [confidenceTouched, setConfidenceTouched] = useState<boolean>(!!initial)
  const [severityTouched, setSeverityTouched] = useState<boolean>(!!initial)
  const [showDryRun, setShowDryRun] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<ReturnType<typeof runPatternDryRun> | null>(null)
  const [dryRunErrors, setDryRunErrors] = useState<string[]>([])
  const [backendDiag, setBackendDiag] = useState<BackendDiagnostic | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)

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
    setReviewed(!!initial)
    setScopeTouched(!!initial)
    setActionTouched(!!initial)
    setConfidenceTouched(!!initial)
    setSeverityTouched(!!initial)
    setShowDryRun(false)
    setDryRunResults(null)
    setDryRunErrors([])
    setBackendDiag(null)
    setDiagLoading(false)
    setDiagError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const { leagueLookup, teamLookup, matchLookup } = useScopeLookups(availableLeaguesRich, availableTeamsRich, availableMatches)

  // ─── Payload (verbatim contract) ───────────────────────────────────────────
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

  // ─── Readiness (single source of truth) ────────────────────────────────────
  const draftInput: RadarDraftInput = {
    name, conditions, scope, scopeFilter, matches: matchesFilter, action,
    minConfidence: minConf, severity, requireRichData, onlyLive, onlyPreMatch,
  }
  const readiness = getRadarReadiness(draftInput, { reviewed, scopeTouched, actionTouched, confidenceTouched, severityTouched })
  const contract = compileRadarContract(draftInput)
  const actionLabel = ACTION_LABEL[action]

  const saveDraft = () => { if (readiness.canSaveDraft) { onSave(buildData('paused')); onClose() } }
  const savePaused = () => { if (readiness.canSavePaused) { onSave(buildData('paused')); onClose() } }
  const activate = () => { if (readiness.canActivate) { onSave(buildData('active')); onClose() } }

  const goStep = (s: CustomStep) => { setStep(s); if (s === 'review') setReviewed(true) }

  const isDirty = (): boolean => {
    if (!initial) {
      return name.trim() !== '' || desc.trim() !== '' || conditions.length !== 1 || conditions[0]?.type !== 'is_live'
        || scope !== 'all' || action !== 'register_alert' || minConf !== 50 || severity !== 'attention'
    }
    return name.trim() !== (initial.name || '') || desc.trim() !== (initial.description || '')
      || JSON.stringify(conditions) !== JSON.stringify(initial.conditions || [])
      || severity !== initial.severity || scope !== initial.scope || action !== initial.action
      || minConf !== (initial.minConfidence ?? 50)
  }
  const requestClose = () => { if (isDirty() && !window.confirm('Descartar as alterações deste radar?')) return; onClose() }

  const handleEngineDiagnostic = async () => {
    const draft = buildData('active')
    const validation = validateDryRunPattern(draft)
    if (!validation.valid) { setDryRunErrors(validation.errors); return }
    setDryRunErrors([])
    setBackendDiag(null)
    setShowDryRun(false)
    setDiagError(null)

    // Prefer the REAL backend diagnostic (read-only) when a backend is configured.
    if (isBackendEnabled()) {
      setDiagLoading(true)
      try {
        const res = await diagnoseBackendRadar({
          conditions: conditions.map(c => ({ type: c.type, params: c.params as Record<string, unknown> })),
          minConfidence: minConf,
          severity,
          requireRichData,
        })
        setDiagLoading(false)
        if (res) { setBackendDiag(res as BackendDiagnostic); return }
        setDiagError('Backend indisponível — exibindo diagnóstico local')
      } catch {
        setDiagLoading(false)
        setDiagError('Backend indisponível — exibindo diagnóstico local')
      }
    }
    // Fallback: client-side diagnostic (clearly labeled as local).
    setDryRunResults(runPatternDryRun({ pattern: draft, fixtures, statsMap, eventsMap, isFavoriteTeam, commandAlerts }))
    setShowDryRun(true)
  }

  const handleAdvancedToggle = (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => {
    if (key === 'requireRichData') setRequireRichData(v)
    if (key === 'onlyLive') { setOnlyLive(v); if (v) setOnlyPreMatch(false) }
    if (key === 'onlyPreMatch') { setOnlyPreMatch(v); if (v) setOnlyLive(false) }
  }

  // ─── Keyboard (before early-return: Rules of Hooks) ─────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (readiness.canSavePaused) savePaused(); else if (readiness.canSaveDraft) saveDraft() }
      else if (mod && e.key === 'Enter') { e.preventDefault(); if (readiness.canActivate) activate() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, readiness.canSavePaused, readiness.canSaveDraft, readiness.canActivate, name, desc, severity, scope, scopeFilter, matchesFilter, excludeLeagues, excludeTeams, excludeMatches, requireRichData, onlyLive, onlyPreMatch, minConf, action, conditions, reviewed])

  if (!open) return null

  // ─── Maturity map ──────────────────────────────────────────────────────────
  const scopeOk = scope === 'specific_matches' ? matchesFilter.length > 0 : (scope === 'specific_leagues' || scope === 'specific_teams') ? scopeFilter.length > 0 : true
  const identityMaturity: SectionMaturity = name.trim() ? 'definido' : 'incompleto'
  const scopeMaturity: SectionMaturity = !scopeOk ? 'invalido' : scopeTouched ? 'definido' : scope === 'all' ? 'padrao' : 'definido'
  const eligMaturity: SectionMaturity = readiness.counts.eligibility > 0 ? 'definido' : 'padrao'
  const signalMaturity: SectionMaturity = !readiness.backendCompatibility.compatible ? 'bloqueado' : readiness.counts.signal > 0 ? 'definido' : 'incompleto'
  const actionMaturity: SectionMaturity = actionTouched ? 'definido' : 'padrao'
  const rigorMaturity: SectionMaturity = confidenceTouched ? 'definido' : 'padrao'
  const reviewMaturity: SectionMaturity = readiness.canActivate ? 'pronto' : readiness.status === 'blocked' ? 'bloqueado' : readiness.canSavePaused ? 'definido' : 'incompleto'

  const navItems: BlueprintNavItem<CustomStep>[] = [
    { key: 'identity', step: 'identity', label: 'Identidade', maturity: identityMaturity, summary: name.trim() || 'sem nome' },
    { key: 'scope', step: 'scope', label: 'Escopo', maturity: scopeMaturity, summary: contract.scopeLabel },
    { key: 'eligibility', step: 'conditions', label: 'Elegibilidade', maturity: eligMaturity, count: readiness.counts.eligibility },
    { key: 'signal', step: 'conditions', label: 'Sinal', maturity: signalMaturity, count: readiness.counts.signal },
    { key: 'action', step: 'action', label: 'Ação', maturity: actionMaturity, summary: actionLabel },
    { key: 'confidence', step: 'confidence', label: 'Rigor', maturity: rigorMaturity, summary: `≥ ${minConf}%` },
    { key: 'review', step: 'review', label: 'Revisão', maturity: reviewMaturity },
  ]

  const statusDot = readiness.status === 'blocked' ? 'bg-rose-400/85' : readiness.canActivate ? 'bg-emerald-400/85' : readiness.canSavePaused ? 'bg-cyan-300/80' : 'bg-amber-400/75'

  return (
    <ModalShell
      open={open}
      onClose={requestClose}
      title={initial ? 'Editar radar' : 'Criar radar'}
      subtitle="Desenhe uma regra operacional para o motor do GoalSense executar."
      maxWidth="max-w-[1180px]"
      headerExtra={
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          <span className="text-white/55">{readiness.maturityLabel} · {readiness.primaryMessage}</span>
        </div>
      }
      footer={
        <>
          <button onClick={requestClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          <button onClick={handleEngineDiagnostic} disabled={!readiness.canRunEngineDiagnostic || diagLoading} title={!readiness.canRunEngineDiagnostic ? 'Complete a regra antes de validar' : 'Diagnóstico read-only — não cria alerta, não salva'} type="button" className="px-3.5 py-2.5 rounded-xl text-[11px] font-medium text-cyan-300/80 border border-cyan-400/15 bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08] hover:border-cyan-400/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all">{diagLoading ? 'Validando…' : 'Validar no motor'}</button>
          {readiness.canSavePaused
            ? <button onClick={savePaused} title="Cmd/Ctrl+S" type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-all">Salvar pausado</button>
            : <button onClick={saveDraft} disabled={!readiness.canSaveDraft} title={!readiness.canSaveDraft ? 'Dê um nome ao radar' : 'Salva como rascunho (pausado)'} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar rascunho</button>}
          {readiness.canActivate
            ? <button onClick={activate} title="Cmd/Ctrl+Enter" type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-white/[0.95] hover:bg-white border border-white/30 transition-colors duration-200" style={{ color: '#0b0d12' }}>{initial ? 'Salvar e ativar' : 'Ativar radar'}</button>
            : <button onClick={() => goStep('review')} disabled={!readiness.canSavePaused} title={!readiness.canSavePaused ? readiness.primaryMessage : 'Revise o contrato antes de ativar'} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] border border-white/[0.18] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200">Revisar radar</button>}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)_300px] gap-5 lg:h-[min(70vh,600px)]">
        {/* Left: maturity map */}
        <div className="lg:overflow-y-auto sidebar-scroll lg:pr-0.5">
          <BlueprintNav items={navItems} currentStep={step} onSelect={goStep} />
        </div>

        {/* Center: blueprint + active editor */}
        <div className="lg:overflow-y-auto sidebar-scroll min-w-0 lg:pr-1">
          <BlueprintSummary
            name={name.trim()} scopeLabel={contract.scopeLabel}
            eligibility={contract.eligibilityConditions} signal={contract.signalConditions}
            actionLabel={actionLabel} confidence={minConf} currentStep={step} onNavigate={goStep}
          />
          <div className="animate-fadeIn" key={step}>
            {step === 'identity' && (
              <>
                <SectionHeader title="Identidade" description="Nome claro e severidade do sinal." />
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Nome do radar</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Pressão final com placar curto" autoFocus aria-invalid={!name.trim()} className={`w-full h-12 rounded-xl border bg-white/[0.018] px-4 text-[15px] font-medium text-white/95 placeholder:text-white/25 placeholder:font-normal outline-none transition-colors duration-200 ${name.trim() ? 'border-white/[0.08] focus:border-white/30 focus:bg-white/[0.03]' : 'border-amber-300/20 focus:border-amber-300/40'}`} />
                    {!name.trim() && <p className="text-[11px] text-amber-300/75 mt-2">O nome é obrigatório.</p>}
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Descrição <span className="text-white/25 normal-case tracking-normal font-normal">· opcional</span></label>
                    <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Quando este radar é útil?" className="w-full h-11 rounded-xl border border-white/[0.07] bg-white/[0.018] px-4 text-[13px] text-white/90 placeholder:text-white/25 outline-none transition-colors duration-200 focus:border-white/30 focus:bg-white/[0.03]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Severidade</label>
                    <SeverityPicker value={severity} onChange={v => { setSeverity(v); setSeverityTouched(true) }} />
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
                  onScopeChange={s => { setScope(s); setScopeTouched(true) }} onScopeFilterChange={setScopeFilter} onMatchesChange={setMatchesFilter}
                  onExcludeLeaguesChange={setExcludeLeagues} onExcludeTeamsChange={setExcludeTeams} onExcludeMatchesChange={setExcludeMatches}
                  onAdvancedToggle={handleAdvancedToggle}
                />
              </>
            )}
            {step === 'conditions' && (
              <>
                <SectionHeader title="Condições" description="Filtros definem QUANDO avaliar; sinais definem O QUE dispara. É preciso ao menos 1 sinal real." />
                <TriggerComposer conditions={conditions} onChange={setConditions} />
              </>
            )}
            {step === 'action' && (
              <>
                <SectionHeader title="Ação" description="O que fazer quando todas as condições baterem." />
                <ActionCardPicker value={action} onChange={a => { setAction(a); setActionTouched(true) }} />
              </>
            )}
            {step === 'confidence' && (
              <>
                <SectionHeader title="Rigor do radar" description="Quanto maior, menos alertas falsos. 50% é recomendado para começar." />
                <ConfidenceSlider value={minConf} onChange={v => { setMinConf(v); setConfidenceTouched(true) }} action={action} />
              </>
            )}
            {step === 'review' && (
              <>
                <SectionHeader title="Contrato do radar" description="Exatamente o que o motor fará. Ativação só após esta revisão." />
                <RadarContractView name={name.trim()} contract={contract} actionLabel={actionLabel} />
              </>
            )}
          </div>
        </div>

        {/* Right: engine readiness */}
        <aside className="hidden lg:block lg:overflow-y-auto sidebar-scroll">
          <EngineReadinessPanel readiness={readiness} contract={contract} actionLabel={actionLabel} lastDiagnostic={backendDiag} />
        </aside>
      </div>

      {dryRunErrors.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-4 py-3">
          <p className="text-[11px] text-amber-200 font-medium mb-1">Não é possível validar:</p>
          <ul className="space-y-0.5">{dryRunErrors.map((e, i) => <li key={i} className="text-[11px] text-amber-200/70">· {e}</li>)}</ul>
        </div>
      )}
      {diagError && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-4 py-3 text-[11px] text-amber-200/80">{diagError}</div>}
      {backendDiag && <EngineDiagnosticPanel result={backendDiag} source="backend" onClose={() => setBackendDiag(null)} />}
      {showDryRun && dryRunResults && (
        <PatternDryRunPanel results={dryRunResults} onClose={() => setShowDryRun(false)} isAdvanced={isAdvanced} />
      )}
    </ModalShell>
  )
}
