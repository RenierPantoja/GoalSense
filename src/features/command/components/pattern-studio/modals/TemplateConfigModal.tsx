/**
 * TemplateConfigModal — wizard for configuring or editing a template-based radar
 * ─────────────────────────────────────────────────────────────────────────────
 * Behaviour fully preserved from the inline implementation in
 * CommandCenterPage.tsx (V3.18D). The "Salvar e ativar" button is gated by
 * `canActivate = canSave && allStepsVisited` so the user must walk through
 * every step at least once before activating.
 *
 * Editing an existing radar pre-fills `visitedSteps` with every step so the
 * activate action stays unlocked.
 */
import { useEffect, useState } from 'react'
import type { Pattern, PatternCondition, PatternTemplate, FixtureStatsForPattern } from '../../../types/commandTypes'
import type { LiveFixture } from '@/lib/apiClient'
import type { CommandTimedEvent } from '../../../intelligence/commandTimedEvents'
import type { CommandCenterAlert } from '@/context/AlertsContext'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { CATEGORY_LABELS, categorizeTemplate, formatConditionHuman } from '../../../utils/commandFormatters'
import { runPatternDryRun, validateDryRunPattern } from '../../../intelligence/patternDryRunEngine'
import { useScopeLookups } from '../../../utils/patternStudioHelpers'
import { ModalShell } from '../shell/ModalShell'
import { Section } from '../shell/Section'
import { WizardProgressRail, type WizardStep } from '../shell/WizardProgressRail'
import { WizardStepHeader } from '../shell/WizardStepHeader'
import { ScopePicker } from '../scope/ScopePicker'
import { ConditionsEditor } from '../triggers/ConditionsEditor'
import { SeverityPicker } from '../form-controls/SeverityPicker'
import { ActionCardPicker } from '../form-controls/ActionCardPicker'
import { ConfidenceSlider } from '../form-controls/ConfidenceSlider'
import { RadarInspectorPanel } from '../inspector/RadarInspectorPanel'
import { RadarPreview } from '../preview/RadarPreview'
import { PatternDryRunPanel } from '../dryrun/PatternDryRunPanel'

type TemplateStep = 'overview' | 'conditions' | 'scope_action' | 'confidence' | 'review'

const ALL_TEMPLATE_STEPS: TemplateStep[] = ['overview', 'conditions', 'scope_action', 'confidence', 'review']

export interface TemplateConfigModalProps {
  open: boolean
  template: PatternTemplate | null
  existingPattern: Pattern | null
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

export function TemplateConfigModal({ open, template, existingPattern, onClose, onSave, availableMatches, availableLeaguesRich, availableTeamsRich, fixtures, statsMap, eventsMap, isFavoriteTeam, isAdvanced = false, commandAlerts = [] }: TemplateConfigModalProps) {
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
  const [visitedSteps, setVisitedSteps] = useState<Set<TemplateStep>>(
    () => existingPattern ? new Set(ALL_TEMPLATE_STEPS) : new Set<TemplateStep>(['overview'])
  )

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
    setVisitedSteps(existingPattern ? new Set(ALL_TEMPLATE_STEPS) : new Set<TemplateStep>(['overview']))
    // V13: Reset dry-run state on modal reopen
    setShowDryRun(false)
    setDryRunResults(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, existingPattern?.id])

  const { leagueLookup, teamLookup, matchLookup } = useScopeLookups(availableLeaguesRich, availableTeamsRich, availableMatches)

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

  const [showDryRun, setShowDryRun] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<ReturnType<typeof runPatternDryRun> | null>(null)

  const handleDryRun = () => {
    const draft = buildPatternData('active')
    const validation = validateDryRunPattern(draft)
    if (!validation.valid) return
    const results = runPatternDryRun({
      pattern: draft,
      fixtures,
      statsMap,
      eventsMap,
      isFavoriteTeam,
      commandAlerts,
    })
    setDryRunResults(results)
    setShowDryRun(true)
  }

  const handleAdvancedToggle = (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => {
    if (key === 'requireRichData') setRequireRichData(v)
    if (key === 'onlyLive') { setOnlyLive(v); if (v) setOnlyPreMatch(false) }
    if (key === 'onlyPreMatch') { setOnlyPreMatch(v); if (v) setOnlyLive(false) }
  }

  const steps: WizardStep<TemplateStep>[] = [
    { key: 'overview', label: 'Entenda o radar', valid: true, required: false },
    { key: 'conditions', label: 'Trigger Lab', valid: canSave, required: true },
    { key: 'scope_action', label: 'Escopo e ação', valid: true, required: false },
    { key: 'confidence', label: 'Confiança', valid: true, required: false },
    { key: 'review', label: 'Revisão', valid: canSave, required: false },
  ]
  const stepIndex = steps.findIndex(s => s.key === step)
  const goPrev = () => { if (stepIndex > 0) { const prev = steps[stepIndex - 1].key; setStep(prev); setVisitedSteps(prev2 => { const n = new Set(prev2); n.add(prev); return n }) } }
  const goNext = () => { if (stepIndex < steps.length - 1) { const next = steps[stepIndex + 1].key; setStep(next); setVisitedSteps(prev => { const n = new Set(prev); n.add(next); return n }) } }
  const goTo = (k: TemplateStep) => { setStep(k); setVisitedSteps(prev => { const n = new Set(prev); n.add(k); return n }) }
  const isLast = step === 'review'
  const allStepsVisited = steps.every(s => visitedSteps.has(s.key))
  const canActivate = canSave && allStepsVisited
  const activateLockedHint = !canSave
    ? 'Adicione ao menos uma condição para salvar este radar'
    : !allStepsVisited
      ? 'Visite todos os passos antes de ativar'
      : undefined

  return (
    <ModalShell open={open} onClose={onClose} title={template.name} subtitle={template.description} maxWidth="max-w-[1180px]"
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-white/45">
          <span className={`h-1.5 w-1.5 rounded-full ${existingPattern ? (existingPattern.status === 'active' ? 'bg-emerald-400/85' : 'bg-white/40') : 'bg-cyan-300/70'}`} />
          <span className="text-white/55">{existingPattern ? (existingPattern.status === 'active' ? 'Editando radar ativo' : 'Editando radar pausado') : 'Configurando template'}</span>
          <span className="text-white/20">·</span>
          <span className="text-white/45">{CATEGORY_LABELS[cat]}</span>
        </div>
      }
      footer={
        <>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          {/* V10: Dry-run test button */}
          <button onClick={handleDryRun} disabled={!canSave} title={!canSave ? 'Adicione ao menos uma condição para testar' : 'Testar template nos jogos ao vivo sem registrar alertas'} type="button" className="px-3.5 py-2.5 rounded-xl text-[11px] font-medium text-cyan-300/80 border border-cyan-400/15 bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08] hover:border-cyan-400/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Testar ao vivo</button>
          {stepIndex > 0 && <button onClick={goPrev} type="button" className="px-3.5 py-2.5 rounded-xl text-[12px] font-medium text-white/75 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-all">Voltar</button>}
          {!isLast && (
            <button
              onClick={goNext}
              disabled={!steps[stepIndex]?.valid}
              title={!steps[stepIndex]?.valid ? 'Conclua este passo para avançar' : undefined}
              type="button"
              className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >Próximo</button>
          )}
          {isLast && <button onClick={() => { onSave(buildPatternData('paused')); onClose() }} disabled={!canSave} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar pausado</button>}
          {isLast && <button onClick={() => { onSave(buildPatternData('active')); onClose() }} disabled={!canActivate} title={activateLockedHint} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-white/[0.95] hover:bg-white border border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200" style={{ color: '#0b0d12' }}>Salvar e ativar</button>}
        </>
      }
    >
      {/* Progress rail at top */}
      <div className="mb-7 px-1">
        <WizardProgressRail steps={steps} current={step} onSelect={goTo} />
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
                <WizardStepHeader index={2} total={steps.length} kicker="Trigger Lab" title="Combine sinais reais" description="Todas as condições precisam ser verdadeiras para o radar bater. Use poucos gatilhos bem escolhidos para evitar ruído." />
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
                    availableMatches={availableMatches}
                    availableLeaguesRich={availableLeaguesRich}
                    availableTeamsRich={availableTeamsRich}
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

        {/* Inspector right */}
        <aside className="lg:col-span-4 hidden lg:block">
          <RadarInspectorPanel
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
            excludeLeagues={excludeLeagues}
            excludeTeams={excludeTeams}
            excludeMatches={excludeMatches}
            leagueLookup={leagueLookup}
            teamLookup={teamLookup}
            matchLookup={matchLookup}
            currentStepLabel={steps[stepIndex]?.label}
            totalSteps={steps.length}
            currentStepIndex={stepIndex}
            canSave={canSave}
          />
        </aside>
      </div>
      {/* V10: Dry-run results panel */}
      {showDryRun && dryRunResults && (
        <PatternDryRunPanel results={dryRunResults} onClose={() => setShowDryRun(false)} isAdvanced={isAdvanced} />
      )}
    </ModalShell>
  )
}
