/**
 * TriggerComposer — Radar Blueprint 3.1 trigger builder (capability-aware)
 * ─────────────────────────────────────────────────────────────────────────────
 * Conditions-first builder. The add sheet groups the library by what the ENGINE
 * can execute (supported · partial · not yet executable), so the user is guided
 * before building an invalid rule. Recipes declare whether they are fully
 * backend-executable. Active conditions render as compact chips tagged by kind
 * (filtro/sinal/contexto) with capability markers.
 *
 * Emitted `PatternCondition[]` is byte-identical to before — capability is
 * presentation/guidance only, never written to the payload.
 */
import { useMemo, useState } from 'react'
import { Plus, Search, Sparkles, X, AlertTriangle } from 'lucide-react'
import type { PatternCondition } from '../../../types/commandTypes'
import { COND_LABELS, formatConditionHuman } from '../../../utils/commandFormatters'
import {
  COVERAGE_LABEL,
  COVERAGE_TONE,
  TRIGGER_BY_TYPE,
  TRIGGER_CATEGORY_LABELS,
  TRIGGER_LIBRARY,
  type TriggerCategory,
  type TriggerSpec,
} from '../../../intelligence/triggerLibrary'
import { TRIGGER_RECIPES, type TriggerRecipe } from '../../../intelligence/triggerRecipes'
import { getCapability, type ConditionKind } from '../../../intelligence/radarConditionCapabilities'
import { clampParam } from '../../../utils/patternStudioHelpers'
import { ParamField } from './ParamField'

interface TriggerComposerProps {
  conditions: PatternCondition[]
  onChange: (c: PatternCondition[]) => void
}

type Sheet = 'none' | 'add' | 'recipes'

const KIND_LABEL: Record<ConditionKind, string> = { eligibility: 'Filtro', signal: 'Sinal', blocker: 'Bloqueio', context: 'Contexto' }
const KIND_TONE: Record<ConditionKind, string> = {
  eligibility: 'bg-white/[0.05] border-white/[0.1] text-white/55',
  signal: 'bg-emerald-500/10 border-emerald-400/20 text-emerald-200',
  blocker: 'bg-rose-500/10 border-rose-400/20 text-rose-200',
  context: 'bg-white/[0.04] border-white/[0.08] text-white/45',
}

export function TriggerComposer({ conditions, onChange }: TriggerComposerProps) {
  const [sheet, setSheet] = useState<Sheet>('none')
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<TriggerCategory | 'all'>('all')

  const usedTypes = useMemo(() => new Set(conditions.map(c => c.type)), [conditions])

  const addTrigger = (spec: TriggerSpec) => {
    if (usedTypes.has(spec.type)) return
    onChange([...conditions, { type: spec.type, params: { ...spec.defaultParams } }])
  }
  const removeCond = (idx: number) => onChange(conditions.filter((_, j) => j !== idx))
  const updateParam = (idx: number, key: string, raw: number) => {
    const c = conditions[idx]
    const spec = TRIGGER_BY_TYPE[c.type]
    const bound = spec?.paramBounds?.[key]
    const next = clampParam(key, raw, bound)
    onChange(conditions.map((cc, i) => i === idx ? { ...cc, params: { ...cc.params, [key]: next } } : cc))
  }
  const applyRecipe = (recipe: TriggerRecipe) => {
    const next = [...conditions]
    for (const c of recipe.conditions) {
      if (!next.some(existing => existing.type === c.type)) next.push({ type: c.type, params: { ...c.params } })
    }
    onChange(next)
    setSheet('none')
  }

  const filteredLibrary = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TRIGGER_LIBRARY.filter(t => {
      if (activeCategory !== 'all' && t.category !== activeCategory) return false
      if (!q) return true
      return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    })
  }, [query, activeCategory])

  const grouped = useMemo(() => {
    const supported: TriggerSpec[] = [], partial: TriggerSpec[] = [], unsupported: TriggerSpec[] = []
    for (const t of filteredLibrary) {
      const s = getCapability(t.type).backendSupport
      if (s === 'supported') supported.push(t)
      else if (s === 'partial') partial.push(t)
      else unsupported.push(t)
    }
    return { supported, partial, unsupported }
  }, [filteredLibrary])

  const recipeStatus = (r: TriggerRecipe) => {
    const unsup = r.conditions.filter(c => getCapability(c.type).backendSupport === 'unsupported')
    const hasSignal = r.conditions.some(c => getCapability(c.type).kind === 'signal')
    return { executable: unsup.length === 0 && hasSignal, unsupported: unsup.map(c => getCapability(c.type).label), hasSignal }
  }

  const renderTriggerCard = (t: TriggerSpec) => {
    const isUsed = usedTypes.has(t.type)
    const cap = getCapability(t.type)
    return (
      <button key={t.id} onClick={() => addTrigger(t)} type="button" disabled={isUsed}
        className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors ${isUsed ? 'border-white/[0.04] bg-white/[0.01] opacity-50 cursor-not-allowed' : cap.backendSupport === 'unsupported' ? 'border-rose-400/15 bg-rose-500/[0.02] hover:border-rose-400/25' : 'border-white/[0.07] bg-white/[0.014] hover:border-white/[0.16] hover:bg-white/[0.03]'}`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${KIND_TONE[cap.kind]}`}>{KIND_LABEL[cap.kind]}</span>
          <span className="text-[12.5px] font-semibold text-white/90 leading-tight">{t.title}</span>
          {isUsed && <span className="ml-auto text-[9.5px] text-emerald-300/70 font-medium">adicionado</span>}
        </div>
        <p className="text-[10.5px] text-white/50 leading-snug">{cap.backendSupport === 'unsupported' ? cap.reasonIfUnsupported : t.description}</p>
      </button>
    )
  }

  return (
    <div className="relative space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Condições</span>
        {conditions.length > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-white/[0.07] bg-white/[0.025] text-white/60">Todas precisam bater</span>}
        <span className="text-[11px] text-white/55 tabular-nums ml-auto">{conditions.length === 0 ? 'nenhuma' : `${conditions.length} ${conditions.length === 1 ? 'gatilho' : 'gatilhos'}`}</span>
      </div>

      {/* Active conditions */}
      {conditions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.005] px-5 py-7 text-center">
          <p className="text-[12px] text-white/65 font-medium">Nenhuma condição ainda</p>
          <p className="text-[11px] text-white/45 mt-0.5">Adicione um gatilho ou aplique uma receita rápida.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {conditions.map((c, i) => {
            const spec = TRIGGER_BY_TYPE[c.type]
            const cap = getCapability(c.type)
            const hasMinMax = c.params.min !== undefined && c.params.max !== undefined
            const hasValue = c.params.value !== undefined
            const hasMaxDiff = c.params.maxDiff !== undefined
            const hasMinutes = c.params.minutes !== undefined
            const editable = hasMinMax || hasValue || hasMaxDiff || hasMinutes
            return (
              <li key={i} className={`group rounded-xl border px-3.5 py-2.5 transition-colors ${cap.backendSupport === 'unsupported' ? 'border-rose-400/20 bg-rose-500/[0.03]' : 'border-white/[0.07] bg-white/[0.014] hover:border-white/[0.12]'}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${KIND_TONE[cap.kind]}`}>{KIND_LABEL[cap.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-white/95 leading-tight truncate">{spec?.title || COND_LABELS[c.type] || c.type}</span>
                      {cap.backendSupport === 'partial' && <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${COVERAGE_TONE.variable}`}>{COVERAGE_LABEL.variable}</span>}
                      {cap.backendSupport === 'unsupported' && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border bg-rose-500/10 border-rose-400/20 text-rose-200 inline-flex items-center gap-1"><AlertTriangle size={9} />não executável</span>}
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5 leading-snug truncate">{cap.backendSupport === 'unsupported' ? cap.reasonIfUnsupported : formatConditionHuman(c)}</p>
                  </div>
                  <button onClick={() => removeCond(i)} type="button" aria-label={`Remover ${spec?.title || c.type}`} className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-300 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"><X size={13} /></button>
                </div>
                {editable && (
                  <div className="mt-2 pl-[44px] flex items-center gap-2 flex-wrap">
                    {hasMinMax && (<><ParamField idx={i} cond={c} keyName="min" onChange={updateParam} spec={spec} /><span className="text-[10px] text-white/35 font-medium">até</span><ParamField idx={i} cond={c} keyName="max" onChange={updateParam} spec={spec} /></>)}
                    {hasValue && <ParamField idx={i} cond={c} keyName="value" onChange={updateParam} spec={spec} />}
                    {hasMaxDiff && <ParamField idx={i} cond={c} keyName="maxDiff" onChange={updateParam} spec={spec} />}
                    {hasMinutes && <ParamField idx={i} cond={c} keyName="minutes" onChange={updateParam} spec={spec} />}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button onClick={() => { setSheet('add'); setQuery(''); setActiveCategory('all') }} type="button" className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-semibold text-white/90 border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"><Plus size={14} />Adicionar condição</button>
        <button onClick={() => setSheet('recipes')} type="button" className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-medium text-cyan-300/85 border border-cyan-400/15 bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08] transition-colors"><Sparkles size={13} />Usar receita</button>
      </div>

      {/* ── Add sheet (grouped by engine capability) ── */}
      {sheet === 'add' && (
        <div className="absolute inset-0 z-20 -m-1 rounded-2xl border border-white/[0.1] bg-[#0c0f15]/95 backdrop-blur-sm flex flex-col animate-fadeIn" role="dialog" aria-label="Adicionar condição">
          <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[12px] font-semibold text-white/90">Adicionar condição</span>
              <button onClick={() => setSheet('none')} type="button" aria-label="Fechar" className="ml-auto h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.05] transition-colors"><X size={14} /></button>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input value={query} onChange={e => setQuery(e.target.value)} autoFocus placeholder="Buscar condição..." className="w-full h-9 pl-8 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/25" />
            </div>
            <div className="flex items-center gap-1 flex-wrap mt-2.5">
              <button onClick={() => setActiveCategory('all')} type="button" className={`px-2.5 py-1 rounded-lg text-[10.5px] font-medium transition-colors ${activeCategory === 'all' ? 'bg-white/[0.08] text-white/95 border border-white/[0.14]' : 'text-white/50 hover:text-white/80 border border-transparent'}`}>Todas</button>
              {(Object.keys(TRIGGER_CATEGORY_LABELS) as TriggerCategory[]).map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} type="button" className={`px-2.5 py-1 rounded-lg text-[10.5px] font-medium transition-colors ${activeCategory === cat ? 'bg-white/[0.08] text-white/95 border border-white/[0.14]' : 'text-white/50 hover:text-white/80 border border-transparent'}`}>{TRIGGER_CATEGORY_LABELS[cat]}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3 space-y-4">
            {filteredLibrary.length === 0 && <p className="text-center text-[11px] text-white/40 py-6">Nenhum gatilho encontrado.</p>}
            {grouped.supported.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/70 block mb-2">Disponíveis para ativação</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{grouped.supported.map(renderTriggerCard)}</div>
              </div>
            )}
            {grouped.partial.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/70 block mb-2">Parcialmente suportadas · cobertura variável</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{grouped.partial.map(renderTriggerCard)}</div>
              </div>
            )}
            {grouped.unsupported.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300/70 block mb-2 inline-flex items-center gap-1"><AlertTriangle size={10} />Ainda não executável pelo backend</span>
                <p className="text-[10px] text-white/40 mb-2">Podem ser usadas no motor local, mas impedem a ativação do radar.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{grouped.unsupported.map(renderTriggerCard)}</div>
              </div>
            )}
          </div>
          <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-[10.5px] text-white/40">{conditions.length} {conditions.length === 1 ? 'condição ativa' : 'condições ativas'}</span>
            <button onClick={() => setSheet('none')} type="button" className="h-8 px-4 rounded-lg text-[11px] font-semibold text-white/90 bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.1] transition-colors">Concluir</button>
          </div>
        </div>
      )}

      {/* ── Recipes sheet ── */}
      {sheet === 'recipes' && (
        <div className="absolute inset-0 z-20 -m-1 rounded-2xl border border-white/[0.1] bg-[#0c0f15]/95 backdrop-blur-sm flex flex-col animate-fadeIn" role="dialog" aria-label="Receitas rápidas">
          <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.06] flex items-center gap-2">
            <Sparkles size={13} className="text-cyan-300/80" />
            <span className="text-[12px] font-semibold text-white/90">Receitas rápidas</span>
            <button onClick={() => setSheet('none')} type="button" aria-label="Fechar" className="ml-auto h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.05] transition-colors"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
            {TRIGGER_RECIPES.map(r => {
              const st = recipeStatus(r)
              return (
                <div key={r.id} className="rounded-xl border border-white/[0.07] bg-white/[0.014] px-3.5 py-3 flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12.5px] font-semibold text-white/90 leading-tight flex-1">{r.title}</p>
                  </div>
                  <p className="text-[10.5px] text-white/50 mt-1 leading-snug flex-1">{r.description}</p>
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    {r.conditions.slice(0, 4).map((c, i) => {
                      const cap = getCapability(c.type)
                      return <span key={i} className={`text-[9.5px] px-1.5 py-0.5 rounded border ${KIND_TONE[cap.kind]}`}>{cap.label}</span>
                    })}
                    {r.conditions.length > 4 && <span className="text-[9.5px] text-white/35">+{r.conditions.length - 4}</span>}
                  </div>
                  <div className="mt-2">
                    {st.executable
                      ? <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-emerald-500/10 border-emerald-400/20 text-emerald-200">Executável pelo backend</span>
                      : <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-400/20 text-amber-200">{st.unsupported.length > 0 ? 'Contém condição não executável' : 'Sem sinal real'}</span>}
                  </div>
                  <button onClick={() => applyRecipe(r)} type="button" className="mt-2.5 h-8 rounded-lg text-[11px] font-semibold text-cyan-200 bg-cyan-500/12 border border-cyan-400/20 hover:bg-cyan-500/20 transition-colors">Aplicar</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
