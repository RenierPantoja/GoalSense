/**
 * ParamField — single numeric input with safe clamp + label
 * ─────────────────────────────────────────────────────────────────────────────
 * Used by ConditionsEditor to edit individual numeric params on a condition.
 * Clamps via the trigger's paramBounds when present, falling back to the
 * shared PARAM_CLAMP.
 */
import type { PatternCondition } from '../../../types/commandTypes'
import type { TriggerSpec } from '../../../intelligence/triggerLibrary'
import { PARAM_CLAMP } from '../../../utils/patternStudioHelpers'

interface ParamFieldProps {
  idx: number
  cond: PatternCondition
  keyName: string
  onChange: (idx: number, key: string, val: number) => void
  spec?: TriggerSpec
}

export function ParamField({ idx, cond, keyName, onChange, spec }: ParamFieldProps) {
  const bound = spec?.paramBounds?.[keyName]
  const label = bound?.label
  const value = Number(cond.params[keyName] ?? 0)
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        onChange={e => onChange(idx, keyName, Number(e.target.value))}
        min={bound?.min ?? PARAM_CLAMP[keyName]?.min ?? 0}
        max={bound?.max ?? PARAM_CLAMP[keyName]?.max ?? 999}
        step={bound?.step ?? 1}
        className="w-16 h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11.5px] text-white/95 text-center tabular-nums outline-none focus:border-white/30 focus:bg-white/[0.06] transition-colors"
      />
      {label && <span className="text-[10px] text-white/40 font-medium">{label}</span>}
    </span>
  )
}
