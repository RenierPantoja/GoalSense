/**
 * RuleBoard — Radar Blueprint 4.0 (single-view bento board, no vertical scroll)
 * ─────────────────────────────────────────────────────────────────────────────
 * A complete redesign: the radar is laid out as a premium bento board that fills
 * the modal body and shows EVERYTHING at once — identity, status, the rule cards
 * (Monitorar / Avaliar quando / Disparar se / Então / Rigor) and a live contract.
 * No inner scroll. Each card opens a dedicated sheet (owned by the modal).
 * Presentation only — all logic stays in the 3.1 layer.
 */
import { type ReactNode } from 'react'
import { Radar, Telescope, Timer, Crosshair, BellRing, Gauge, ShieldCheck, ShieldAlert, ChevronRight, Plus, Wand2, Loader2 } from 'lucide-react'
import type { PatternAction, PatternCondition, PatternScope, PatternSeverity } from '../../../types/commandTypes'
import { formatConditionHuman } from '../../../utils/commandFormatters'
import { getCapability } from '../../../intelligence/radarConditionCapabilities'
import type { RadarContract, RadarReadiness } from '../../../intelligence/radarReadiness'
import type { BackendDiagnostic } from '../dryrun/EngineDiagnosticPanel'
import { RadarConditionChip } from './RadarConditionChip'
import type { ConditionSheetMode } from './ConditionCommandSheet'

const ACCENT = '#2DD4BF'
const ACTION_LABEL: Record<PatternAction, string> = { register_alert: 'Registrar alerta', suggest_only: 'Apenas sugerir', highlight: 'Destacar no Scanner' }
const RIGOR_LABEL: Record<number, string> = { 40: 'Sensível', 50: 'Equilibrado', 70: 'Rigoroso' }
const SEVERITIES: { v: PatternSeverity; label: string; dot: string }[] = [
  { v: 'critical', label: 'Crítico', dot: 'bg-[#FF5A52]' },
  { v: 'attention', label: 'Atenção', dot: 'bg-[#FFB02E]' },
  { v: 'info', label: 'Info', dot: 'bg-[#3B82F6]' },
]
const TILES = {
  brand: { from: '#34E3CB', to: '#0E9E8C' },
  monitor: { from: '#5AA2FF', to: '#2D6FE0' },
  when: { from: '#A78BFA', to: '#7C4DEF' },
  fire: { from: '#4ADE80', to: '#1FA855' },
  then: { from: '#FFC75A', to: '#F08E1B' },
  rigor: { from: '#9AA6B8', to: '#5E6A7D' },
}

export interface RuleBoardProps {
  name: string
  onName: (s: string) => void
  desc: string
  onDesc: (s: string) => void
  severity: PatternSeverity
  onSeverity: (s: PatternSeverity) => void
  scope: PatternScope
  conditions: PatternCondition[]
  onConditions: (c: PatternCondition[]) => void
  action: PatternAction
  minConf: number
  contract: RadarContract
  readiness: RadarReadiness
  reviewed: boolean
  canDiagnose: boolean
  diagLoading: boolean
  lastDiagnostic: BackendDiagnostic | null
  onDiagnose: () => void
  onOpenScope: () => void
  onOpenCondition: (mode: ConditionSheetMode) => void
  onOpenAction: () => void
  onOpenRigor: () => void
}

function Tile({ from, to, size = 30, icon }: { from: string; to: string; size?: number; icon: ReactNode }) {
  return <span className="rounded-[9px] grid place-items-center text-white shrink-0 ring-1 ring-inset ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_5px_rgba(0,0,0,0.35)]" style={{ height: size, width: size, backgroundImage: `linear-gradient(155deg, ${from}, ${to})` }}>{icon}</span>
}

const CARD = 'rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-4 flex flex-col min-h-0 overflow-hidden'

export function RuleBoard(props: RuleBoardProps) {
  const { name, onName, desc, onDesc, severity, onSeverity, conditions, action, minConf, contract, readiness } = props
  const removeCond = (idx: number) => props.onConditions(conditions.filter((_, j) => j !== idx))
  const filters = conditions.map((c, i) => ({ c, i })).filter(({ c }) => getCapability(c.type).kind !== 'signal')
  const signals = conditions.map((c, i) => ({ c, i })).filter(({ c }) => getCapability(c.type).kind === 'signal')

  const blocked = readiness.requirements.length > 0 || readiness.status === 'blocked'
  const ready = readiness.canSavePaused && readiness.requirements.length === 0
  const statusDot = blocked ? 'bg-[#FF5A52]' : ready ? 'bg-[#34D399]' : 'bg-[#FFB02E]'
  const statusHead = props.reviewed && readiness.canActivate ? 'Pronto para ativar' : ready ? 'Pronto para revisão' : blocked ? 'Bloqueado' : readiness.maturityLabel

  const addBtn = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors" style={{ color: ACCENT }}><Plus size={12} />{label}</button>
  )

  const CardLabel = ({ tile, label }: { tile: ReactNode; label: string }) => (
    <div className="flex items-center gap-2.5">{tile}<span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</span></div>
  )

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Band 1 — identity + status */}
      <div className="flex gap-3 h-[128px] shrink-0">
        {/* Identity */}
        <div className={`${CARD} flex-[2] justify-center`}>
          <div className="flex items-center gap-3.5">
            <Tile {...TILES.brand} size={36} icon={<Radar size={20} />} />
            <input value={name} onChange={e => onName(e.target.value)} placeholder="Nomeie este radar" autoFocus aria-invalid={!name.trim()} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[24px] font-semibold tracking-[-0.025em] text-white/92 placeholder:text-white/25 placeholder:font-normal" />
            <div className="inline-flex items-center gap-0.5 rounded-[10px] bg-black/30 p-[3px] shrink-0 ring-1 ring-inset ring-white/[0.05]">
              {SEVERITIES.map(s => (
                <button key={s.v} type="button" onClick={() => onSeverity(s.v)} aria-pressed={severity === s.v} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[8px] text-[11.5px] font-medium transition-all ${severity === s.v ? 'bg-white/[0.16] text-white/95 shadow-[0_1px_2px_rgba(0,0,0,0.35)]' : 'text-white/45 hover:text-white/75'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
                </button>
              ))}
            </div>
          </div>
          <input value={desc} onChange={e => onDesc(e.target.value)} placeholder="Descrição opcional" className="mt-2.5 pl-[50px] bg-transparent border-0 outline-none text-[12.5px] text-white/55 placeholder:text-white/25" />
        </div>

        {/* Status */}
        <div className={`${CARD} flex-1 justify-center`}>
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
            <span className="text-[15px] font-semibold text-white/90">{statusHead}</span>
          </div>
          <div className="flex items-center gap-5 mt-2.5">
            <div><span className="text-[20px] font-bold tabular-nums text-white/90 leading-none">{contract.eligibilityConditions.length}</span><span className="block text-[10px] text-white/40 mt-0.5">Filtros</span></div>
            <div className="h-7 w-px bg-white/[0.08]" />
            <div><span className={`text-[20px] font-bold tabular-nums leading-none ${signals.length > 0 ? 'text-[#34D399]' : 'text-[#FFB02E]'}`}>{contract.signalConditions.length}</span><span className="block text-[10px] text-white/40 mt-0.5">Sinais reais</span></div>
          </div>
        </div>
      </div>

      {/* Band 2 — the three rule cards */}
      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
        {/* Monitorar */}
        <button type="button" onClick={props.onOpenScope} className={`${CARD} text-left hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors`}>
          <div className="flex items-center justify-between"><CardLabel tile={<Tile {...TILES.monitor} icon={<Telescope size={16} />} />} label="Monitorar" /><ChevronRight size={16} className="text-white/25" /></div>
          <div className="mt-auto"><p className="text-[16px] font-semibold text-white/90 tracking-[-0.01em]">{contract.scopeLabel}</p><p className="text-[11.5px] text-white/40 mt-0.5">universo de partidas avaliadas</p></div>
        </button>

        {/* Avaliar quando (filtros) */}
        <div className={CARD}>
          <CardLabel tile={<Tile {...TILES.when} icon={<Timer size={16} />} />} label="Avaliar quando" />
          <div className="mt-auto flex items-end justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {filters.slice(0, 4).map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => props.onOpenCondition({ kind: 'edit', index: i })} onRemove={() => removeCond(i)} />)}
              {filters.length > 4 && <span className="text-[11px] text-white/40">+{filters.length - 4}</span>}
              {addBtn('filtro', () => props.onOpenCondition({ kind: 'addFilter' }))}
            </div>
          </div>
        </div>

        {/* Disparar se (sinais) — hero */}
        <div className={`${CARD} ring-1 ring-inset ring-[#34D399]/15 bg-[#34D399]/[0.04]`}>
          <CardLabel tile={<Tile {...TILES.fire} icon={<Crosshair size={16} />} />} label="Disparar se" />
          <div className="mt-auto">
            {signals.length === 0
              ? <button type="button" onClick={() => props.onOpenCondition({ kind: 'addSignal' })} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium border border-dashed border-[#34D399]/40 text-[#7FE7B5] hover:bg-[#34D399]/10 transition-colors"><Plus size={13} />adicionar sinal real</button>
              : <div className="flex items-center gap-1.5 flex-wrap">
                  {signals.slice(0, 4).map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => props.onOpenCondition({ kind: 'edit', index: i })} onRemove={() => removeCond(i)} />)}
                  {signals.length > 4 && <span className="text-[11px] text-white/40">+{signals.length - 4}</span>}
                  {addBtn('sinal', () => props.onOpenCondition({ kind: 'addSignal' }))}
                  <button type="button" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium text-white/45 hover:text-white/75 transition-colors" onClick={() => props.onOpenCondition({ kind: 'recipes' })}><Wand2 size={12} />receita</button>
                </div>}
          </div>
        </div>
      </div>

      {/* Band 3 — action + rigor + contract */}
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
        {/* Então */}
        <button type="button" onClick={props.onOpenAction} className={`${CARD} col-span-3 text-left hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors`}>
          <div className="flex items-center justify-between"><CardLabel tile={<Tile {...TILES.then} icon={<BellRing size={16} />} />} label="Então" /><ChevronRight size={16} className="text-white/25" /></div>
          <p className="mt-auto text-[15px] font-semibold text-white/90">{ACTION_LABEL[action]}</p>
        </button>

        {/* Rigor */}
        <button type="button" onClick={props.onOpenRigor} className={`${CARD} col-span-3 text-left hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors`}>
          <div className="flex items-center justify-between"><CardLabel tile={<Tile {...TILES.rigor} icon={<Gauge size={16} />} />} label="Rigor" /><ChevronRight size={16} className="text-white/25" /></div>
          <p className="mt-auto text-[15px] font-semibold text-white/90">{minConf}%<span className="text-white/45 font-normal text-[13px]"> · {RIGOR_LABEL[minConf] || 'Personalizado'}</span></p>
        </button>

        {/* Contract / readiness */}
        <div className={`${CARD} col-span-6`}>
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">Contrato</span>
            <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[10.5px] font-medium border ${contract.backendCompatibility.compatible ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#7FE7B5]' : 'border-[#FF5A52]/25 bg-[#FF5A52]/10 text-[#FF9D96]'}`}>{contract.backendCompatibility.compatible ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}{contract.backendCompatibility.compatible ? 'Compatível' : 'Incompatível'}</span>
          </div>

          <div className="mt-2 space-y-1 text-[12px] leading-snug overflow-hidden">
            {blocked
              ? readiness.requirements.slice(0, 2).map((r, i) => <p key={i} className="text-white/55 flex items-start gap-1.5"><span className="mt-[6px] h-1 w-1 rounded-full bg-[#FF5A52]/70 shrink-0" />{r}</p>)
              : <>
                  <p className="text-white/70"><span className="text-white/40">Quando </span>{contract.eligibilityConditions.length ? contract.eligibilityConditions.map(formatConditionHuman).join(' · ') : 'ao vivo'}</p>
                  <p className="text-white/85"><span className="text-white/40">Dispara se </span>{contract.signalConditions.length ? contract.signalConditions.map(formatConditionHuman).join(' · ') : '—'}</p>
                  <p className="text-white/70"><span className="text-white/40">Então </span>{ACTION_LABEL[action].toLowerCase()}{contract.resolutionMode === 'tracked' ? ' + resolução automática' : ''} · ≥ {minConf}%</p>
                </>}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-1 flex-wrap">
              {readiness.dataDependencies.slice(0, 4).map(d => <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/55">{d}</span>)}
            </div>
            <button onClick={props.onDiagnose} disabled={!props.canDiagnose || props.diagLoading} type="button" className="inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0 disabled:opacity-35 disabled:cursor-not-allowed transition-colors" style={{ color: ACCENT }}>
              {props.diagLoading ? <><Loader2 size={13} className="animate-spin" />Verificando…</> : <>Verificar ao vivo<ChevronRight size={13} className="opacity-60" /></>}
            </button>
          </div>
          {props.lastDiagnostic && <p className="text-[10.5px] text-white/40 mt-1">{props.lastDiagnostic.evaluatedFixtures} avaliadas · <span className={props.lastDiagnostic.wouldTrigger > 0 ? 'text-[#34D399]' : ''}>{props.lastDiagnostic.wouldTrigger} disparos</span></p>}
        </div>
      </div>
    </div>
  )
}
