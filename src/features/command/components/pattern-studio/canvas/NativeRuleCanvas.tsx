/**
 * NativeRuleCanvas — Radar Blueprint 3.6 (Apple-native grouped rule)
 * ─────────────────────────────────────────────────────────────────────────────
 * The radar composed as a calm iOS/macOS-settings grouped list: a prominent name
 * field, vivid rounded app-icon tiles, refined typography, hairline rows and
 * value + chevron affordances. Editing happens in dedicated command sheets.
 * Presentation only — all logic stays in the 3.1 layer.
 */
import { useState, type ReactNode } from 'react'
import { Radar, Globe2, Clock, Target, Bell, SlidersHorizontal, Plus, ChevronRight, Sparkles } from 'lucide-react'
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
  { v: 'critical', label: 'Crítico', dot: 'bg-[#FF453A]' },
  { v: 'attention', label: 'Atenção', dot: 'bg-[#FF9F0A]' },
  { v: 'info', label: 'Info', dot: 'bg-[#0A84FF]' },
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

function Tile({ color, icon }: { color: string; icon: ReactNode }) {
  return <span className="h-[30px] w-[30px] rounded-[8px] grid place-items-center text-white shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.25)]" style={{ backgroundColor: color }}>{icon}</span>
}

const ADD = 'inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12.5px] font-medium text-[#0A84FF] hover:bg-[#0A84FF]/12 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#0A84FF]/40'

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

  // Clickable settings row (value + chevron)
  const NavRow = ({ tile, label, value, onClick, muted }: { tile: ReactNode; label: string; value: string; onClick: () => void; muted?: boolean }) => (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-4 h-[52px] text-left hover:bg-white/[0.025] transition-colors outline-none focus-visible:bg-white/[0.04]">
      {tile}
      <span className="text-[15px] text-white/88">{label}</span>
      <span className={`ml-auto text-[14px] truncate max-w-[55%] text-right ${muted ? 'text-white/35' : 'text-white/55'}`}>{value}</span>
      <ChevronRight size={16} className="text-white/25 shrink-0" />
    </button>
  )

  // Chips row (filters / signals)
  const ChipRow = ({ tile, label, children }: { tile: ReactNode; label: string; children: ReactNode }) => (
    <div className="flex items-center gap-3 px-4 py-2.5 min-h-[52px]">
      {tile}
      <span className="text-[15px] text-white/88 shrink-0">{label}</span>
      <div className="ml-auto flex items-center justify-end gap-1.5 flex-wrap max-w-[68%]">{children}</div>
    </div>
  )

  const rigorLabel = RIGOR_PRESETS.find(p => p.value === minConf)?.label
  const scopeMuted = props.scope === 'all'

  return (
    <div className="relative max-w-[680px] mx-auto">
      {/* Name card */}
      <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.04] px-4 py-4">
        <div className="flex items-center gap-3.5">
          <span className="h-[34px] w-[34px] rounded-[9px] grid place-items-center text-white shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(0,0,0,0.3)]" style={{ backgroundImage: 'linear-gradient(160deg,#0A84FF,#0066d6)' }}><Radar size={19} /></span>
          <input value={name} onChange={e => onName(e.target.value)} placeholder="Nomeie este radar" autoFocus aria-invalid={!name.trim()} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[22px] font-semibold tracking-[-0.02em] text-white/92 placeholder:text-white/25 placeholder:font-normal" />
        </div>
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-3">
          <input value={desc} onChange={e => onDesc(e.target.value)} placeholder="Descrição opcional" className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-white/65 placeholder:text-white/30" />
          <div className="inline-flex items-center gap-0.5 rounded-[9px] bg-black/25 p-[3px] shrink-0">
            {SEVERITIES.map(s => (
              <button key={s.v} type="button" onClick={() => onSeverity(s.v)} aria-pressed={severity === s.v} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[7px] text-[12px] font-medium transition-all ${severity === s.v ? 'bg-white/[0.14] text-white/95 shadow-[0_1px_2px_rgba(0,0,0,0.3)]' : 'text-white/45 hover:text-white/70'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Group header */}
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/35 px-3 mt-6 mb-2">Regra</p>

      {/* Grouped list */}
      <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.04] overflow-hidden divide-y divide-white/[0.06]">
        <NavRow tile={<Tile color="#0A84FF" icon={<Globe2 size={16} />} />} label="Monitorar" value={contract.scopeLabel} onClick={() => setSheet({ kind: 'scope' })} muted={scopeMuted} />

        <ChipRow tile={<Tile color="#5E5CE6" icon={<Clock size={16} />} />} label="Avaliar quando">
          {filters.map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => setSheet({ kind: 'condition', mode: { kind: 'edit', index: i } })} onRemove={() => removeCond(i)} />)}
          <button type="button" className={ADD} onClick={() => setSheet({ kind: 'condition', mode: { kind: 'addFilter' } })}><Plus size={13} />filtro</button>
        </ChipRow>

        <ChipRow tile={<Tile color="#30D158" icon={<Target size={16} />} />} label="Disparar se">
          {signals.length === 0
            ? <button type="button" className={ADD} onClick={() => setSheet({ kind: 'condition', mode: { kind: 'addSignal' } })}><Plus size={13} />adicionar sinal real</button>
            : <>
                {signals.map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => setSheet({ kind: 'condition', mode: { kind: 'edit', index: i } })} onRemove={() => removeCond(i)} />)}
                <button type="button" className={ADD} onClick={() => setSheet({ kind: 'condition', mode: { kind: 'addSignal' } })}><Plus size={13} />sinal</button>
                <button type="button" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12.5px] font-medium text-white/45 hover:text-white/75 transition-colors" onClick={() => setSheet({ kind: 'condition', mode: { kind: 'recipes' } })}><Sparkles size={12} />receita</button>
              </>}
        </ChipRow>

        <NavRow tile={<Tile color="#FF9F0A" icon={<Bell size={16} />} />} label="Então" value={ACTION_LABEL[action]} onClick={() => setSheet({ kind: 'action' })} />

        <NavRow tile={<Tile color="#8E8E93" icon={<SlidersHorizontal size={16} />} />} label="Rigor" value={`${minConf}%${rigorLabel ? ` · ${rigorLabel}` : ''}`} onClick={() => setSheet({ kind: 'rigor' })} />
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
          <div className="flex items-center gap-2 mb-5">
            {RIGOR_PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => onMinConf(p.value)} className={`flex-1 h-14 rounded-[12px] border text-[13px] font-semibold transition-all ${minConf === p.value ? 'border-[#0A84FF]/40 bg-[#0A84FF]/12 text-white' : 'border-white/[0.08] bg-white/[0.03] text-white/55 hover:text-white/85'}`}>{p.label}<span className="block text-[11px] font-normal opacity-60 mt-0.5">{p.value}%</span></button>
            ))}
          </div>
          <ConfidenceSlider value={minConf} onChange={onMinConf} action={action} />
        </SheetShell>
      )}
    </div>
  )
}
