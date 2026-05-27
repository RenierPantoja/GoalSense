/**
 * CustomPatternModal — wizard for creating or editing a custom radar
 * ─────────────────────────────────────────────────────────────────────────────
 * Behaviour fully preserved from the inline implementation in
 * CommandCenterPage.tsx (V3.18D). The "Criar e ativar" / "Salvar e ativar"
 * button is gated by `canActivate = canSave && allStepsVisited` so the user
 * must walk through every step at least once before activating.
 *
 * Editing an existing radar (or a prefilled draft) pre-fills `visitedSteps`
 * with every step so the activate action stays unlocked.
 *
 * `useScopeLookups` is intentionally invoked before any early-return so the
 * Rules of Hooks are respected in every render.
 */
import { useEffect, useState } from 'react'
import type { Pattern, PatternCondition } from '../../../types/commandTypes'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { useScopeLookups } from '../../../utils/patternStudioHelpers'
import { ModalShell } from '../shell/ModalShell'
import { WizardProgressRail } from '../shell/WizardProgressRail'
import { WizardStepHeader } from '../shell/WizardStepHeader'
import { ScopePicker } from '../scope/ScopePicker'
import { ConditionsEditor } from '../triggers/ConditionsEditor'
import { SeverityPicker } from '../form-controls/SeverityPicker'
import { ActionCardPicker } from '../form-controls/ActionCardPicker'
import { ConfidenceSlider } from '../form-controls/ConfidenceSlider'
import { RadarInspectorPanel } from '../inspector/RadarInspectorPanel'
import { RadarPreview } from '../preview/RadarPreview'

type CustomStep = 'identity' | 'scope' | 'conditions' | 'action' | 'confidence' | 'review'

const ALL_CUSTOM_STEPS: CustomStep[] = ['identity', 'scope', 'conditions', 'action', 'confidence', 'review']

export interface CustomPatternModalProps {
  open: boolean
  initial: Pattern | null
  onClose: () => void
  onSave: (data: Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>) => void
  availableMatches: ScopeKbMatch[]
  availableLeaguesRich: ScopeKbLeague[]
  availableTeamsRich: ScopeKbTeam[]
}

export function CustomPatternModal({ open, initial, onClose, onSave, availableMatches, availableLeaguesRich, availableTeamsRich }: CustomPatternModalProps) {
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
  const [visitedSteps, setVisitedSteps] = useState<Set<CustomStep>>(
    () => initial ? new Set(ALL_CUSTOM_STEPS) : new Set<CustomStep>(['identity'])
  )

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
    setVisitedSteps(initial ? new Set(ALL_CUSTOM_STEPS) : new Set<CustomStep>(['identity']))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const { leagueLookup, teamLookup, matchLookup } = useScopeLookups(availableLeaguesRich, availableTeamsRich, availableMatches)

  if (!open) return null

  const hasName = name.trim().length > 0
  const hasConditions = conditions.length > 0
  const canSave = hasName && hasConditions
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

  const handleAdvancedToggle = (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => {
    if (key === 'requireRichData') setRequireRichData(v)
    if (key === 'onlyLive') { setOnlyLive(v); if (v) setOnlyPreMatch(false) }
    if (key === 'onlyPreMatch') { setOnlyPreMatch(v); if (v) setOnlyLive(false) }
  }

  const steps: { key: CustomStep; label: string; valid: boolean; required: boolean }[] = [
    { key: 'identity', label: 'Identidade', valid: hasName, required: true },
    { key: 'scope', label: 'Escopo', valid: true, required: false },
    { key: 'conditions', label: 'Trigger Lab', valid: hasConditions, required: true },
    { key: 'action', label: 'Ação', valid: true, required: false },
    { key: 'confidence', label: 'Confiança', valid: true, required: false },
    { key: 'review', label: 'Revisão', valid: canSave, required: false },
  ]

  const stepIndex = steps.findIndex(s => s.key === step)
  const goPrev = () => { if (stepIndex > 0) { const prev = steps[stepIndex - 1].key; setStep(prev); setVisitedSteps(p => { const n = new Set(p); n.add(prev); return n }) } }
  const goNext = () => { if (stepIndex < steps.length - 1) { const next = steps[stepIndex + 1].key; setStep(next); setVisitedSteps(p => { const n = new Set(p); n.add(next); return n }) } }
  const goTo = (k: CustomStep) => { setStep(k); setVisitedSteps(p => { const n = new Set(p); n.add(k); return n }) }
  const allStepsVisited = steps.every(s => visitedSteps.has(s.key))
  const canActivate = canSave && allStepsVisited
  const activateLockedHint = !hasName
    ? 'Dê um nome ao radar antes de ativar'
    : !hasConditions
      ? 'Adicione ao menos uma condição para ativar'
      : !allStepsVisited
        ? 'Visite todos os passos antes de ativar'
        : undefined

  return (
    <ModalShell open={open} onClose={onClose} title={initial ? 'Editar radar' : 'Criar radar personalizado'} subtitle="Configure uma regra inteligente para o GoalSense monitorar partidas em tempo real." maxWidth="max-w-[1200px]"
      headerExtra={
        <div className="flex items-center gap-2 text-[11px] text-white/45">
          <span className={`h-1.5 w-1.5 rounded-full ${initial ? (initial.status === 'active' ? 'bg-emerald-400/85' : 'bg-white/40') : 'bg-cyan-300/70'}`} />
          <span className="text-white/55">{initial ? (initial.status === 'active' ? 'Editando radar ativo' : 'Editando radar pausado') : 'Rascunho'}</span>
        </div>
      }
      footer={
        <>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          {stepIndex > 0 && <button onClick={goPrev} type="button" className="px-3.5 py-2.5 rounded-xl text-[12px] font-medium text-white/75 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-all">Voltar</button>}
          {stepIndex < steps.length - 1 && (
            <button
              onClick={goNext}
              disabled={!steps[stepIndex]?.valid}
              title={!steps[stepIndex]?.valid ? 'Conclua este passo para avançar' : undefined}
              type="button"
              className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >Próximo</button>
          )}
          {stepIndex === steps.length - 1 && <button onClick={() => { onSave(buildData('paused')); onClose() }} disabled={!canSave} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">Salvar pausado</button>}
          {stepIndex === steps.length - 1 && <button onClick={() => { onSave(buildData('active')); onClose() }} disabled={!canActivate} title={activateLockedHint} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-white/[0.95] hover:bg-white border border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200" style={{ color: '#0b0d12' }}>{initial ? 'Salvar e ativar' : 'Criar e ativar'}</button>}
        </>
      }
    >
      {/* Progress rail at top */}
      <div className="mb-7 px-1">
        <WizardProgressRail steps={steps} current={step} onSelect={goTo} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Step content */}
        <div className="lg:col-span-8 min-w-0 space-y-5">
          <div className="animate-fadeIn" key={step}>
            {step === 'identity' && (
              <>
                <WizardStepHeader index={1} total={steps.length} title="Dê identidade ao radar" description="Escolha um nome claro e uma severidade para organizar seus sinais." />
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Nome do radar</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ex.: Pressão final com placar curto"
                      autoFocus
                      className={`w-full h-14 rounded-xl border bg-white/[0.018] px-5 text-[16px] font-medium text-white/95 placeholder:text-white/25 placeholder:font-normal outline-none transition-colors duration-200 ${name.trim() ? 'border-white/[0.08] focus:border-white/30 focus:bg-white/[0.03]' : 'border-amber-300/20 focus:border-amber-300/40'}`}
                    />
                    {!hasName && <p className="text-[11px] text-amber-300/75 mt-2">O nome é obrigatório.</p>}
                    <p className="text-[11px] text-white/40 mt-2 leading-snug">Use um nome curto que descreva o sinal que você quer monitorar.</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Descrição</label>
                    <input
                      value={desc}
                      onChange={e => setDesc(e.target.value)}
                      placeholder="Quando este radar é útil?"
                      className="w-full h-12 rounded-xl border border-white/[0.07] bg-white/[0.018] px-4 text-[13px] text-white/90 placeholder:text-white/25 outline-none transition-colors duration-200 focus:border-white/30 focus:bg-white/[0.03]"
                    />
                    <p className="text-[11px] text-white/40 mt-2">Use para lembrar quando este radar é útil.</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 block mb-2">Severidade</label>
                    <p className="text-[11px] text-white/40 mb-3 leading-snug">Define a urgência operacional do sinal no Scanner e nos alertas.</p>
                    <SeverityPicker value={severity} onChange={setSeverity} />
                  </div>
                </div>
              </>
            )}
            {step === 'scope' && (
              <>
                <WizardStepHeader index={2} total={steps.length} title="Onde este radar deve atuar?" description="Escolha o escopo de partidas em que este radar pode disparar." />
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
              </>
            )}
            {step === 'conditions' && (
              <>
                <WizardStepHeader index={3} total={steps.length} kicker="Trigger Lab" title="Quais sinais precisam acontecer?" description="Combine gatilhos da biblioteca ou aplique uma receita rápida. Todas as condições precisam ser verdadeiras para o radar bater." />
                <ConditionsEditor conditions={conditions} onChange={setConditions} />
                {!hasConditions && <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3 mt-4"><p className="text-[11px] text-amber-200 font-medium">É necessário pelo menos uma condição para salvar este radar.</p></div>}
              </>
            )}
            {step === 'action' && (
              <>
                <WizardStepHeader index={4} total={steps.length} title="O que fazer quando bater?" description="Escolha o destino do sinal quando este radar detectar todas as condições." />
                <ActionCardPicker value={action} onChange={setAction} />
              </>
            )}
            {step === 'confidence' && (
              <>
                <WizardStepHeader index={5} total={steps.length} title="Qual rigor o radar deve ter?" description="Quanto maior, menos alertas falsos. Recomendado: 50% para começar." />
                <ConfidenceSlider value={minConf} onChange={setMinConf} action={action} />
              </>
            )}
            {step === 'review' && (
              <>
                <WizardStepHeader index={6} total={steps.length} title="Revise antes de ativar" description="Confira a configuração final. Você pode voltar e ajustar antes de salvar." />
                <RadarPreview name={name.trim()} severity={severity} scope={scope} scopeFilter={scopeFilter} matches={matchesFilter} excludeLeagues={excludeLeagues} excludeTeams={excludeTeams} excludeMatches={excludeMatches} requireRichData={requireRichData} onlyLive={onlyLive} onlyPreMatch={onlyPreMatch} action={action} minConf={minConf} conditions={conditions} />
                <p className="text-[11px] text-white/45 leading-snug mt-4">Após salvar, este radar aparecerá em &ldquo;Radares configurados&rdquo; no Pattern Studio.</p>
              </>
            )}
          </div>
        </div>

        {/* Inspector right */}
        <aside className="lg:col-span-4 hidden lg:block">
          <RadarInspectorPanel
            name={name.trim()}
            status={initial ? (initial.status === 'active' ? 'active' : 'paused') : 'draft'}
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
    </ModalShell>
  )
}
