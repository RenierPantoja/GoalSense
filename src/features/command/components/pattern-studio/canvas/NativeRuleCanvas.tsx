/**
 * NativeRuleCanvas — Radar Blueprint 3.5 (cockpit rule modules)
 * ─────────────────────────────────────────────────────────────────────────────
 * The radar as a stack of premium cockpit modules — each line is a real part of
 * the engine contract, edited inline via dedicated command sheets:
 *   - ScopeSelectionSheet (premium 3-column scope picker)
 *   - ConditionCommandSheet (add filter/signal, edit, recipes)
 * Conditions render as premium RadarConditionChip objects. Presentation only —
 * all logic stays in the 3.1 layer.
 */
import { useState, type ReactNode } from 'react'
import { Radar, Globe2, Clock, Crosshair, Bell, Gauge, Plus, Sparkles, ChevronRight } from 'lucide-react'
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
const SEVERITIES: { v: PatternSeverity; label: string; dot: string; on: string }[] = [
  { v: 'critical', label: 'Crítico', dot: 'bg-rose-400', on: 'bg-rose-500/15 text-rose-200 border-rose-400/30' },
  { v: 'attention', label: 'Atenção', dot: 'bg-amber-400', on: 'bg-amber-500/15 text-amber-200 border-amber-400/30' },
  { v: 'info', label: 'Info', dot: 'bg-cyan-400', on: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30' },
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

  const valuePill = (label: ReactNode, onClick: () => void, opts?: { tone?: 'default' | 'muted' }) => (
    <button type="button" onClick={onClick} className={`group inline-flex items-center gap-2 h-8 pl-3 pr-2.5 rounded-xl border text-[12.5px] font-medium transition-all outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40 ${opts?.tone === 'muted' ? 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/90 hover:border-white/[0.14]' : 'border-cyan-400/20 bg-cyan-500/[0.05] text-white/90 hover:bg-cyan-500/[0.1] hover:border-cyan-400/35'}`}>
      {label}<ChevronRight size={13} className="opacity-40 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all" />
    </button>
  )

  const addPill = (label: ReactNode, onClick: () => void, warn?: boolean) => (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-dashed text-[12px] font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40 ${warn ? 'border-amber-400/35 text-amber-200 hover:bg-amber-500/[0.06]' : 'border-white/[0.14] text-white/55 hover:text-white/85 hover:border-white/[0.22] hover:bg-white/[0.02]'}`}>
      <Plus size={13} />{label}
    </button>
  )

  const Module = ({ icon, kicker, accent, children }: { icon: ReactNode; kicker: string; accent?: boolean; children: ReactNode }) => (
    <div className="group flex items-start gap-3.5 px-4 py-3.5 rounded-2xl border border-white/[0.055] bg-white/[0.012] hover:border-white/[0.1] hover:bg-white/[0.02] transition-all">
      <div className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 border transition-colors ${accent ? 'border-cyan-400/25 bg-cyan-500/[0.08] text-cyan-300 shadow-[0_0_18px_-6px_rgba(34,211,238,0.5)]' : 'border-white/[0.08] bg-white/[0.02] text-white/50 group-hover:text-white/70'}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 block mb-2">{kicker}</span>
        <div className="flex items-center gap-1.5 flex-wrap min-h-[32px]">{children}</div>
      </div>
    </div>
  )

  return (
    <div className="relative">
      {/* Identity header */}
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] via-white/[0.01] to-transparent px-5 py-4 mb-2.5">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0 border border-cyan-400/25 bg-cyan-500/[0.08] text-cyan-300 shadow-[0_0_20px_-6px_rgba(34,211,238,0.5)]"><Radar size={20} /></div>
          <input value={name} onChange={e => onName(e.target.value)} placeholder="Nomeie este radar" autoFocus aria-invalid={!name.trim()} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[22px] font-semibold tracking-tight text-white/95 placeholder:text-white/25 placeholder:font-normal" />
          <div className="flex items-center gap-1 shrink-0 rounded-xl border border-white/[0.07] bg-black/20 p-1">
            {SEVERITIES.map(s => (
              <button key={s.v} type="button" onClick={() => onSeverity(s.v)} aria-pressed={severity === s.v} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-all ${severity === s.v ? s.on : 'border-transparent text-white/40 hover:text-white/70'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
              </button>
            ))}
          </div>
        </div>
        <input value={desc} onChange={e => onDesc(e.target.value)} placeholder="Descrição opcional — quando este radar é útil" className="w-full mt-2 pl-[58px] bg-transparent border-0 outline-none text-[12.5px] text-white/60 placeholder:text-white/25" />
      </div>

      {/* Modules */}
      <div className="space-y-2.5">
        <Module icon={<Globe2 size={17} />} kicker="Monitorar">
          {valuePill(contract.scopeLabel, () => setSheet({ kind: 'scope' }), { tone: props.scope === 'all' ? 'muted' : 'default' })}
        </Module>

        <Module icon={<Clock size={17} />} kicker="Avaliar quando">
          {filters.map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => setSheet({ kind: 'condition', mode: { kind: 'edit', index: i } })} onRemove={() => removeCond(i)} />)}
          {addPill('filtro', () => setSheet({ kind: 'condition', mode: { kind: 'addFilter' } }))}
        </Module>

        <Module icon={<Crosshair size={17} />} kicker="Disparar se" accent={signals.length > 0}>
          {signals.length === 0
            ? addPill('adicionar sinal real', () => setSheet({ kind: 'condition', mode: { kind: 'addSignal' } }), true)
            : <>
                {signals.map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => setSheet({ kind: 'condition', mode: { kind: 'edit', index: i } })} onRemove={() => removeCond(i)} />)}
                {addPill('sinal real', () => setSheet({ kind: 'condition', mode: { kind: 'addSignal' } }))}
                <button type="button" onClick={() => setSheet({ kind: 'condition', mode: { kind: 'recipes' } })} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-white/[0.08] text-[12px] font-medium text-cyan-300/80 hover:text-cyan-200 hover:border-cyan-400/25 transition-colors"><Sparkles size={12} />receita</button>
              </>}
        </Module>

        <Module icon={<Bell size={17} />} kicker="Então">
          {valuePill(ACTION_LABEL[action], () => setSheet({ kind: 'action' }))}
        </Module>

        <Module icon={<Gauge size={17} />} kicker="Com rigor">
          {valuePill(`${minConf}% · ${RIGOR_PRESETS.find(p => p.value === minConf)?.label || 'Personalizado'}`, () => setSheet({ kind: 'rigor' }))}
        </Module>
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
              <button key={p.label} type="button" onClick={() => onMinConf(p.value)} className={`flex-1 h-12 rounded-xl border text-[12px] font-semibold transition-all ${minConf === p.value ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200 shadow-[0_0_18px_-8px_rgba(34,211,238,0.6)]' : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/85'}`}>{p.label}<span className="block text-[10px] font-normal opacity-60 mt-0.5">{p.value}%</span></button>
            ))}
          </div>
          <ConfidenceSlider value={minConf} onChange={onMinConf} action={action} />
        </SheetShell>
      )}
    </div>
  )
}
