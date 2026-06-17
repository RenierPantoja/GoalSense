/**
 * CustomPatternModal — Radar Blueprint 3.6 (two-zone premium modal)
 * ─────────────────────────────────────────────────────────────────────────────
 * Wide modal that uses the horizontal space intentionally:
 *   LEFT  — the rule composer (NativeRuleCanvas)
 *   RIGHT — a live, plain-language contract preview (LiveContractPreview) with
 *           readiness, dependencies, compatibility and a secondary diagnostic.
 * Editing happens in dedicated command sheets owned here, so they overlay the
 * full body (both columns).
 *
 * ALL 3.1 LOGIC PRESERVED: getRadarReadiness, compileRadarContract, capability
 * matrix, the read-only diagnostic endpoint, payload (buildData) and props.
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
import { RuleStudioShell } from '../canvas/RuleStudioShell'
import { NativeRuleCanvas } from '../canvas/NativeRuleCanvas'
import { LiveContractPreview } from '../canvas/LiveContractPreview'
import { SheetShell } from '../canvas/SheetShell'
import { ScopeSelectionSheet, type ScopeSelectionValue } from '../scope/ScopeSelectionSheet'
import { ConditionCommandSheet, type ConditionSheetMode } from '../canvas/ConditionCommandSheet'
import { ActionCardPicker } from '../form-controls/ActionCardPicker'
import { ConfidenceSlider } from '../form-controls/ConfidenceSlider'
import { EngineDiagnosticPanel, type BackendDiagnostic } from '../dryrun/EngineDiagnosticPanel'
import { PatternDryRunPanel } from '../dryrun/PatternDryRunPanel'

const ACTION_LABEL = { register_alert: 'Registrar alerta', suggest_only: 'Apenas sugerir', highlight: 'Destacar no Scanner' } as const
const RIGOR_PRESETS = [{ label: 'Sensível', value: 40 }, { label: 'Equilibrado', value: 50 }, { label: 'Rigoroso', value: 70 }]

type RuleSheet =
  | { kind: 'none' }
  | { kind: 'scope' }
  | { kind: 'action' }
  | { kind: 'rigor' }
  | { kind: 'condition'; mode: ConditionSheetMode }

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
  const [sheet, setSheet] = useState<RuleSheet>({ kind: 'none' })
  const [reviewed, setReviewed] = useState<boolean>(!!initial)
  const [scopeTouched, setScopeTouched] = useState<boolean>(!!initial)
  const [actionTouched, setActionTouched] = useState<boolean>(!!initial)
  const [confidenceTouched, setConfidenceTouched] = useState<boolean>(!!initial)
  const [showDryRun, setShowDryRun] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<ReturnType<typeof runPatternDryRun> | null>(null)
  const [dryRunErrors, setDryRunErrors] = useState<string[]>([])
  const [backendDiag, setBackendDiag] = useState<BackendDiagnostic | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name || '')
    setSeverity(initial?.severity || 'attention')
    setDesc(initial?.description || '')
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
    setSheet({ kind: 'none' })
    setReviewed(!!initial)
    setScopeTouched(!!initial)
    setActionTouched(!!initial)
    setConfidenceTouched(!!initial)
    setShowDryRun(false)
    setDryRunResults(null)
    setDryRunErrors([])
    setBackendDiag(null)
    setDiagLoading(false)
    setDiagError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  useScopeLookups(availableLeaguesRich, availableTeamsRich, availableMatches)

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

  const draftInput: RadarDraftInput = { name, conditions, scope, scopeFilter, matches: matchesFilter, action, minConfidence: minConf, severity, requireRichData, onlyLive, onlyPreMatch }
  const readiness = getRadarReadiness(draftInput, { reviewed, scopeTouched, actionTouched, confidenceTouched })
  const contract = compileRadarContract(draftInput)
  const actionLabel = ACTION_LABEL[action]
  const close = () => setSheet({ kind: 'none' })

  const savePaused = () => { if (readiness.canSavePaused) { onSave(buildData('paused')); onClose() } }
  const activate = () => { if (readiness.canActivate) { onSave(buildData('active')); onClose() } }

  const applyScope = (next: ScopeSelectionValue) => {
    setScope(next.scope); setScopeTouched(true)
    setScopeFilter(next.scopeFilter); setMatchesFilter(next.matches)
    setExcludeLeagues(next.excludeLeagues); setExcludeTeams(next.excludeTeams); setExcludeMatches(next.excludeMatches)
    setRequireRichData(next.requireRichData)
    setOnlyLive(next.onlyLive); setOnlyPreMatch(next.onlyPreMatch)
  }

  const isDirty = (): boolean => {
    if (!initial) return name.trim() !== '' || conditions.length !== 1 || conditions[0]?.type !== 'is_live' || scope !== 'all' || action !== 'register_alert' || minConf !== 50 || severity !== 'attention'
    return name.trim() !== (initial.name || '') || JSON.stringify(conditions) !== JSON.stringify(initial.conditions || [])
      || severity !== initial.severity || scope !== initial.scope || action !== initial.action || minConf !== (initial.minConfidence ?? 50)
  }
  const requestClose = () => { if (isDirty() && !window.confirm('Descartar as alterações deste radar?')) return; onClose() }

  const handleEngineDiagnostic = async () => {
    const draft = buildData('active')
    const validation = validateDryRunPattern(draft)
    if (!validation.valid) { setDryRunErrors(validation.errors); return }
    setDryRunErrors([]); setBackendDiag(null); setShowDryRun(false); setDiagError(null)
    if (isBackendEnabled()) {
      setDiagLoading(true)
      try {
        const res = await diagnoseBackendRadar({ conditions: conditions.map(c => ({ type: c.type, params: c.params as Record<string, unknown> })), minConfidence: minConf, severity, requireRichData })
        setDiagLoading(false)
        if (res) { setBackendDiag(res as BackendDiagnostic); return }
        setDiagError('Backend indisponível — exibindo diagnóstico local')
      } catch { setDiagLoading(false); setDiagError('Backend indisponível — exibindo diagnóstico local') }
    }
    setDryRunResults(runPatternDryRun({ pattern: draft, fixtures, statsMap, eventsMap, isFavoriteTeam, commandAlerts }))
    setShowDryRun(true)
  }

  const handleAdvancedToggle = (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => {
    if (key === 'requireRichData') setRequireRichData(v)
    if (key === 'onlyLive') { setOnlyLive(v); if (v) setOnlyPreMatch(false) }
    if (key === 'onlyPreMatch') { setOnlyPreMatch(v); if (v) setOnlyLive(false) }
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (readiness.canSavePaused) savePaused() }
      else if (mod && e.key === 'Enter') { e.preventDefault(); if (readiness.canActivate) activate() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, readiness.canSavePaused, readiness.canActivate, name, severity, scope, scopeFilter, matchesFilter, requireRichData, onlyLive, onlyPreMatch, minConf, action, conditions, reviewed])

  if (!open) return null

  const c = readiness.counts
  const statusTail = readiness.status === 'blocked' ? 'bloqueado para ativar'
    : readiness.canActivate ? 'pronto para ativar'
    : readiness.canSavePaused ? 'pronto para revisão'
    : !name.trim() ? 'sem nome'
    : c.signal === 0 ? 'sem sinal real'
    : 'incompleto'
  const statusLine = `${readiness.maturityLabel} · ${c.eligibility} filtro${c.eligibility === 1 ? '' : 's'} · ${c.signal} sinal${c.signal === 1 ? '' : 's'} real${c.signal === 1 ? '' : 'is'} · ${statusTail}`
  const statusDot = readiness.status === 'blocked' ? 'bg-[#FF5A52]' : readiness.canActivate ? 'bg-[#34D399]' : readiness.canSavePaused ? 'bg-[#2DD4BF]' : 'bg-[#FFB02E]'

  return (
    <RuleStudioShell
      open={open}
      onClose={requestClose}
      title={initial ? 'Editar radar' : 'Criar radar'}
      subtitle="Desenhe uma regra operacional para o motor do GoalSense executar."
      statusNode={
        <div className="inline-flex items-center gap-2 h-7 pl-2.5 pr-3 rounded-full border border-white/[0.08] bg-white/[0.04]">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          <span className="text-[11.5px] text-white/55">{statusLine}</span>
        </div>
      }
      footer={
        <>
          <button onClick={requestClose} type="button" className="px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-white/60 hover:text-white/90 transition-colors mr-auto">Cancelar</button>
          <button onClick={savePaused} disabled={!readiness.canSavePaused} title={!readiness.canSavePaused ? readiness.primaryMessage : 'Cmd/Ctrl+S'} type="button" className="px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-white/85 bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar pausado</button>
          {reviewed
            ? <button onClick={activate} disabled={!readiness.canActivate} title={!readiness.canActivate ? readiness.primaryMessage : 'Cmd/Ctrl+Enter'} type="button" className="px-6 py-2.5 rounded-[10px] text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_6px_18px_-8px_rgba(19,184,166,0.8)]">{initial ? 'Salvar e ativar' : 'Ativar radar'}</button>
            : <button onClick={() => { if (readiness.canSavePaused) setReviewed(true) }} disabled={!readiness.canSavePaused} title={!readiness.canSavePaused ? readiness.primaryMessage : 'Confirme o contrato para ativar'} type="button" className="px-6 py-2.5 rounded-[10px] text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_6px_18px_-8px_rgba(19,184,166,0.8)]">Revisar radar</button>}
        </>
      }
    >
      <div className="relative h-full">
        {/* Two zones */}
        <div className="h-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-w-0 overflow-y-auto sidebar-scroll px-7 sm:px-10 py-8">
            <NativeRuleCanvas
              name={name} onName={setName}
              desc={desc} onDesc={setDesc}
              severity={severity} onSeverity={setSeverity}
              scope={scope}
              conditions={conditions} onConditions={setConditions}
              action={action} minConf={minConf}
              contract={contract}
              onOpenScope={() => setSheet({ kind: 'scope' })}
              onOpenCondition={mode => setSheet({ kind: 'condition', mode })}
              onOpenAction={() => setSheet({ kind: 'action' })}
              onOpenRigor={() => setSheet({ kind: 'rigor' })}
            />
          </div>
          <aside className="hidden lg:block overflow-y-auto sidebar-scroll border-l border-white/[0.07] bg-black/[0.18] px-6 py-8">
            <LiveContractPreview
              name={name} contract={contract} readiness={readiness} actionLabel={actionLabel}
              reviewed={reviewed} canDiagnose={readiness.canRunEngineDiagnostic} diagLoading={diagLoading}
              lastDiagnostic={backendDiag} onDiagnose={handleEngineDiagnostic}
            />
          </aside>
        </div>

        {/* Sheets (overlay the whole body) */}
        {sheet.kind === 'scope' && (
          <ScopeSelectionSheet
            scope={scope} scopeFilter={scopeFilter} matches={matchesFilter}
            excludeLeagues={excludeLeagues} excludeTeams={excludeTeams} excludeMatches={excludeMatches}
            requireRichData={requireRichData} onlyLive={onlyLive} onlyPreMatch={onlyPreMatch}
            availableMatches={availableMatches} availableLeaguesRich={availableLeaguesRich} availableTeamsRich={availableTeamsRich}
            onApply={(v) => { applyScope(v) }} onClose={close}
          />
        )}
        {sheet.kind === 'condition' && (
          <ConditionCommandSheet mode={sheet.mode} conditions={conditions} onChange={setConditions} onClose={close} />
        )}
        {sheet.kind === 'action' && (
          <SheetShell title="Ação ao disparar" subtitle="O que o radar faz quando todas as condições batem" onClose={close}>
            <div className="max-w-[760px] mx-auto"><ActionCardPicker value={action} onChange={a => { setAction(a); setActionTouched(true); close() }} /></div>
          </SheetShell>
        )}
        {sheet.kind === 'rigor' && (
          <SheetShell title="Rigor do radar" subtitle="Quanto maior, menos alertas falsos" onClose={close}>
            <div className="max-w-[640px] mx-auto">
              <div className="flex items-center gap-2 mb-5">
                {RIGOR_PRESETS.map(p => {
                  const on = minConf === p.value
                  return (
                    <button key={p.label} type="button" onClick={() => { setMinConf(p.value); setConfidenceTouched(true) }} className="flex-1 h-16 rounded-[14px] border border-white/[0.08] bg-white/[0.03] text-[14px] font-semibold transition-all" style={on ? { borderColor: '#2DD4BF66', backgroundColor: '#2DD4BF1f', color: '#fff' } : {}}>
                      <span className={on ? '' : 'text-white/55'}>{p.label}</span>
                      <span className={`block text-[12px] font-normal mt-0.5 ${on ? 'text-white/70' : 'text-white/40'}`}>{p.value}%</span>
                    </button>
                  )
                })}
              </div>
              <ConfidenceSlider value={minConf} onChange={n => { setMinConf(n); setConfidenceTouched(true) }} action={action} />
            </div>
          </SheetShell>
        )}

        {/* Diagnostic result (overlay) */}
        {(backendDiag || (showDryRun && dryRunResults) || diagError) && (
          <div className="absolute inset-0 z-20 flex flex-col" style={{ backgroundColor: '#1d1d1f' }}>
            <div className="px-6 sm:px-8 pt-5 pb-4 border-b border-white/[0.07] flex items-center gap-3 shrink-0">
              <h4 className="text-[16px] font-semibold tracking-[-0.01em] text-white/90">Diagnóstico do motor</h4>
              <button onClick={() => { setBackendDiag(null); setShowDryRun(false); setDiagError(null) }} type="button" aria-label="Fechar" className="ml-auto h-8 w-8 rounded-full grid place-items-center text-white/50 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors">×</button>
            </div>
            <div className="flex-1 overflow-y-auto sidebar-scroll px-6 sm:px-8 py-6">
              <div className="max-w-[1000px] mx-auto">
                {dryRunErrors.length > 0 && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-4 py-3 mb-4">
                    <p className="text-[11px] text-amber-200 font-medium mb-1">Não é possível validar:</p>
                    <ul className="space-y-0.5">{dryRunErrors.map((e, i) => <li key={i} className="text-[11px] text-amber-200/70">· {e}</li>)}</ul>
                  </div>
                )}
                {diagError && <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-4 py-3 text-[11px] text-amber-200/80 mb-4">{diagError}</div>}
                {backendDiag && <EngineDiagnosticPanel result={backendDiag} source="backend" onClose={() => setBackendDiag(null)} scopeNote={scope !== 'all' && scope !== 'favorites_only' ? 'Diagnóstico avalia os jogos ao vivo disponíveis; o filtro de escopo específico é aplicado pelo motor no runtime.' : undefined} />}
                {showDryRun && dryRunResults && <PatternDryRunPanel results={dryRunResults} onClose={() => setShowDryRun(false)} isAdvanced={isAdvanced} />}
              </div>
            </div>
          </div>
        )}
      </div>
    </RuleStudioShell>
  )
}
