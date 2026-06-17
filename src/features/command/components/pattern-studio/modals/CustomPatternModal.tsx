/**
 * CustomPatternModal — Radar Blueprint 3.2 (Native Rule Canvas)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layout reconstruction over the 3.1 logic. Two areas: a central Native Rule
 * Canvas (the radar composed as an editable operational sentence) and a refined
 * Engine Panel (can the engine execute this?). No fixed lateral stepper.
 *
 * ALL 3.1 LOGIC PRESERVED: getRadarReadiness, compileRadarContract, capability
 * matrix, the read-only diagnostic endpoint, payload (buildData) and props.
 *
 * Keyboard: Esc closes (confirm if dirty) · Cmd/Ctrl+S saves · Cmd/Ctrl+Enter
 * activates when allowed.
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
import { RadarContractView } from '../preview/RadarContractView'
import { EngineDiagnosticPanel, type BackendDiagnostic } from '../dryrun/EngineDiagnosticPanel'
import { PatternDryRunPanel } from '../dryrun/PatternDryRunPanel'

const ACTION_LABEL = { register_alert: 'Registrar alerta', suggest_only: 'Apenas sugerir', highlight: 'Destacar no Scanner' } as const

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
  const [mode, setMode] = useState<'compose' | 'review'>('compose')
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
    setMode('compose')
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

  const savePaused = () => { if (readiness.canSavePaused) { onSave(buildData('paused')); onClose() } }
  const activate = () => { if (readiness.canActivate) { onSave(buildData('active')); onClose() } }
  const goReview = () => { if (readiness.canSavePaused) { setReviewed(true); setMode('review') } }

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
  }, [open, readiness.canSavePaused, readiness.canSaveDraft, readiness.canActivate, name, severity, scope, scopeFilter, matchesFilter, requireRichData, onlyLive, onlyPreMatch, minConf, action, conditions, reviewed])

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
          {mode === 'review'
            ? <>
                <button onClick={() => setMode('compose')} type="button" className="px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-white/85 bg-white/[0.08] hover:bg-white/[0.12] transition-all">Editar regra</button>
                <button onClick={activate} disabled={!readiness.canActivate} title={!readiness.canActivate ? readiness.primaryMessage : 'Cmd/Ctrl+Enter'} type="button" className="px-6 py-2.5 rounded-[10px] text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_6px_18px_-8px_rgba(19,184,166,0.8)]">{initial ? 'Salvar e ativar' : 'Ativar radar'}</button>
              </>
            : <button onClick={goReview} disabled={!readiness.canSavePaused} title={!readiness.canSavePaused ? readiness.primaryMessage : 'Revise o contrato antes de ativar'} type="button" className="px-6 py-2.5 rounded-[10px] text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_6px_18px_-8px_rgba(19,184,166,0.8)]">Revisar radar</button>}
        </>
      }
    >
      {mode === 'review'
        ? (
          <div className="h-full overflow-y-auto sidebar-scroll px-6 sm:px-8 py-7">
            <div className="max-w-[760px] mx-auto">
              <RadarContractView name={name.trim()} contract={contract} actionLabel={actionLabel} />
              <div className="mt-4 flex items-center justify-end">
                <button onClick={handleEngineDiagnostic} disabled={diagLoading} type="button" className="text-[12.5px] font-medium text-[#2DD4BF] hover:text-[#5CE6D4] disabled:opacity-40 transition-colors">{diagLoading ? 'Verificando…' : 'Verificar com partidas atuais →'}</button>
              </div>
              {dryRunErrors.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-4 py-3">
                  <p className="text-[11px] text-amber-200 font-medium mb-1">Não é possível validar:</p>
                  <ul className="space-y-0.5">{dryRunErrors.map((e, i) => <li key={i} className="text-[11px] text-amber-200/70">· {e}</li>)}</ul>
                </div>
              )}
              {diagError && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-4 py-3 text-[11px] text-amber-200/80">{diagError}</div>}
              {backendDiag && <EngineDiagnosticPanel result={backendDiag} source="backend" onClose={() => setBackendDiag(null)} scopeNote={scope !== 'all' && scope !== 'favorites_only' ? 'Diagnóstico avalia os jogos ao vivo disponíveis; o filtro de escopo específico é aplicado pelo motor no runtime.' : undefined} />}
              {showDryRun && dryRunResults && <PatternDryRunPanel results={dryRunResults} onClose={() => setShowDryRun(false)} isAdvanced={isAdvanced} />}
            </div>
          </div>
        )
        : (
          <NativeRuleCanvas
            name={name} onName={setName}
            desc={desc} onDesc={setDesc}
            severity={severity} onSeverity={setSeverity}
            scope={scope} scopeFilter={scopeFilter} matchesFilter={matchesFilter}
            excludeLeagues={excludeLeagues} excludeTeams={excludeTeams} excludeMatches={excludeMatches}
            requireRichData={requireRichData} onlyLive={onlyLive} onlyPreMatch={onlyPreMatch}
            availableMatches={availableMatches} availableLeaguesRich={availableLeaguesRich} availableTeamsRich={availableTeamsRich}
            onScope={s => { setScope(s); setScopeTouched(true) }} onScopeFilter={setScopeFilter} onMatches={setMatchesFilter}
            onExcludeLeagues={setExcludeLeagues} onExcludeTeams={setExcludeTeams} onExcludeMatches={setExcludeMatches}
            onAdvancedToggle={handleAdvancedToggle}
            conditions={conditions} onConditions={setConditions}
            action={action} onAction={a => { setAction(a); setActionTouched(true) }}
            minConf={minConf} onMinConf={n => { setMinConf(n); setConfidenceTouched(true) }}
            contract={contract}
            readiness={readiness}
          />
        )}
    </RuleStudioShell>
  )
}
