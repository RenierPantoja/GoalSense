/**
 * ConditionCommandSheet — Radar Blueprint 3.4 dedicated condition command sheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Native command-palette-style sheet for adding filters/signals, editing a
 * condition's params, or applying a recipe. Capability-aware: tabs separate
 * Executáveis / Parciais / Não executáveis; recipes flag backend executability.
 *
 * Pure presentation over the existing catalog + capability matrix. The emitted
 * PatternCondition[] is byte-identical to before.
 */
import { useMemo, useState } from 'react'
import { Search, Clock, Goal, Flame, Activity, Flag, RectangleHorizontal, Star, Crosshair, Timer, Wand2, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import type { PatternCondition } from '../../../types/commandTypes'
import { formatConditionHuman } from '../../../utils/commandFormatters'
import { TRIGGER_BY_TYPE, TRIGGER_CATEGORY_LABELS, TRIGGER_LIBRARY, type TriggerCategory, type TriggerSpec } from '../../../intelligence/triggerLibrary'
import { TRIGGER_RECIPES } from '../../../intelligence/triggerRecipes'
import { getCapability } from '../../../intelligence/radarConditionCapabilities'
import { clampParam } from '../../../utils/patternStudioHelpers'
import { ParamField } from '../triggers/ParamField'
import { SheetShell } from './SheetShell'

const CATEGORY_ICON: Record<TriggerCategory, LucideIcon> = {
  tempo: Clock, placar: Goal, pressao: Flame, controle: Activity, escanteios: Flag, disciplina: RectangleHorizontal, contexto: Star,
}

export type ConditionSheetMode =
  | { kind: 'addFilter' }
  | { kind: 'addSignal' }
  | { kind: 'edit'; index: number }
  | { kind: 'recipes' }

interface ConditionCommandSheetProps {
  mode: ConditionSheetMode
  conditions: PatternCondition[]
  onChange: (c: PatternCondition[]) => void
  onClose: () => void
}

const TAB_TONE = { supported: 'text-emerald-300/70', partial: 'text-amber-300/70', unsupported: 'text-rose-300/70' } as const

export function ConditionCommandSheet({ mode, conditions, onChange, onClose }: ConditionCommandSheetProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<TriggerCategory | 'all'>('all')
  const [tab, setTab] = useState<'supported' | 'partial' | 'unsupported'>('supported')

  const usedTypes = useMemo(() => new Set(conditions.map(c => c.type)), [conditions])
  const wantSignal = mode.kind === 'addSignal'

  const addTrigger = (spec: TriggerSpec) => {
    if (!usedTypes.has(spec.type)) onChange([...conditions, { type: spec.type, params: { ...spec.defaultParams } }])
    onClose()
  }

  const grouped = useMemo(() => {
    if (mode.kind !== 'addFilter' && mode.kind !== 'addSignal') return { supported: [], partial: [], unsupported: [] }
    const q = query.trim().toLowerCase()
    const list = TRIGGER_LIBRARY.filter(t => {
      const isSignal = getCapability(t.type).kind === 'signal'
      if (wantSignal ? !isSignal : isSignal) return false
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
  }, [mode.kind, wantSignal, query, category])

  // ── Edit mode ──
  if (mode.kind === 'edit') {
    const cond = conditions[mode.index]
    if (!cond) { onClose(); return null }
    const spec = TRIGGER_BY_TYPE[cond.type]
    const updateParam = (key: string, raw: number) => {
      const next = clampParam(key, raw, spec?.paramBounds?.[key])
      onChange(conditions.map((cc, i) => i === mode.index ? { ...cc, params: { ...cc.params, [key]: next } } : cc))
    }
    return (
      <SheetShell title={`Editar · ${spec?.title || cond.type}`} subtitle={formatConditionHuman(cond)} icon={<SlidersHorizontal size={20} />} accentFrom="#9AA6B8" accentTo="#5E6A7D" onClose={onClose}
        footer={<button onClick={onClose} type="button" className="h-8 px-4 rounded-lg text-[11px] font-semibold text-white/90 bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.1]">Concluir</button>}>
        <div className="flex items-center gap-2 flex-wrap">
          {cond.params.min !== undefined && cond.params.max !== undefined && (
            <><ParamField idx={mode.index} cond={cond} keyName="min" onChange={(_, k, v) => updateParam(k, v)} spec={spec} /><span className="text-[10px] text-white/35 font-medium">até</span><ParamField idx={mode.index} cond={cond} keyName="max" onChange={(_, k, v) => updateParam(k, v)} spec={spec} /></>
          )}
          {cond.params.value !== undefined && <ParamField idx={mode.index} cond={cond} keyName="value" onChange={(_, k, v) => updateParam(k, v)} spec={spec} />}
          {cond.params.maxDiff !== undefined && <ParamField idx={mode.index} cond={cond} keyName="maxDiff" onChange={(_, k, v) => updateParam(k, v)} spec={spec} />}
          {cond.params.minutes !== undefined && <ParamField idx={mode.index} cond={cond} keyName="minutes" onChange={(_, k, v) => updateParam(k, v)} spec={spec} />}
        </div>
      </SheetShell>
    )
  }

  // ── Recipes mode ──
  if (mode.kind === 'recipes') {
    const applyRecipe = (rConds: PatternCondition[]) => {
      const next = [...conditions]
      for (const rc of rConds) if (!next.some(e => e.type === rc.type)) next.push({ type: rc.type, params: { ...rc.params } })
      onChange(next); onClose()
    }
    return (
      <SheetShell title="Receitas rápidas" subtitle="Atalhos confiáveis · edite depois de aplicar" icon={<Wand2 size={20} />} accentFrom="#34E3CB" accentTo="#0E9E8C" onClose={onClose}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TRIGGER_RECIPES.map(r => {
            const unsup = r.conditions.filter(cc => getCapability(cc.type).backendSupport === 'unsupported')
            const partial = r.conditions.filter(cc => getCapability(cc.type).backendSupport === 'partial')
            const hasSignal = r.conditions.some(cc => getCapability(cc.type).kind === 'signal')
            const filters = r.conditions.filter(cc => getCapability(cc.type).kind !== 'signal')
            const signals = r.conditions.filter(cc => getCapability(cc.type).kind === 'signal')
            const executable = unsup.length === 0 && hasSignal
            return (
              <div key={r.id} className="rounded-xl border border-white/[0.07] bg-white/[0.014] px-3.5 py-3 flex flex-col">
                <p className="text-[12.5px] font-semibold text-white/90 leading-tight">{r.title}</p>
                <p className="text-[10.5px] text-white/50 mt-1 leading-snug flex-1">{r.description}</p>
                <div className="mt-2 space-y-1">
                  {filters.length > 0 && <div className="flex items-center gap-1 flex-wrap"><span className="text-[9px] uppercase tracking-wider text-white/35 w-10">Filtro</span>{filters.map((cc, i) => <span key={i} className="text-[9.5px] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-white/60">{getCapability(cc.type).label}</span>)}</div>}
                  {signals.length > 0 && <div className="flex items-center gap-1 flex-wrap"><span className="text-[9px] uppercase tracking-wider text-white/35 w-10">Sinal</span>{signals.map((cc, i) => <span key={i} className="text-[9.5px] px-1.5 py-0.5 rounded border bg-emerald-500/10 border-emerald-400/20 text-emerald-200">{getCapability(cc.type).label}</span>)}</div>}
                </div>
                <div className="mt-2">
                  {executable
                    ? <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-emerald-500/10 border-emerald-400/20 text-emerald-200">Executável pelo backend</span>
                    : <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-400/20 text-amber-200">{unsup.length > 0 ? 'Contém condição não executável' : 'Sem sinal real'}</span>}
                  {partial.length > 0 && executable && <span className="ml-1 text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-400/20 text-amber-200">cobertura variável</span>}
                </div>
                <button onClick={() => applyRecipe(r.conditions as PatternCondition[])} type="button" className="mt-2.5 h-8 rounded-lg text-[11px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] transition-colors">Aplicar</button>
              </div>
            )
          })}
        </div>
      </SheetShell>
    )
  }

  // ── Add mode (filter | signal) ──
  const availableCategories = useMemo(() => {
    const set = new Set<TriggerCategory>()
    for (const t of TRIGGER_LIBRARY) {
      const isSignal = getCapability(t.type).kind === 'signal'
      if (wantSignal ? isSignal : !isSignal) set.add(t.category)
    }
    return (Object.keys(TRIGGER_CATEGORY_LABELS) as TriggerCategory[]).filter(c => set.has(c))
  }, [wantSignal])

  const allGroups = [
    { key: 'supported' as const, label: 'Executáveis', specs: grouped.supported },
    { key: 'partial' as const, label: 'Parciais', specs: grouped.partial },
    { key: 'unsupported' as const, label: 'Não executáveis', specs: grouped.unsupported },
  ]
  const visibleGroups = allGroups.filter(g => g.specs.length > 0)
  const effectiveKey = visibleGroups.some(g => g.key === tab) ? tab : (visibleGroups[0]?.key ?? 'supported')
  const active = allGroups.find(g => g.key === effectiveKey)!
  const noResults = visibleGroups.length === 0

  return (
    <SheetShell
      title={wantSignal ? 'Adicionar sinal real' : 'Adicionar filtro'}
      subtitle={wantSignal ? 'Sinais reais definem o que dispara o radar' : 'Filtros definem quando o radar avalia — não disparam sozinhos'}
      icon={wantSignal ? <Crosshair size={20} /> : <Timer size={20} />}
      accentFrom={wantSignal ? '#4ADE80' : '#A78BFA'} accentTo={wantSignal ? '#1FA855' : '#7C4DEF'}
      onClose={onClose}
    >
      <div className="max-w-[1040px] mx-auto">
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={query} onChange={e => setQuery(e.target.value)} autoFocus placeholder="Buscar condição..." className="w-full h-11 pl-10 pr-3 rounded-[12px] bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#2DD4BF]/40" />
        </div>
        <div className="flex items-center gap-1 flex-wrap mb-3">
          <button onClick={() => setCategory('all')} type="button" className={`px-3 py-1.5 rounded-full text-[11.5px] font-medium transition-colors ${category === 'all' ? 'bg-white/[0.1] text-white/95' : 'text-white/50 hover:text-white/80'}`}>Todas</button>
          {availableCategories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} type="button" className={`px-3 py-1.5 rounded-full text-[11.5px] font-medium transition-colors ${category === cat ? 'bg-white/[0.1] text-white/95' : 'text-white/50 hover:text-white/80'}`}>{TRIGGER_CATEGORY_LABELS[cat]}</button>
          ))}
        </div>

        {noResults
          ? <p className="text-center text-[12.5px] text-white/45 py-12">Nenhuma condição {wantSignal ? 'de sinal' : 'de filtro'} {category === 'all' ? 'encontrada' : 'nesta categoria'}.</p>
          : <>
              {visibleGroups.length > 1 && (
                <div className="flex items-center gap-1 mb-4 border-b border-white/[0.07]">
                  {visibleGroups.map(g => (
                    <button key={g.key} type="button" onClick={() => setTab(g.key)} className={`px-3.5 py-2.5 text-[12.5px] font-medium border-b-2 -mb-px transition-colors ${effectiveKey === g.key ? `border-[#2DD4BF] ${TAB_TONE[g.key]}` : 'border-transparent text-white/45 hover:text-white/70'}`}>{g.label}<span className="ml-1.5 text-[10.5px] tabular-nums opacity-60">{g.specs.length}</span></button>
                  ))}
                </div>
              )}
              {effectiveKey === 'unsupported' && <p className="text-[11px] text-white/40 mb-3">Podem ser usadas no motor local, mas impedem a ativação do radar.</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {active.specs.map(t => {
                  const used = usedTypes.has(t.type)
                  const cap = getCapability(t.type)
                  const Icon = CATEGORY_ICON[t.category]
                  return (
                    <button key={t.id} type="button" disabled={used} onClick={() => addTrigger(t)} className={`group flex items-start gap-3 text-left rounded-[12px] border px-4 py-3.5 transition-all ${used ? 'border-white/[0.04] bg-white/[0.01] opacity-50 cursor-not-allowed' : effectiveKey === 'unsupported' ? 'border-[#FF5A52]/15 bg-[#FF5A52]/[0.04] hover:border-[#FF5A52]/30' : 'border-white/[0.07] bg-white/[0.03] hover:border-[#2DD4BF]/35 hover:bg-[#2DD4BF]/[0.06]'}`}>
                      <span className={`h-9 w-9 rounded-[10px] grid place-items-center shrink-0 border ${effectiveKey === 'unsupported' ? 'border-[#FF5A52]/20 text-[#FF8A80]' : 'border-white/[0.08] text-white/45 group-hover:text-[#2DD4BF] group-hover:border-[#2DD4BF]/25'} transition-colors`}><Icon size={16} /></span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5"><span className="text-[13px] font-semibold text-white/90 leading-tight">{t.title}</span>{used && <span className="text-[9.5px] text-emerald-300/70 font-medium">adicionado</span>}</span>
                        <span className="block text-[11px] text-white/50 leading-snug mt-0.5">{cap.backendSupport === 'unsupported' ? cap.reasonIfUnsupported : t.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>}
      </div>
    </SheetShell>
  )
}
