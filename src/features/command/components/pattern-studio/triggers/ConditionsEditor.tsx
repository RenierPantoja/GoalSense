/**
 * ConditionsEditor — Trigger Lab
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the active conditions list, the categorized trigger library and the
 * curated recipes section. Sourced entirely from the data-driven catalog
 * (`triggerLibrary` + `triggerRecipes`) so adding a new trigger only requires
 * touching the catalog file.
 */
import { useMemo, useState } from 'react'
import type { PatternCondition } from '../../../types/commandTypes'
import { COND_LABELS, formatConditionHuman } from '../../../utils/commandFormatters'
import {
  COVERAGE_LABEL,
  COVERAGE_TONE,
  MODE_LABEL,
  TRIGGER_BY_TYPE,
  TRIGGER_CATEGORY_HINTS,
  TRIGGER_CATEGORY_LABELS,
  TRIGGER_LIBRARY,
  type TriggerCategory,
  type TriggerSpec,
} from '../../../intelligence/triggerLibrary'
import { TRIGGER_RECIPES, type TriggerRecipe } from '../../../intelligence/triggerRecipes'
import { clampParam } from '../../../utils/patternStudioHelpers'
import { ParamField } from './ParamField'

interface ConditionsEditorProps {
  conditions: PatternCondition[]
  onChange: (c: PatternCondition[]) => void
}

export function ConditionsEditor({ conditions, onChange }: ConditionsEditorProps) {
  const [activeCategory, setActiveCategory] = useState<TriggerCategory>('tempo')

  const usedTypes = useMemo(() => new Set(conditions.map(c => c.type)), [conditions])

  const addTrigger = (spec: TriggerSpec) => {
    if (usedTypes.has(spec.type)) return
    onChange([...conditions, { type: spec.type, params: { ...spec.defaultParams } }])
  }

  const updateParam = (idx: number, key: string, raw: number) => {
    const c = conditions[idx]
    const spec = TRIGGER_BY_TYPE[c.type]
    const bound = spec?.paramBounds?.[key]
    const next = clampParam(key, raw, bound)
    onChange(conditions.map((cc, i) => i === idx ? { ...cc, params: { ...cc.params, [key]: next } } : cc))
  }

  const removeCond = (idx: number) => onChange(conditions.filter((_, j) => j !== idx))

  const applyRecipe = (recipe: TriggerRecipe) => {
    const next = [...conditions]
    for (const c of recipe.conditions) {
      if (!next.some(existing => existing.type === c.type)) {
        next.push({ type: c.type, params: { ...c.params } })
      }
    }
    onChange(next)
  }

  const visibleTriggers = TRIGGER_LIBRARY.filter(t => t.category === activeCategory)

  return (
    <div className="space-y-6">
      {/* Active conditions header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Condições ativas</span>
        <span className="text-[11px] text-white/65 tabular-nums">
          {conditions.length === 0 ? 'nenhuma' : `${conditions.length} ${conditions.length === 1 ? 'gatilho' : 'gatilhos'}`}
        </span>
        {conditions.length > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-white/[0.07] bg-white/[0.025] text-white/60">Todas precisam bater</span>
        )}
      </div>

      {/* Active conditions list */}
      {conditions.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] px-5 py-6 text-center">
          <p className="text-[12px] text-white/65 font-medium">Nenhuma condição configurada</p>
          <p className="text-[11px] text-white/45 mt-0.5">Use a biblioteca abaixo ou aplique uma receita rápida.</p>
        </div>
      )}

      {conditions.length > 0 && (
        <div className="space-y-2">
          {conditions.map((c, i) => {
            const spec = TRIGGER_BY_TYPE[c.type]
            const cat = spec?.category || 'contexto'
            const coverage = spec?.coverage || 'high'
            const modes = spec?.modes || []
            const hasValue = c.params.value !== undefined || c.params.maxDiff !== undefined || c.params.minutes !== undefined
            const hasMinMax = c.params.min !== undefined && c.params.max !== undefined
            return (
              <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.012] px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">{TRIGGER_CATEGORY_LABELS[cat]}</span>
                      <span className="text-white/15">·</span>
                      <span className={`text-[9.5px] font-medium px-1.5 py-0.5 rounded border ${COVERAGE_TONE[coverage]}`}>{COVERAGE_LABEL[coverage]}</span>
                      {modes.map(m => (
                        <span key={m} className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-white/[0.025] text-white/55 border-white/[0.06]">{MODE_LABEL[m]}</span>
                      ))}
                    </div>
                    <p className="text-[13px] font-semibold text-white/95 leading-tight">{spec?.title || COND_LABELS[c.type] || c.type}</p>
                    <p className="text-[11.5px] text-white/55 mt-1 leading-snug">{formatConditionHuman(c)}</p>
                  </div>
                  <button onClick={() => removeCond(i)} type="button" aria-label="Remover gatilho" className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-white/35 hover:text-rose-300 hover:bg-rose-500/8 transition-colors">×</button>
                </div>

                {/* Params */}
                {(hasValue || hasMinMax) && (
                  <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center gap-2 flex-wrap">
                    {hasMinMax && (
                      <>
                        <ParamField idx={i} cond={c} keyName="min" onChange={updateParam} spec={spec} />
                        <span className="text-[10px] text-white/35 font-medium">até</span>
                        <ParamField idx={i} cond={c} keyName="max" onChange={updateParam} spec={spec} />
                      </>
                    )}
                    {c.params.value !== undefined && <ParamField idx={i} cond={c} keyName="value" onChange={updateParam} spec={spec} />}
                    {c.params.maxDiff !== undefined && <ParamField idx={i} cond={c} keyName="maxDiff" onChange={updateParam} spec={spec} />}
                    {c.params.minutes !== undefined && <ParamField idx={i} cond={c} keyName="minutes" onChange={updateParam} spec={spec} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Library — categorized triggers */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.008] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Biblioteca de gatilhos</span>
          <span className="ml-auto text-[10px] text-white/35">{TRIGGER_CATEGORY_HINTS[activeCategory]}</span>
        </div>
        {/* Category tabs */}
        <div className="px-4 pt-3 flex items-center gap-1 flex-wrap">
          {(Object.keys(TRIGGER_CATEGORY_LABELS) as TriggerCategory[]).map(cat => {
            const isActive = activeCategory === cat
            const total = TRIGGER_LIBRARY.filter(t => t.category === cat).length
            const used = TRIGGER_LIBRARY.filter(t => t.category === cat && usedTypes.has(t.type)).length
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${isActive ? 'bg-white/[0.06] text-white/95 border border-white/[0.12]' : 'text-white/55 hover:text-white/85 border border-transparent hover:bg-white/[0.025]'}`}
              >
                {TRIGGER_CATEGORY_LABELS[cat]} {used > 0 && <span className="text-[10px] text-white/40 ml-1 tabular-nums">{used}/{total}</span>}
              </button>
            )
          })}
        </div>
        {/* Trigger cards */}
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleTriggers.map(t => {
            const isUsed = usedTypes.has(t.type)
            return (
              <button
                key={t.id}
                onClick={() => addTrigger(t)}
                type="button"
                disabled={isUsed}
                className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${isUsed
                  ? 'border-white/[0.04] bg-white/[0.01] cursor-not-allowed opacity-55'
                  : 'border-white/[0.07] bg-white/[0.012] hover:border-white/[0.14] hover:bg-white/[0.025]'}`}
              >
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className={`text-[9.5px] font-medium px-1.5 py-0.5 rounded border ${COVERAGE_TONE[t.coverage]}`}>{COVERAGE_LABEL[t.coverage]}</span>
                  {t.modes.map(m => (
                    <span key={m} className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border bg-white/[0.025] text-white/55 border-white/[0.06]">{MODE_LABEL[m]}</span>
                  ))}
                  {isUsed && <span className="ml-auto text-[10px] text-emerald-300/70 font-medium">adicionado</span>}
                </div>
                <p className="text-[12.5px] font-semibold text-white/90 leading-tight">{t.title}</p>
                <p className="text-[11px] text-white/50 mt-1 leading-snug">{t.description}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Recipes */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.008] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Receitas rápidas</span>
          <span className="ml-auto text-[10px] text-white/35">Aplica vários gatilhos de uma vez. Você pode editar depois.</span>
        </div>
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TRIGGER_RECIPES.map(r => (
            <button
              key={r.id}
              onClick={() => applyRecipe(r)}
              type="button"
              className="text-left rounded-xl border border-white/[0.07] bg-white/[0.012] hover:border-white/[0.14] hover:bg-white/[0.025] px-3.5 py-3 transition-colors"
            >
              <p className="text-[12.5px] font-semibold text-white/90 leading-tight">{r.title}</p>
              <p className="text-[11px] text-white/50 mt-1 leading-snug">{r.description}</p>
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                {r.conditions.slice(0, 4).map((c, i) => (
                  <span key={i} className="text-[10px] text-white/55 bg-white/[0.025] border border-white/[0.06] px-1.5 py-0.5 rounded">{TRIGGER_BY_TYPE[c.type]?.title || c.type}</span>
                ))}
                {r.conditions.length > 4 && <span className="text-[10px] text-white/35">+{r.conditions.length - 4}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
