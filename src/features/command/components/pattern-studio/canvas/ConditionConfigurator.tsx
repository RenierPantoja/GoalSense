/**
 * ConditionConfigurator — spacious, premium param editor for one condition.
 * ─────────────────────────────────────────────────────────────────────────────
 * Used by ConditionCommandSheet both when CONFIGURING a freshly-picked trigger
 * (before it is committed to the radar) and when EDITING an existing condition.
 * Replaces the cramped corner inputs with a confident two-column layout that
 * fills the sheet: large steppers + presets on the left, a live contract
 * preview and engine-coverage read-out on the right.
 *
 * Pure presentation. Emits the same PatternCondition params as before.
 */
import { Minus, Plus, Gauge, ShieldCheck, AlertTriangle } from 'lucide-react'
import type { PatternCondition } from '../../../types/commandTypes'
import type { TriggerSpec } from '../../../intelligence/triggerLibrary'
import { COVERAGE_LABEL } from '../../../intelligence/triggerLibrary'
import { getCapability } from '../../../intelligence/radarConditionCapabilities'
import { formatConditionHuman } from '../../../utils/commandFormatters'
import { clampParam } from '../../../utils/patternStudioHelpers'

interface ConditionConfiguratorProps {
  condition: PatternCondition
  spec?: TriggerSpec
  onChange: (params: Record<string, number | string | boolean>) => void
}

const PARAM_LABEL: Record<string, string> = {
  min: 'Minuto inicial', max: 'Minuto final', value: 'Limite', maxDiff: 'Diferença máxima', minutes: 'Janela (min)',
}

/** Sensible quick presets per param key. Filtered to the param bounds. */
const PARAM_PRESETS: Record<string, number[]> = {
  min: [0, 15, 30, 45, 60, 75],
  max: [30, 45, 60, 75, 90],
  value: [1, 2, 3, 4, 6, 8, 10],
  maxDiff: [0, 1, 2, 3],
  minutes: [15, 30, 60, 90, 120],
}

function BigStepper({
  label, unit, value, min, max, step, presets, onChange,
}: {
  label: string; unit?: string; value: number; min: number; max: number; step: number; presets: number[]; onChange: (v: number) => void
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)))
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{label}</span>
        {unit && <span className="text-[11px] text-white/40">{unit}</span>}
      </div>
      <div className="flex items-center justify-center gap-5">
        <button type="button" onClick={() => set(value - step)} disabled={value <= min} aria-label="Diminuir" className="h-12 w-12 rounded-full grid place-items-center text-white/80 bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.1] hover:border-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-95">
          <Minus size={20} />
        </button>
        <div className="min-w-[120px] text-center">
          <span className="block text-[52px] leading-none font-bold text-white/95 tabular-nums tracking-tight">{value}</span>
        </div>
        <button type="button" onClick={() => set(value + step)} disabled={value >= max} aria-label="Aumentar" className="h-12 w-12 rounded-full grid place-items-center text-white/80 bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.1] hover:border-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-95">
          <Plus size={20} />
        </button>
      </div>
      <div className="flex items-center justify-center gap-1.5 flex-wrap mt-5">
        {presets.filter(p => p >= min && p <= max).map(p => (
          <button key={p} type="button" onClick={() => set(p)} className={`h-7 min-w-[40px] px-2.5 rounded-lg text-[12px] font-semibold tabular-nums transition-colors ${value === p ? 'bg-[#13B8A6] text-white' : 'text-white/60 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/90'}`}>{p}</button>
        ))}
      </div>
    </div>
  )
}

export function ConditionConfigurator({ condition, spec, onChange }: ConditionConfiguratorProps) {
  const cap = getCapability(condition.type)
  const editableKeys = ['min', 'max', 'value', 'maxDiff', 'minutes'].filter(k => condition.params[k] !== undefined)
  const update = (key: string, raw: number) => {
    const next = clampParam(key, raw, spec?.paramBounds?.[key])
    onChange({ ...condition.params, [key]: next })
  }

  const supportTone = cap.backendSupport === 'supported'
    ? { text: 'text-[#5EEAD4]', bg: 'bg-[#13B8A6]/[0.1]', border: 'border-[#2DD4BF]/25', label: 'Executável pelo motor', Icon: ShieldCheck }
    : cap.backendSupport === 'partial'
      ? { text: 'text-amber-200/90', bg: 'bg-amber-500/[0.08]', border: 'border-amber-400/20', label: 'Cobertura parcial', Icon: AlertTriangle }
      : { text: 'text-rose-200/90', bg: 'bg-rose-500/[0.08]', border: 'border-rose-400/20', label: 'Não executável no motor', Icon: AlertTriangle }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-[1100px] mx-auto">
      {/* Controls */}
      <div className="lg:col-span-7 space-y-4">
        {editableKeys.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/25 mb-3">
              <Gauge size={20} className="text-[#5EEAD4]" />
            </div>
            <p className="text-[14px] font-semibold text-white/90">Sem parâmetros para ajustar</p>
            <p className="text-[12px] text-white/50 mt-1 leading-relaxed">Esta condição é binária — basta adicioná-la ao radar.</p>
          </div>
        ) : editableKeys.includes('min') && editableKeys.includes('max') ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BigStepper label={PARAM_LABEL.min} unit="minuto" value={Number(condition.params.min ?? 0)} min={spec?.paramBounds?.min?.min ?? 0} max={Number(condition.params.max ?? 90)} step={spec?.paramBounds?.min?.step ?? 1} presets={PARAM_PRESETS.min} onChange={v => update('min', v)} />
            <BigStepper label={PARAM_LABEL.max} unit="minuto" value={Number(condition.params.max ?? 90)} min={Number(condition.params.min ?? 0)} max={spec?.paramBounds?.max?.max ?? 120} step={spec?.paramBounds?.max?.step ?? 1} presets={PARAM_PRESETS.max} onChange={v => update('max', v)} />
          </div>
        ) : (
          editableKeys.map(k => {
            const bound = spec?.paramBounds?.[k]
            return (
              <BigStepper key={k} label={PARAM_LABEL[k] || k} unit={bound?.label} value={Number(condition.params[k] ?? 0)} min={bound?.min ?? 0} max={bound?.max ?? 99} step={bound?.step ?? 1} presets={PARAM_PRESETS[k] || []} onChange={v => update(k, v)} />
            )
          })
        )}
      </div>

      {/* Live read-out */}
      <aside className="lg:col-span-5 space-y-4">
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#13B8A6]/[0.06] via-white/[0.015] to-transparent p-5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Como o motor lê</span>
          <p className="text-[16px] font-semibold text-white/95 leading-snug mt-2">{formatConditionHuman(condition)}</p>
          {spec?.description && <p className="text-[12px] text-white/55 leading-relaxed mt-2">{spec.description}</p>}
        </div>

        <div className={`rounded-2xl border ${supportTone.border} ${supportTone.bg} p-4 flex items-start gap-3`}>
          <supportTone.Icon size={16} className={`${supportTone.text} mt-0.5 shrink-0`} />
          <div className="min-w-0">
            <p className={`text-[12.5px] font-semibold ${supportTone.text}`}>{supportTone.label}</p>
            {cap.backendSupport !== 'supported' && (cap.warningIfPartial || cap.reasonIfUnsupported) && (
              <p className="text-[11.5px] text-white/55 leading-snug mt-0.5">{cap.warningIfPartial || cap.reasonIfUnsupported}</p>
            )}
            {spec && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[10px] text-white/45">Cobertura de dados:</span>
                <span className="text-[10px] font-semibold text-white/75">{COVERAGE_LABEL[spec.coverage]}</span>
                {cap.dataDependencies.length > 0 && <span className="text-[10px] text-white/40">· usa {cap.dataDependencies.join(', ')}</span>}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
