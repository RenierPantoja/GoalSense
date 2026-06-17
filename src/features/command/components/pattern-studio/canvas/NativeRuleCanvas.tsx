/**
 * NativeRuleCanvas — Radar Blueprint 3.7 (refined, bespoke identity)
 * ─────────────────────────────────────────────────────────────────────────────
 * Apple-inspired (not a copy): a calm grouped composition with GoalSense's own
 * signature — gradient depth icon tiles, a teal brand accent, semantic icons per
 * section and refined typography. Editing happens in dedicated command sheets.
 * Presentation only — all logic stays in the 3.1 layer.
 */
import { useState, type ReactNode } from 'react'
import { Radar, Telescope, Timer, Crosshair, BellRing, Gauge, Plus, ChevronRight, Wand2 } from 'lucide-react'
import type { PatternAction, PatternCondition, PatternScope, PatternSeverity } from '../../../types/commandTypes'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { getCapability } from '../../../intelligence/radarConditionCapabilities'
import type { RadarContract, RadarReadiness } from '../../../intelligence/radarReadiness'
import { ActionCardPicker } from '../form-controls/ActionCardPicker'
import { ConfidenceSlider } from '../form-controls/ConfidenceSlider'
import { SheetShell } from './SheetShell'
import { RadarConditionChip } from './RadarConditionChip'
import { RuleReadinessStrip } from './RuleReadinessStrip'
import { ConditionCommandSheet, type ConditionSheetMode } from './ConditionCommandSheet'
import { ScopeSelectionSheet, type ScopeSelectionValue } from '../scope/ScopeSelectionSheet'

// Brand signature accent (teal) — distinct from a literal iOS blue.
const ACCENT = '#2DD4BF'

const ACTION_LABEL: Record<PatternAction, string> = { register_alert: 'Registrar alerta', suggest_only: 'Apenas sugerir', highlight: 'Destacar no Scanner' }
const SEVERITIES: { v: PatternSeverity; label: string; dot: string }[] = [
  { v: 'critical', label: 'Crítico', dot: 'bg-[#FF5A52]' },
  { v: 'attention', label: 'Atenção', dot: 'bg-[#FFB02E]' },
  { v: 'info', label: 'Info', dot: 'bg-[#3B82F6]' },
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
  readiness: RadarReadiness
}

type Sheet =
  | { kind: 'none' }
  | { kind: 'scope' }
  | { kind: 'condition'; mode: ConditionSheetMode }
  | { kind: 'action' }
  | { kind: 'rigor' }

/** Gradient-depth icon tile (signature look). */
function Tile({ from, to, size = 30, icon }: { from: string; to: string; size?: number; icon: ReactNode }) {
  return (
    <span
      className="rounded-[9px] grid place-items-center text-white shrink-0 ring-1 ring-inset ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_5px_rgba(0,0,0,0.35)]"
      style={{ height: size, width: size, backgroundImage: `linear-gradient(155deg, ${from}, ${to})` }}
    >{icon}</span>
  )
}

const TILES = {
  monitor: { from: '#5AA2FF', to: '#2D6FE0' },
  when: { from: '#A78BFA', to: '#7C4DEF' },
  fire: { from: '#4ADE80', to: '#1FA855' },
  then: { from: '#FFC75A', to: '#F08E1B' },
  rigor: { from: '#9AA6B8', to: '#5E6A7D' },
}

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

  const NavRow = ({ tile, label, value, onClick, muted }: { tile: ReactNode; label: string; value: string; onClick: () => void; muted?: boolean }) => (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3.5 px-4 h-[54px] text-left hover:bg-white/[0.03] transition-colors outline-none focus-visible:bg-white/[0.05]">
      {tile}
      <span className="text-[15px] text-white/88 tracking-[-0.01em]">{label}</span>
      <span className={`ml-auto text-[14px] truncate max-w-[55%] text-right ${muted ? 'text-white/35' : 'text-white/55'}`}>{value}</span>
      <ChevronRight size={16} className="text-white/25 shrink-0" />
    </button>
  )

  const ChipRow = ({ tile, label, children }: { tile: ReactNode; label: string; children: ReactNode }) => (
    <div className="flex items-center gap-3.5 px-4 py-2.5 min-h-[54px]">
      {tile}
      <span className="text-[15px] text-white/88 tracking-[-0.01em] shrink-0">{label}</span>
      <div className="ml-auto flex items-center justify-end gap-1.5 flex-wrap max-w-[68%]">{children}</div>
    </div>
  )

  const addBtn = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12.5px] font-medium transition-colors outline-none focus-visible:ring-1" style={{ color: ACCENT }} onMouseDown={e => e.preventDefault()}>
      <Plus size={13} />{label}
    </button>
  )

  const rigorLabel = RIGOR_PRESETS.find(p => p.value === minConf)?.label

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto sidebar-scroll px-6 sm:px-8 py-7">
      <div className="max-w-[720px] mx-auto">
      {/* Identity card */}
      <div className="rounded-[16px] border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.025] px-4 py-4">
        <div className="flex items-center gap-3.5">
          <Tile from="#34E3CB" to="#0E9E8C" size={34} icon={<Radar size={19} />} />
          <input value={name} onChange={e => onName(e.target.value)} placeholder="Nomeie este radar" autoFocus aria-invalid={!name.trim()} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[22px] font-semibold tracking-[-0.025em] text-white/92 placeholder:text-white/25 placeholder:font-normal" />
        </div>
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-3">
          <input value={desc} onChange={e => onDesc(e.target.value)} placeholder="Descrição opcional" className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-white/65 placeholder:text-white/30" />
          <div className="inline-flex items-center gap-0.5 rounded-[10px] bg-black/30 p-[3px] shrink-0 ring-1 ring-inset ring-white/[0.05]">
            {SEVERITIES.map(s => (
              <button key={s.v} type="button" onClick={() => onSeverity(s.v)} aria-pressed={severity === s.v} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[8px] text-[12px] font-medium transition-all ${severity === s.v ? 'bg-white/[0.16] text-white/95 shadow-[0_1px_2px_rgba(0,0,0,0.35)]' : 'text-white/45 hover:text-white/75'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/30 px-3 mt-6 mb-2">Regra</p>

      <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.035] overflow-hidden divide-y divide-white/[0.055]">
        <NavRow tile={<Tile {...TILES.monitor} icon={<Telescope size={16} />} />} label="Monitorar" value={contract.scopeLabel} onClick={() => setSheet({ kind: 'scope' })} muted={props.scope === 'all'} />

        <ChipRow tile={<Tile {...TILES.when} icon={<Timer size={16} />} />} label="Avaliar quando">
          {filters.map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => setSheet({ kind: 'condition', mode: { kind: 'edit', index: i } })} onRemove={() => removeCond(i)} />)}
          {addBtn('filtro', () => setSheet({ kind: 'condition', mode: { kind: 'addFilter' } }))}
        </ChipRow>

        <ChipRow tile={<Tile {...TILES.fire} icon={<Crosshair size={16} />} />} label="Disparar se">
          {signals.length === 0
            ? addBtn('adicionar sinal real', () => setSheet({ kind: 'condition', mode: { kind: 'addSignal' } }))
            : <>
                {signals.map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => setSheet({ kind: 'condition', mode: { kind: 'edit', index: i } })} onRemove={() => removeCond(i)} />)}
                {addBtn('sinal', () => setSheet({ kind: 'condition', mode: { kind: 'addSignal' } }))}
                <button type="button" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12.5px] font-medium text-white/45 hover:text-white/75 transition-colors" onClick={() => setSheet({ kind: 'condition', mode: { kind: 'recipes' } })}><Wand2 size={12} />receita</button>
              </>}
        </ChipRow>

        <NavRow tile={<Tile {...TILES.then} icon={<BellRing size={16} />} />} label="Então" value={ACTION_LABEL[action]} onClick={() => setSheet({ kind: 'action' })} />

        <NavRow tile={<Tile {...TILES.rigor} icon={<Gauge size={16} />} />} label="Rigor" value={`${minConf}%${rigorLabel ? ` · ${rigorLabel}` : ''}`} onClick={() => setSheet({ kind: 'rigor' })} />
      </div>

      <RuleReadinessStrip readiness={props.readiness} contract={contract} />
      </div>
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
            {RIGOR_PRESETS.map(p => {
              const on = minConf === p.value
              return (
                <button key={p.label} type="button" onClick={() => onMinConf(p.value)} className="flex-1 h-14 rounded-[12px] border border-white/[0.08] bg-white/[0.03] text-[13px] font-semibold transition-all" style={on ? { borderColor: `${ACCENT}66`, backgroundColor: `${ACCENT}1f`, color: '#fff' } : {}}>
                  <span className={on ? '' : 'text-white/55'}>{p.label}</span>
                  <span className={`block text-[11px] font-normal mt-0.5 ${on ? 'text-white/70' : 'text-white/40'}`}>{p.value}%</span>
                </button>
              )
            })}
          </div>
          <ConfidenceSlider value={minConf} onChange={onMinConf} action={action} />
        </SheetShell>
      )}
    </div>
  )
}
