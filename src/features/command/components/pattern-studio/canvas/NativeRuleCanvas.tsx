/**
 * NativeRuleCanvas — Radar Blueprint 3.4 (Native Rule Studio canvas)
 * ─────────────────────────────────────────────────────────────────────────────
 * The radar as an editable operational sentence. Each line is a real part of the
 * engine contract, edited inline via dedicated command sheets:
 *   - ScopeSelectionSheet (premium 3-column scope picker)
 *   - ConditionCommandSheet (add filter/signal, edit, recipes)
 * Conditions render as premium RadarConditionChip objects. Filters and real
 * signals are visually separated. Presentation only — logic stays in 3.1.
 */
import { useState, type ReactNode } from 'react'
import { Plus, Sparkles, ChevronDown } from 'lucide-react'
import type { PatternAction, PatternCondition, PatternScope, PatternSeverity } from '../../../types/commandTypes'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { getCapability } from '../../../intelligence/radarConditionCapabilities'
import type { RadarContract } from '../../../intelligence/radarReadiness'
import { ActionCardPicker } from '../form-controls/ActionCardPicker'
import { ConfidenceSlider } from '../form-controls/ConfidenceSlider'
import { SheetShell } from './SheetShell'
import { RadarConditionChip } from './RadarConditionChip'
import { ConditionCommandSheet, type ConditionSheetMode } from './ConditionCommandSheet'
import { ScopeSelectionSheet, type ScopeSelectionValue } from '../scope/ScopeSelectionSheet'

const ACTION_LABEL: Record<PatternAction, string> = { register_alert: 'Registrar alerta', suggest_only: 'Apenas sugerir', highlight: 'Destacar no Scanner' }
const SEVERITIES: { v: PatternSeverity; label: string; dot: string }[] = [
  { v: 'critical', label: 'Crítico', dot: 'bg-rose-400/80' },
  { v: 'attention', label: 'Atenção', dot: 'bg-amber-400/80' },
  { v: 'info', label: 'Info', dot: 'bg-cyan-400/80' },
]
const RIGOR_PRESETS = [
  { label: 'Sensível', value: 40 },
  { label: 'Equilibrado', value: 50 },
  { label: 'Rigoroso', value: 70 },
]

export interface NativeRuleCanvasProps {
  name: string
  onName: (s: string) => void
  desc: string
  onDesc: (s: string) => void
  severity: PatternSeverity
  onSeverity: (s: PatternSeverity) => void
  scope: PatternScope
  scopeFilter: string[]
  matchesFilter: string[]
  excludeLeagues: string[]
  excludeTeams: string[]
  excludeMatches: string[]
  requireRichData: boolean
  onlyLive: boolean
  onlyPreMatch: boolean
  availableMatches: ScopeKbMatch[]
  availableLeaguesRich: ScopeKbLeague[]
  availableTeamsRich: ScopeKbTeam[]
  onScope: (s: PatternScope) => void
  onScopeFilter: (s: string[]) => void
  onMatches: (s: string[]) => void
  onExcludeLeagues: (s: string[]) => void
  onExcludeTeams: (s: string[]) => void
  onExcludeMatches: (s: string[]) => void
  onAdvancedToggle: (k: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => void
  conditions: PatternCondition[]
  onConditions: (c: PatternCondition[]) => void
  action: PatternAction
  onAction: (a: PatternAction) => void
  minConf: number
  onMinConf: (n: number) => void
  contract: RadarContract
}

type Sheet =
  | { kind: 'none' }
  | { kind: 'scope' }
  | { kind: 'condition'; mode: ConditionSheetMode }
  | { kind: 'action' }
  | { kind: 'rigor' }

export function NativeRuleCanvas(props: NativeRuleCanvasProps) {
  const { name, onName, desc, onDesc, severity, onSeverity, conditions, onConditions, action, onAction, minConf, onMinConf, contract } = props
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' })
  const close = () => setSheet({ kind: 'none' })

  const removeCond = (idx: number) => onConditions(conditions.filter((_, j) => j !== idx))
  const filters = conditions.map((c, i) => ({ c, i })).filter(({ c }) => getCapability(c.type).kind !== 'signal')
  const signals = conditions.map((c, i) => ({ c, i })).filter(({ c }) => getCapability(c.type).kind === 'signal')

  const applyScope = (next: ScopeSelectionValue) => {
    props.onScope(next.scope)
    props.onScopeFilter(next.scopeFilter)
    props.onMatches(next.matches)
    props.onExcludeLeagues(next.excludeLeagues)
    props.onExcludeTeams(next.excludeTeams)
    props.onExcludeMatches(next.excludeMatches)
    props.onAdvancedToggle('requireRichData', next.requireRichData)
    props.onAdvancedToggle('onlyLive', next.onlyLive)
    props.onAdvancedToggle('onlyPreMatch', next.onlyPreMatch)
  }

  const pill = (label: ReactNode, onClick: () => void, opts?: { tone?: 'default' | 'muted' | 'warn'; chevron?: boolean }) => (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[12px] font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${opts?.tone === 'muted' ? 'border-white/[0.08] bg-white/[0.02] text-white/55 hover:text-white/80' : opts?.tone === 'warn' ? 'border-amber-400/25 bg-amber-500/[0.06] text-amber-100' : 'border-white/[0.1] bg-white/[0.04] text-white/85 hover:bg-white/[0.07]'}`}>
      {label}{opts?.chevron !== false && <ChevronDown size={12} className="opacity-50" />}
    </button>
  )

  const Line = ({ kicker, children }: { kicker: string; children: ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 w-[104px] shrink-0 pt-1.5">{kicker}</span>
      <div className="flex items-center gap-1.5 flex-wrap min-h-[28px] flex-1">{children}</div>
    </div>
  )

  return (
    <div className="relative">
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent px-5 py-2">
        {/* Name — editorial inline */}
        <div className="flex items-center gap-3 py-3 border-b border-white/[0.04]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 w-[104px] shrink-0">Radar</span>
          <input value={name} onChange={e => onName(e.target.value)} placeholder="Nomeie este radar" autoFocus aria-invalid={!name.trim()} className="flex-1 bg-transparent border-0 outline-none text-[20px] font-semibold tracking-tight text-white/95 placeholder:text-white/25 placeholder:font-normal" />
          <div className="flex items-center gap-0.5 shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
            {SEVERITIES.map(s => (
              <button key={s.v} type="button" onClick={() => onSeverity(s.v)} aria-pressed={severity === s.v} className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors ${severity === s.v ? 'bg-white/[0.08] text-white/90' : 'text-white/45 hover:text-white/70'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="flex items-center gap-3 py-2 border-b border-white/[0.04]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 w-[104px] shrink-0">Nota</span>
          <input value={desc} onChange={e => onDesc(e.target.value)} placeholder="Descrição opcional — quando este radar é útil" className="flex-1 bg-transparent border-0 outline-none text-[12.5px] text-white/75 placeholder:text-white/25" />
        </div>

        <Line kicker="Monitorar">{pill(contract.scopeLabel, () => setSheet({ kind: 'scope' }), { tone: props.scope === 'all' ? 'muted' : 'default' })}</Line>

        <Line kicker="Avaliar quando">
          {filters.map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => setSheet({ kind: 'condition', mode: { kind: 'edit', index: i } })} onRemove={() => removeCond(i)} />)}
          {pill(<><Plus size={12} />filtro</>, () => setSheet({ kind: 'condition', mode: { kind: 'addFilter' } }), { chevron: false, tone: 'muted' })}
        </Line>

        <Line kicker="Disparar se">
          {signals.length === 0
            ? pill(<><Plus size={12} />adicionar sinal real</>, () => setSheet({ kind: 'condition', mode: { kind: 'addSignal' } }), { chevron: false, tone: 'warn' })
            : <>
                {signals.map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => setSheet({ kind: 'condition', mode: { kind: 'edit', index: i } })} onRemove={() => removeCond(i)} />)}
                {pill(<><Plus size={12} />sinal real</>, () => setSheet({ kind: 'condition', mode: { kind: 'addSignal' } }), { chevron: false, tone: 'muted' })}
                {pill(<><Sparkles size={11} />receita</>, () => setSheet({ kind: 'condition', mode: { kind: 'recipes' } }), { chevron: false, tone: 'muted' })}
              </>}
        </Line>

        <Line kicker="Então">{pill(ACTION_LABEL[action], () => setSheet({ kind: 'action' }))}</Line>

        <Line kicker="Com rigor">{pill(`${minConf}% · ${RIGOR_PRESETS.find(p => p.value === minConf)?.label || 'Personalizado'}`, () => setSheet({ kind: 'rigor' }))}</Line>
      </div>

      {/* ── Dedicated sheets ── */}
      {sheet.kind === 'scope' && (
        <ScopeSelectionSheet
          scope={props.scope} scopeFilter={props.scopeFilter} matches={props.matchesFilter}
          excludeLeagues={props.excludeLeagues} excludeTeams={props.excludeTeams} excludeMatches={props.excludeMatches}
          requireRichData={props.requireRichData} onlyLive={props.onlyLive} onlyPreMatch={props.onlyPreMatch}
          availableMatches={props.availableMatches} availableLeaguesRich={props.availableLeaguesRich} availableTeamsRich={props.availableTeamsRich}
          onApply={applyScope} onClose={close}
        />
      )}

      {sheet.kind === 'condition' && (
        <ConditionCommandSheet mode={sheet.mode} conditions={conditions} onChange={onConditions} onClose={close} />
      )}

      {sheet.kind === 'action' && (
        <SheetShell title="Ação ao disparar" subtitle="O que o radar faz quando todas as condições batem" onClose={close}>
          <ActionCardPicker value={action} onChange={a => { onAction(a); close() }} />
        </SheetShell>
      )}

      {sheet.kind === 'rigor' && (
        <SheetShell title="Rigor do radar" subtitle="Quanto maior, menos alertas falsos" onClose={close}>
          <div className="flex items-center gap-1.5 mb-4">
            {RIGOR_PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => onMinConf(p.value)} className={`flex-1 h-9 rounded-lg border text-[11.5px] font-semibold transition-colors ${minConf === p.value ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200' : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/85'}`}>{p.label}<span className="block text-[9.5px] font-normal opacity-60">{p.value}%</span></button>
            ))}
          </div>
          <ConfidenceSlider value={minConf} onChange={onMinConf} action={action} />
        </SheetShell>
      )}
    </div>
  )
}
