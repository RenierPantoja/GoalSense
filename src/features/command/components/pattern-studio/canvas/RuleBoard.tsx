/**
 * RuleBoard — Radar Blueprint 4.1 (premium bento board, single view)
 * ─────────────────────────────────────────────────────────────────────────────
 * High-end, depth-rich bento that shows the whole radar at once — no scroll.
 * Each card has its own tinted material, top light edge, soft shadow and hover
 * lift. Apple-style progress rings (status), a circular rigor gauge and subtle
 * icon watermarks give richness without clutter. Each card opens a dedicated
 * sheet (owned by the modal). Presentation only — logic stays in the 3.1 layer.
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

function Tile({ from, to, size = 32, icon }: { from: string; to: string; size?: number; icon: ReactNode }) {
  return <span className="rounded-[10px] grid place-items-center text-white shrink-0 ring-1 ring-inset ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_8px_rgba(0,0,0,0.4)]" style={{ height: size, width: size, backgroundImage: `linear-gradient(155deg, ${from}, ${to})` }}>{icon}</span>
}

/** Apple-style progress ring. */
function Ring({ size, stroke, value, max, color, children }: { size: number; stroke: number; value: number; max: number; color: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = max <= 0 ? 0 : Math.min(1, value / max)
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${circ * pct} ${circ}`} style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      </svg>
      {children && <span className="absolute inset-0 grid place-items-center">{children}</span>}
    </span>
  )
}

/** Premium card surface with tint, top light edge and hover lift. */
function Card({ tint, className = '', children, onClick }: { tint: string; className?: string; children: ReactNode; onClick?: () => void }) {
  const base = 'group relative rounded-[18px] border border-white/[0.08] overflow-hidden transition-all duration-200 p-[18px] flex flex-col min-h-0'
  const style: React.CSSProperties = {
    backgroundColor: '#202023',
    backgroundImage: `radial-gradient(130% 110% at 0% 0%, ${tint}1f, transparent 55%)`,
    boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 24px -16px rgba(0,0,0,0.7)',
  }
  if (onClick) return <button type="button" onClick={onClick} style={style} className={`${base} text-left hover:border-white/[0.14] hover:-translate-y-[1px] hover:shadow-[0_18px_34px_-18px_rgba(0,0,0,0.75)] ${className}`}><Edge />{children}</button>
  return <div style={style} className={`${base} ${className}`}><Edge />{children}</div>
}
function Edge() { return <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" /> }

export function RuleBoard(props: RuleBoardProps) {
  const { name, onName, desc, onDesc, severity, onSeverity, conditions, action, minConf, contract, readiness } = props
  const removeCond = (idx: number) => props.onConditions(conditions.filter((_, j) => j !== idx))
  const filters = conditions.map((c, i) => ({ c, i })).filter(({ c }) => getCapability(c.type).kind !== 'signal')
  const signals = conditions.map((c, i) => ({ c, i })).filter(({ c }) => getCapability(c.type).kind === 'signal')

  const blocked = readiness.requirements.length > 0 || readiness.status === 'blocked'
  const ready = readiness.canSavePaused && readiness.requirements.length === 0
  const stateColor = blocked ? '#FF5A52' : ready ? '#34D399' : '#FFB02E'
  const statusHead = props.reviewed && readiness.canActivate ? 'Pronto para ativar' : ready ? 'Pronto para revisão' : blocked ? 'Bloqueado' : readiness.maturityLabel
  const statusMsg = props.reviewed && readiness.canActivate ? 'Contrato confirmado.' : ready ? 'Revise para ativar.' : readiness.primaryMessage

  const addBtn = (label: string, onClick: () => void, hero?: boolean) => (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors ${hero ? 'border border-dashed border-[#34D399]/45 text-[#7FE7B5] hover:bg-[#34D399]/10 h-8 px-3' : 'hover:bg-white/[0.06]'}`} style={hero ? undefined : { color: ACCENT }}><Plus size={hero ? 13 : 12} />{label}</button>
  )

  const Head = ({ tile, label, chevron, watermark }: { tile: ReactNode; label: string; chevron?: boolean; watermark?: ReactNode }) => (
    <>
      {watermark && <span className="pointer-events-none absolute -right-4 -bottom-3 text-white/[0.035] group-hover:text-white/[0.05] transition-colors">{watermark}</span>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">{tile}<span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-white/45">{label}</span></div>
        {chevron && <ChevronRight size={16} className="text-white/25 group-hover:text-white/45 group-hover:translate-x-0.5 transition-all" />}
      </div>
    </>
  )

  return (
    <div className="h-full flex flex-col gap-3.5">
      {/* Band 1 — identity + status */}
      <div className="flex gap-3.5 h-[132px] shrink-0">
        <Card tint="#2DD4BF" className="flex-[2] justify-center">
          <span className="pointer-events-none absolute -left-8 -top-8 h-28 w-28 rounded-full bg-[#2DD4BF]/12 blur-2xl" />
          <div className="relative flex items-center gap-3.5">
            <Tile {...TILES.brand} size={38} icon={<Radar size={21} />} />
            <input value={name} onChange={e => onName(e.target.value)} placeholder="Nomeie este radar" autoFocus aria-invalid={!name.trim()} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[25px] font-semibold tracking-[-0.03em] text-white/95 placeholder:text-white/25 placeholder:font-normal" />
            <div className="inline-flex items-center gap-0.5 rounded-[11px] bg-black/35 p-[3px] shrink-0 ring-1 ring-inset ring-white/[0.06]">
              {SEVERITIES.map(s => (
                <button key={s.v} type="button" onClick={() => onSeverity(s.v)} aria-pressed={severity === s.v} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[8px] text-[11.5px] font-medium transition-all ${severity === s.v ? 'bg-white/[0.16] text-white/95 shadow-[0_1px_2px_rgba(0,0,0,0.4)]' : 'text-white/45 hover:text-white/75'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
                </button>
              ))}
            </div>
          </div>
          <input value={desc} onChange={e => onDesc(e.target.value)} placeholder="Descrição opcional" className="relative mt-2.5 pl-[52px] bg-transparent border-0 outline-none text-[12.5px] text-white/55 placeholder:text-white/25" />
        </Card>

        <Card tint={stateColor} className="flex-1 justify-center">
          <div className="flex items-center gap-4">
            <Ring size={66} stroke={6} value={contract.eligibilityConditions.length} max={Math.max(4, contract.eligibilityConditions.length)} color="#5AA2FF">
              <Ring size={46} stroke={6} value={contract.signalConditions.length} max={Math.max(4, contract.signalConditions.length)} color="#34D399">
                <span className={`text-[15px] font-bold tabular-nums ${signals.length > 0 ? 'text-[#34D399]' : 'text-white/40'}`}>{contract.signalConditions.length}</span>
              </Ring>
            </Ring>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: stateColor }} /><span className="text-[14px] font-semibold text-white/90 truncate">{statusHead}</span></div>
              <p className="text-[11.5px] text-white/45 mt-1 leading-snug truncate">{statusMsg}</p>
              <div className="flex items-center gap-3 mt-1.5 text-[10.5px] text-white/40">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#5AA2FF]" />{contract.eligibilityConditions.length} filtros</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />{contract.signalConditions.length} sinais</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Band 2 — the three rule cards */}
      <div className="grid grid-cols-3 gap-3.5 flex-1 min-h-0">
        <Card tint="#3B82F6" onClick={props.onOpenScope}>
          <Head tile={<Tile {...TILES.monitor} icon={<Telescope size={17} />} />} label="Monitorar" chevron watermark={<Telescope size={104} strokeWidth={1} />} />
          <div className="relative mt-auto"><p className="text-[19px] font-semibold text-white/92 tracking-[-0.015em]">{contract.scopeLabel}</p><p className="text-[11.5px] text-white/40 mt-0.5">universo de partidas avaliadas</p></div>
        </Card>

        <Card tint="#7C4DEF">
          <Head tile={<Tile {...TILES.when} icon={<Timer size={17} />} />} label="Avaliar quando" watermark={<Timer size={104} strokeWidth={1} />} />
          <div className="relative mt-auto flex items-center gap-1.5 flex-wrap">
            {filters.slice(0, 4).map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => props.onOpenCondition({ kind: 'edit', index: i })} onRemove={() => removeCond(i)} />)}
            {filters.length > 4 && <span className="text-[11px] text-white/40">+{filters.length - 4}</span>}
            {addBtn('filtro', () => props.onOpenCondition({ kind: 'addFilter' }))}
          </div>
        </Card>

        {/* Hero — Disparar se */}
        <Card tint="#1FA855" className="ring-1 ring-inset ring-[#34D399]/15">
          <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#34D399]/12 blur-2xl" />
          <Head tile={<Tile {...TILES.fire} icon={<Crosshair size={17} />} />} label="Disparar se" watermark={<Crosshair size={108} strokeWidth={1} />} />
          <div className="relative mt-auto">
            {signals.length === 0
              ? <>
                  {addBtn('adicionar sinal real', () => props.onOpenCondition({ kind: 'addSignal' }), true)}
                  <p className="text-[11px] text-white/35 mt-2">o sinal real é o que dispara o radar</p>
                </>
              : <div className="flex items-center gap-1.5 flex-wrap">
                  {signals.slice(0, 4).map(({ c, i }) => <RadarConditionChip key={i} condition={c} onEdit={() => props.onOpenCondition({ kind: 'edit', index: i })} onRemove={() => removeCond(i)} />)}
                  {signals.length > 4 && <span className="text-[11px] text-white/40">+{signals.length - 4}</span>}
                  {addBtn('sinal', () => props.onOpenCondition({ kind: 'addSignal' }))}
                  <button type="button" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium text-white/45 hover:text-white/75 transition-colors" onClick={() => props.onOpenCondition({ kind: 'recipes' })}><Wand2 size={12} />receita</button>
                </div>}
          </div>
        </Card>
      </div>

      {/* Band 3 — action + rigor + contract */}
      <div className="grid grid-cols-12 gap-3.5 flex-1 min-h-0">
        <Card tint="#F08E1B" className="col-span-3" onClick={props.onOpenAction}>
          <Head tile={<Tile {...TILES.then} icon={<BellRing size={17} />} />} label="Então" chevron watermark={<BellRing size={96} strokeWidth={1} />} />
          <p className="relative mt-auto text-[16px] font-semibold text-white/92">{ACTION_LABEL[action]}</p>
        </Card>

        <Card tint="#5E6A7D" className="col-span-3" onClick={props.onOpenRigor}>
          <Head tile={<Tile {...TILES.rigor} icon={<Gauge size={17} />} />} label="Rigor" chevron />
          <div className="relative mt-auto flex items-center gap-3">
            <Ring size={52} stroke={6} value={minConf} max={100} color={ACCENT}><span className="text-[12px] font-bold tabular-nums text-white/90">{minConf}</span></Ring>
            <div><p className="text-[14px] font-semibold text-white/90">{RIGOR_LABEL[minConf] || 'Personalizado'}</p><p className="text-[11px] text-white/40">confiança mínima</p></div>
          </div>
        </Card>

        <Card tint="#8E8E93" className="col-span-6">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-white/45">Contrato</span>
            <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[10.5px] font-medium border ${contract.backendCompatibility.compatible ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#7FE7B5]' : 'border-[#FF5A52]/25 bg-[#FF5A52]/10 text-[#FF9D96]'}`}>{contract.backendCompatibility.compatible ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}{contract.backendCompatibility.compatible ? 'Compatível' : 'Incompatível'}</span>
          </div>
          <div className="mt-2.5 space-y-1.5 text-[12px] leading-snug overflow-hidden">
            {blocked
              ? readiness.requirements.slice(0, 2).map((r, i) => <p key={i} className="text-white/55 flex items-start gap-2"><span className="mt-[6px] h-1 w-1 rounded-full bg-[#FF5A52]/70 shrink-0" />{r}</p>)
              : <>
                  <p className="text-white/70"><span className="text-white/35">Quando </span>{contract.eligibilityConditions.length ? contract.eligibilityConditions.map(formatConditionHuman).join(' · ') : 'ao vivo'}</p>
                  <p className="text-white/88"><span className="text-white/35">Dispara se </span>{contract.signalConditions.length ? contract.signalConditions.map(formatConditionHuman).join(' · ') : '—'}</p>
                  <p className="text-white/70"><span className="text-white/35">Então </span>{ACTION_LABEL[action].toLowerCase()}{contract.resolutionMode === 'tracked' ? ' + resolução automática' : ''} · ≥ {minConf}%</p>
                </>}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
            <div className="flex items-center gap-1 flex-wrap">
              {readiness.dataDependencies.slice(0, 4).map(d => <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/55">{d}</span>)}
            </div>
            <button onClick={props.onDiagnose} disabled={!props.canDiagnose || props.diagLoading} type="button" className="inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0 disabled:opacity-35 disabled:cursor-not-allowed transition-colors" style={{ color: ACCENT }}>
              {props.diagLoading ? <><Loader2 size={13} className="animate-spin" />Verificando…</> : <>Verificar ao vivo<ChevronRight size={13} className="opacity-60" /></>}
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
