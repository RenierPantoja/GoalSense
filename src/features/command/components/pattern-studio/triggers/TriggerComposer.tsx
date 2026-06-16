/**
 * TriggerComposer — Radar Composer 2.0 trigger builder (conditions-first)
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the always-expanded library + recipes layout of ConditionsEditor
 * with a compact, native-feeling builder:
 *   - Active conditions render as one-line cards with inline param editing.
 *   - "Adicionar condição" opens a categorized + searchable sheet.
 *   - "Usar receita" opens a recipes sheet.
 * Both sheets are contained overlays (no portal) so focus stays inside the modal.
 *
 * Pure UI. Reuses the exact same data catalog and param-clamp logic as the old
 * ConditionsEditor, so the emitted `PatternCondition[]` is byte-identical.
 */
import { useMemo, useState } from 'react'
import { Plus, Search, Sparkles, X } from 'lucide-react'
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
import { clampParam } from '../../../utils/patternStudioHelpers'
import { ParamField } from './ParamField'

interface TriggerComposerProps {
  conditions: PatternCondition[]
  onChange: (c: PatternCondition[]) => void
}

type Sheet = 'none' | 'add' | 'recipes'

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

  return (
    <div className="relative space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Condições</span>
        {conditions.length > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-white/[0.07] bg-white/[0.025] text-white/60">Todas precisam bater</span>
        )}
        <span className="text-[11px] text-white/55 tabular-nums ml-auto">
          {conditions.length === 0 ? 'nenhuma' : `${conditions.length} ${conditions.length === 1 ? 'gatilho' : 'gatilhos'}`}
        </span>
      </div>

      {/* Active conditions — compact one-line cards */}
      {conditions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.005] px-5 py-7 text-center">
          <p className="text-[12px] text-white/65 font-medium">Nenhuma condição ainda</p>
          <p className="text-[11px] text-white/45 mt-0.5">Adicione um gatilho ou aplique uma receita rápida.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {conditions.map((c, i) => {
            const spec = TRIGGER_BY_TYPE[c.type]
            const cat = spec?.category || 'contexto'
            const coverage = spec?.coverage
            const hasMinMax = c.params.min !== undefined && c.params.max !== undefined
            const hasValue = c.params.value !== undefined
            const hasMaxDiff = c.params.maxDiff !== undefined
            const hasMinutes = c.params.minutes !== undefined
            const editable = hasMinMax || hasValue || hasMaxDiff || hasMinutes
            return (
              <li key={i} className="group rounded-xl border border-white/[0.07] bg-white/[0.014] px-3.5 py-2.5 hover:border-white/[0.12] transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/70 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-white/95 leading-tight truncate">{spec?.title || COND_LABELS[c.type] || c.type}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/35">{TRIGGER_CATEGORY_LABELS[cat]}</span>
                      {coverage && <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${COVERAGE_TONE[coverage]}`}>{COVERAGE_LABEL[coverage]}</span>}
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5 leading-snug truncate">{formatConditionHuman(c)}</p>
                  </div>
                  <button onClick={() => removeCond(i)} type="button" aria-label={`Remover ${spec?.title || c.type}`} className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-300 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"><X size={13} /></button>
                </div>
                {editable && (
                  <div className="mt-2 pl-4 flex items-center gap-2 flex-wrap">
                    {hasMinMax && (
                      <>
                        <ParamField idx={i} cond={c} keyName="min" onChange={updateParam} spec={spec} />
                        <span className="text-[10px] text-white/35 font-medium">até</span>
                        <ParamField idx={i} cond={c} keyName="max" onChange={updateParam} spec={spec} />
                      </>
                    )}
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

      {/* ── Add condition sheet ── */}
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
          <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
            {filteredLibrary.length === 0 && <p className="col-span-full text-center text-[11px] text-white/40 py-6">Nenhum gatilho encontrado.</p>}
            {filteredLibrary.map(t => {
              const isUsed = usedTypes.has(t.type)
              return (
                <button key={t.id} onClick={() => { addTrigger(t) }} type="button" disabled={isUsed} className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors ${isUsed ? 'border-white/[0.04] bg-white/[0.01] opacity-50 cursor-not-allowed' : 'border-white/[0.07] bg-white/[0.014] hover:border-white/[0.16] hover:bg-white/[0.03]'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[12.5px] font-semibold text-white/90 leading-tight">{t.title}</span>
                    {isUsed && <span className="ml-auto text-[9.5px] text-emerald-300/70 font-medium">adicionado</span>}
                  </div>
                  <p className="text-[10.5px] text-white/50 leading-snug">{t.description}</p>
                </button>
              )
            })}
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
            <span className="text-[10px] text-white/40">aplica vários gatilhos · edite depois</span>
            <button onClick={() => setSheet('none')} type="button" aria-label="Fechar" className="ml-auto h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.05] transition-colors"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
            {TRIGGER_RECIPES.map(r => (
              <div key={r.id} className="rounded-xl border border-white/[0.07] bg-white/[0.014] px-3.5 py-3 flex flex-col">
                <p className="text-[12.5px] font-semibold text-white/90 leading-tight">{r.title}</p>
                <p className="text-[10.5px] text-white/50 mt-1 leading-snug flex-1">{r.description}</p>
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  {r.conditions.slice(0, 4).map((c, i) => (
                    <span key={i} className="text-[9.5px] text-white/55 bg-white/[0.025] border border-white/[0.06] px-1.5 py-0.5 rounded">{TRIGGER_BY_TYPE[c.type]?.title || c.type}</span>
                  ))}
                  {r.conditions.length > 4 && <span className="text-[9.5px] text-white/35">+{r.conditions.length - 4}</span>}
                </div>
                <button onClick={() => applyRecipe(r)} type="button" className="mt-2.5 h-8 rounded-lg text-[11px] font-semibold text-cyan-200 bg-cyan-500/12 border border-cyan-400/20 hover:bg-cyan-500/20 transition-colors">Aplicar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
