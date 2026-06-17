/**
 * NativeRuleCanvas — Radar Blueprint 3.2 (Native Rule Canvas)
 * ─────────────────────────────────────────────────────────────────────────────
 * The radar is composed as an editable operational sentence — not a wizard.
 * Each line is a real part of the engine contract, edited inline via contextual
 * sheets/popovers. Filters (eligibility) and real signals are visually separated.
 *
 * All logic stays in the 3.1 layer: this is presentation only. Conditions emitted
 * are byte-identical; capability/kind come from the capability matrix.
 */
import { useMemo, useState } from 'react'
import { Plus, Search, Sparkles, X, AlertTriangle, ChevronDown } from 'lucide-react'
import type { PatternAction, PatternCondition, PatternScope, PatternSeverity, FixtureStatsForPattern } from '../../../types/commandTypes'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { COND_LABELS, formatConditionHuman } from '../../../utils/commandFormatters'
import { TRIGGER_BY_TYPE, TRIGGER_CATEGORY_LABELS, TRIGGER_LIBRARY, type TriggerCategory, type TriggerSpec } from '../../../intelligence/triggerLibrary'
import { TRIGGER_RECIPES, type TriggerRecipe } from '../../../intelligence/triggerRecipes'
import { getCapability } from '../../../intelligence/radarConditionCapabilities'
import type { RadarContract } from '../../../intelligence/radarReadiness'
import { clampParam } from '../../../utils/patternStudioHelpers'
import { ParamField } from '../triggers/ParamField'
import { ScopePicker } from '../scope/ScopePicker'
import { ActionCardPicker } from '../form-controls/ActionCardPicker'
import { ConfidenceSlider } from '../form-controls/ConfidenceSlider'

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
  // dry-run params kept for future inline diagnostics (unused here)
  statsMap?: Map<number, FixtureStatsForPattern>
}

type Sheet =
  | { kind: 'none' }
  | { kind: 'add'; target: 'eligibility' | 'signal' }
  | { kind: 'recipes' }
  | { kind: 'scope' }
  | { kind: 'action' }
  | { kind: 'rigor' }
  | { kind: 'edit'; index: number }

const KIND_CHIP: Record<string, string> = {
  supported_eligibility: 'bg-white/[0.05] border-white/[0.1] text-white/80',
  supported_signal: 'bg-emerald-500/10 border-emerald-400/25 text-emerald-100',
  partial: 'bg-amber-500/10 border-amber-400/25 text-amber-100',
  unsupported: 'bg-rose-500/10 border-rose-400/25 text-rose-100',
}

function chipClass(c: PatternCondition): string {
  const cap = getCapability(c.type)
  if (cap.backendSupport === 'unsupported') return KIND_CHIP.unsupported
  if (cap.backendSupport === 'partial') return KIND_CHIP.partial
  return cap.kind === 'signal' ? KIND_CHIP.supported_signal : KIND_CHIP.supported_eligibility
}

export function NativeRuleCanvas(props: NativeRuleCanvasProps) {
  const { name, onName, severity, onSeverity, conditions, onConditions, action, onAction, minConf, onMinConf, contract } = props
  const { desc, onDesc } = props
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' })
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<TriggerCategory | 'all'>('all')
  const [addTab, setAddTab] = useState<'supported' | 'partial' | 'unsupported'>('supported')

  const usedTypes = useMemo(() => new Set(conditions.map(c => c.type)), [conditions])
  const filters = conditions.map((c, i) => ({ c, i })).filter(({ c }) => getCapability(c.type).kind !== 'signal')
  const signals = conditions.map((c, i) => ({ c, i })).filter(({ c }) => getCapability(c.type).kind === 'signal')

  const close = () => { setSheet({ kind: 'none' }); setQuery(''); setCategory('all') }
  const openAdd = (target: 'eligibility' | 'signal') => { setSheet({ kind: 'add', target }); setQuery(''); setCategory('all'); setAddTab('supported') }
  const addTrigger = (spec: TriggerSpec) => { if (!usedTypes.has(spec.type)) onConditions([...conditions, { type: spec.type, params: { ...spec.defaultParams } }]) }
  const removeCond = (idx: number) => onConditions(conditions.filter((_, j) => j !== idx))
  const updateParam = (idx: number, key: string, raw: number) => {
    const c = conditions[idx]; const spec = TRIGGER_BY_TYPE[c.type]; const next = clampParam(key, raw, spec?.paramBounds?.[key])
    onConditions(conditions.map((cc, i) => i === idx ? { ...cc, params: { ...cc.params, [key]: next } } : cc))
  }
  const applyRecipe = (r: TriggerRecipe) => {
    const next = [...conditions]
    for (const c of r.conditions) if (!next.some(e => e.type === c.type)) next.push({ type: c.type, params: { ...c.params } })
    onConditions(next); close()
  }

  // Library filtered for the add sheet, scoped to the requested kind
  const addTarget = sheet.kind === 'add' ? sheet.target : 'signal'
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = TRIGGER_LIBRARY.filter(t => {
      const cap = getCapability(t.type)
      const isSignal = cap.kind === 'signal'
      if (addTarget === 'signal' ? !isSignal : isSignal) return false
      if (category !== 'all' && t.category !== category) return false
      if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
      return true
    })
    const supported: TriggerSpec[] = [], partial: TriggerSpec[] = [], unsupported: TriggerSpec[] = []
    for (const t of list) {
      const s = getCapability(t.type).backendSupport
      if (s === 'supported') supported.push(t); else if (s === 'partial') partial.push(t); else unsupported.push(t)
    }
    return { supported, partial, unsupported }
  }, [query, category, addTarget])

  const renderChip = ({ c, i }: { c: PatternCondition; i: number }) => {
    const spec = TRIGGER_BY_TYPE[c.type]
    const cap = getCapability(c.type)
    const editable = ['min', 'max', 'value', 'maxDiff', 'minutes'].some(k => c.params[k] !== undefined)
    return (
      <span key={i} className={`group inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-lg border text-[12px] font-medium ${chipClass(c)}`}>
        {cap.backendSupport === 'unsupported' && <AlertTriangle size={11} className="opacity-80" />}
        <button type="button" onClick={() => editable ? setSheet({ kind: 'edit', index: i }) : undefined} className={editable ? 'hover:underline decoration-dotted underline-offset-2' : 'cursor-default'} title={editable ? 'Editar valores' : undefined}>
          {spec?.title || COND_LABELS[c.type] || c.type}
        </button>
        <button type="button" onClick={() => removeCond(i)} aria-label="Remover condição" className="h-5 w-5 rounded flex items-center justify-center text-current/60 hover:bg-black/20 opacity-50 group-hover:opacity-100 transition-opacity"><X size={11} /></button>
      </span>
    )
  }

  const pill = (label: React.ReactNode, onClick: () => void, opts?: { tone?: 'default' | 'muted' | 'warn'; chevron?: boolean }) => (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[12px] font-medium transition-colors ${opts?.tone === 'muted' ? 'border-white/[0.08] bg-white/[0.02] text-white/55 hover:text-white/80' : opts?.tone === 'warn' ? 'border-amber-400/25 bg-amber-500/[0.06] text-amber-100' : 'border-white/[0.1] bg-white/[0.04] text-white/85 hover:bg-white/[0.07]'}`}>
      {label}{opts?.chevron !== false && <ChevronDown size={12} className="opacity-50" />}
    </button>
  )

  const Line = ({ kicker, children }: { kicker: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 w-[104px] shrink-0 pt-1.5">{kicker}</span>
      <div className="flex items-center gap-1.5 flex-wrap min-h-[28px] flex-1">{children}</div>
    </div>
  )

  const editCond = sheet.kind === 'edit' ? conditions[sheet.index] : null
  const editSpec = editCond ? TRIGGER_BY_TYPE[editCond.type] : undefined

  return (
    <div className="relative">
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.018] to-transparent px-5 py-2">
        {/* Radar name — editorial inline */}
        <div className="flex items-center gap-3 py-3 border-b border-white/[0.04]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 w-[104px] shrink-0">Radar</span>
          <input
            value={name}
            onChange={e => onName(e.target.value)}
            placeholder="Nomeie este radar"
            autoFocus
            aria-invalid={!name.trim()}
            className={`flex-1 bg-transparent border-0 outline-none text-[20px] font-semibold tracking-tight placeholder:text-white/25 placeholder:font-normal ${name.trim() ? 'text-white/95' : 'text-white/95'}`}
          />
          <div className="flex items-center gap-1 shrink-0">
            {SEVERITIES.map(s => (
              <button key={s.v} type="button" onClick={() => onSeverity(s.v)} aria-pressed={severity === s.v} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors ${severity === s.v ? 'border-white/[0.18] bg-white/[0.06] text-white/90' : 'border-transparent text-white/45 hover:text-white/70'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description — subtle secondary line */}
        <div className="flex items-center gap-3 py-2 border-b border-white/[0.04]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 w-[104px] shrink-0">Nota</span>
          <input value={desc} onChange={e => onDesc(e.target.value)} placeholder="Descrição opcional — quando este radar é útil" className="flex-1 bg-transparent border-0 outline-none text-[12.5px] text-white/75 placeholder:text-white/25" />
        </div>

        <Line kicker="Monitorar">
          {pill(contract.scopeLabel, () => setSheet({ kind: 'scope' }), { tone: props.scope === 'all' ? 'muted' : 'default' })}
        </Line>

        <Line kicker="Avaliar quando">
          {filters.map(renderChip)}
          {pill(<><Plus size={12} />filtro</>, () => openAdd('eligibility'), { chevron: false, tone: 'muted' })}
        </Line>

        <Line kicker="Disparar se">
          {signals.length === 0
            ? pill(<><Plus size={12} />adicionar sinal real</>, () => openAdd('signal'), { chevron: false, tone: 'warn' })
            : <>
                {signals.map(renderChip)}
                {pill(<><Plus size={12} />sinal real</>, () => openAdd('signal'), { chevron: false, tone: 'muted' })}
                {pill(<><Sparkles size={11} />receita</>, () => setSheet({ kind: 'recipes' }), { chevron: false, tone: 'muted' })}
              </>}
        </Line>

        <Line kicker="Então">
          {pill(ACTION_LABEL[action], () => setSheet({ kind: 'action' }))}
        </Line>

        <Line kicker="Com rigor">
          {pill(`${minConf}% · ${RIGOR_PRESETS.find(p => p.value === minConf)?.label || 'Personalizado'}`, () => setSheet({ kind: 'rigor' }))}
        </Line>
      </div>

      {/* ───────────── Sheets ───────────── */}
      {sheet.kind === 'add' && (
        <SheetShell title={addTarget === 'signal' ? 'Adicionar sinal real' : 'Adicionar filtro'} onClose={close} footer={<span className="text-[10.5px] text-white/40">{conditions.length} condição(ões) ativa(s)</span>}>
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={query} onChange={e => setQuery(e.target.value)} autoFocus placeholder="Buscar..." className="w-full h-9 pl-8 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/25" />
          </div>
          <div className="flex items-center gap-1 flex-wrap mb-3">
            <button onClick={() => setCategory('all')} type="button" className={`px-2.5 py-1 rounded-lg text-[10.5px] font-medium ${category === 'all' ? 'bg-white/[0.08] text-white/95 border border-white/[0.14]' : 'text-white/50 hover:text-white/80 border border-transparent'}`}>Todas</button>
            {(Object.keys(TRIGGER_CATEGORY_LABELS) as TriggerCategory[]).map(cat => (
              <button key={cat} onClick={() => setCategory(cat)} type="button" className={`px-2.5 py-1 rounded-lg text-[10.5px] font-medium ${category === cat ? 'bg-white/[0.08] text-white/95 border border-white/[0.14]' : 'text-white/50 hover:text-white/80 border border-transparent'}`}>{TRIGGER_CATEGORY_LABELS[cat]}</button>
            ))}
          </div>
          {grouped.supported.length === 0 && grouped.partial.length === 0 && grouped.unsupported.length === 0 && <p className="text-center text-[11px] text-white/40 py-6">Nada encontrado.</p>}
          {(grouped.supported.length + grouped.partial.length + grouped.unsupported.length) > 0 && (
            <>
              <div className="flex items-center gap-1 mb-3">
                {([
                  { k: 'supported' as const, label: 'Executáveis', n: grouped.supported.length },
                  { k: 'partial' as const, label: 'Parciais', n: grouped.partial.length },
                  { k: 'unsupported' as const, label: 'Não executáveis', n: grouped.unsupported.length },
                ]).map(t => (
                  <button key={t.k} type="button" onClick={() => setAddTab(t.k)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${addTab === t.k ? 'bg-white/[0.08] text-white/95 border border-white/[0.14]' : 'text-white/50 hover:text-white/80 border border-transparent'}`}>{t.label}<span className="ml-1 text-[10px] tabular-nums opacity-60">{t.n}</span></button>
                ))}
              </div>
              {addTab === 'supported' && <AddGroup label="Disponíveis para ativação" tone="emerald" specs={grouped.supported} usedTypes={usedTypes} onAdd={addTrigger} />}
              {addTab === 'partial' && <AddGroup label="Cobertura variável por provedor" tone="amber" specs={grouped.partial} usedTypes={usedTypes} onAdd={addTrigger} />}
              {addTab === 'unsupported' && <AddGroup label="Ainda não executável pelo backend" tone="rose" specs={grouped.unsupported} usedTypes={usedTypes} onAdd={addTrigger} note="Podem ser usadas no motor local, mas impedem a ativação." />}
              {addTab === 'supported' && grouped.supported.length === 0 && <p className="text-center text-[11px] text-white/40 py-4">Nenhuma condição executável nesta busca.</p>}
              {addTab === 'partial' && grouped.partial.length === 0 && <p className="text-center text-[11px] text-white/40 py-4">Nenhuma condição parcial nesta busca.</p>}
              {addTab === 'unsupported' && grouped.unsupported.length === 0 && <p className="text-center text-[11px] text-white/40 py-4">Nenhuma condição não executável nesta busca.</p>}
            </>
          )}
        </SheetShell>
      )}

      {sheet.kind === 'recipes' && (
        <SheetShell title="Receitas rápidas" onClose={close}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TRIGGER_RECIPES.map(r => {
              const unsup = r.conditions.filter(c => getCapability(c.type).backendSupport === 'unsupported')
              const hasSignal = r.conditions.some(c => getCapability(c.type).kind === 'signal')
              const executable = unsup.length === 0 && hasSignal
              return (
                <div key={r.id} className="rounded-xl border border-white/[0.07] bg-white/[0.014] px-3.5 py-3 flex flex-col">
                  <p className="text-[12.5px] font-semibold text-white/90 leading-tight">{r.title}</p>
                  <p className="text-[10.5px] text-white/50 mt-1 leading-snug flex-1">{r.description}</p>
                  <div className="mt-2">{executable ? <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-emerald-500/10 border-emerald-400/20 text-emerald-200">Executável pelo backend</span> : <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-400/20 text-amber-200">{unsup.length > 0 ? 'Contém condição não executável' : 'Sem sinal real'}</span>}</div>
                  <button onClick={() => applyRecipe(r)} type="button" className="mt-2.5 h-8 rounded-lg text-[11px] font-semibold text-cyan-200 bg-cyan-500/12 border border-cyan-400/20 hover:bg-cyan-500/20 transition-colors">Aplicar</button>
                </div>
              )
            })}
          </div>
        </SheetShell>
      )}

      {sheet.kind === 'scope' && (
        <SheetShell title="Onde monitorar" onClose={close} footer={<button onClick={close} type="button" className="h-8 px-4 rounded-lg text-[11px] font-semibold text-white/90 bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.1]">Concluir</button>}>
          <ScopePicker
            scope={props.scope} scopeFilter={props.scopeFilter} matches={props.matchesFilter}
            excludeLeagues={props.excludeLeagues} excludeTeams={props.excludeTeams} excludeMatches={props.excludeMatches}
            requireRichData={props.requireRichData} onlyLive={props.onlyLive} onlyPreMatch={props.onlyPreMatch}
            availableMatches={props.availableMatches} availableLeaguesRich={props.availableLeaguesRich} availableTeamsRich={props.availableTeamsRich}
            onScopeChange={props.onScope} onScopeFilterChange={props.onScopeFilter} onMatchesChange={props.onMatches}
            onExcludeLeaguesChange={props.onExcludeLeagues} onExcludeTeamsChange={props.onExcludeTeams} onExcludeMatchesChange={props.onExcludeMatches}
            onAdvancedToggle={props.onAdvancedToggle}
          />
        </SheetShell>
      )}

      {sheet.kind === 'action' && (
        <SheetShell title="Ação ao disparar" onClose={close}>
          <ActionCardPicker value={action} onChange={a => { onAction(a); close() }} />
        </SheetShell>
      )}

      {sheet.kind === 'rigor' && (
        <SheetShell title="Rigor do radar" onClose={close}>
          <div className="flex items-center gap-1.5 mb-4">
            {RIGOR_PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => onMinConf(p.value)} className={`flex-1 h-9 rounded-lg border text-[11.5px] font-semibold transition-colors ${minConf === p.value ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200' : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/85'}`}>{p.label}<span className="block text-[9.5px] font-normal opacity-60">{p.value}%</span></button>
            ))}
          </div>
          <ConfidenceSlider value={minConf} onChange={onMinConf} action={action} />
        </SheetShell>
      )}

      {sheet.kind === 'edit' && editCond && (
        <SheetShell title={`Editar · ${editSpec?.title || editCond.type}`} onClose={close} footer={<button onClick={close} type="button" className="h-8 px-4 rounded-lg text-[11px] font-semibold text-white/90 bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.1]">Concluir</button>}>
          <p className="text-[12px] text-white/60 mb-3">{formatConditionHuman(editCond)}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {editCond.params.min !== undefined && editCond.params.max !== undefined && (
              <><ParamField idx={sheet.index} cond={editCond} keyName="min" onChange={updateParam} spec={editSpec} /><span className="text-[10px] text-white/35 font-medium">até</span><ParamField idx={sheet.index} cond={editCond} keyName="max" onChange={updateParam} spec={editSpec} /></>
            )}
            {editCond.params.value !== undefined && <ParamField idx={sheet.index} cond={editCond} keyName="value" onChange={updateParam} spec={editSpec} />}
            {editCond.params.maxDiff !== undefined && <ParamField idx={sheet.index} cond={editCond} keyName="maxDiff" onChange={updateParam} spec={editSpec} />}
            {editCond.params.minutes !== undefined && <ParamField idx={sheet.index} cond={editCond} keyName="minutes" onChange={updateParam} spec={editSpec} />}
          </div>
        </SheetShell>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function SheetShell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 -m-1 rounded-2xl border border-white/[0.1] bg-[#0c0f15]/96 backdrop-blur-sm flex flex-col animate-fadeIn" role="dialog" aria-label={title}>
      <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <span className="text-[12px] font-semibold text-white/90">{title}</span>
        <button onClick={onClose} type="button" aria-label="Fechar" className="ml-auto h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.05] transition-colors"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scroll px-4 py-3 min-h-0">{children}</div>
      {footer && <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center justify-end shrink-0">{footer}</div>}
    </div>
  )
}

function AddGroup({ label, tone, specs, usedTypes, onAdd, note }: { label: string; tone: 'emerald' | 'amber' | 'rose'; specs: TriggerSpec[]; usedTypes: Set<string>; onAdd: (s: TriggerSpec) => void; note?: string }) {
  if (specs.length === 0) return null
  const toneCls = tone === 'emerald' ? 'text-emerald-300/70' : tone === 'amber' ? 'text-amber-300/70' : 'text-rose-300/70'
  return (
    <div className="mb-4">
      <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] block mb-2 ${toneCls}`}>{label}</span>
      {note && <p className="text-[10px] text-white/40 mb-2">{note}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {specs.map(t => {
          const used = usedTypes.has(t.type)
          const cap = getCapability(t.type)
          return (
            <button key={t.id} type="button" disabled={used} onClick={() => onAdd(t)} className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors ${used ? 'border-white/[0.04] bg-white/[0.01] opacity-50 cursor-not-allowed' : tone === 'rose' ? 'border-rose-400/15 bg-rose-500/[0.02] hover:border-rose-400/25' : 'border-white/[0.07] bg-white/[0.014] hover:border-white/[0.16] hover:bg-white/[0.03]'}`}>
              <div className="flex items-center gap-1.5 mb-0.5"><span className="text-[12.5px] font-semibold text-white/90 leading-tight">{t.title}</span>{used && <span className="ml-auto text-[9.5px] text-emerald-300/70 font-medium">adicionado</span>}</div>
              <p className="text-[10.5px] text-white/50 leading-snug">{cap.backendSupport === 'unsupported' ? cap.reasonIfUnsupported : t.description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
