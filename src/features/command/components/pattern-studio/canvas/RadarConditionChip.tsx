/**
 * RadarConditionChip — Radar Blueprint 3.6 refined Apple-style tag
 * ─────────────────────────────────────────────────────────────────────────────
 * A condition as a calm, rounded tag: short label, edit-on-click (when it has
 * params) and a discreet remove control. Tonalized by capability with restrained
 * system colors (no neon).
 */
import { AlertTriangle, X } from 'lucide-react'
import type { PatternCondition } from '../../../types/commandTypes'
import { COND_LABELS } from '../../../utils/commandFormatters'
import { TRIGGER_BY_TYPE } from '../../../intelligence/triggerLibrary'
import { getCapability } from '../../../intelligence/radarConditionCapabilities'

interface RadarConditionChipProps {
  condition: PatternCondition
  onEdit?: () => void
  onRemove: () => void
}

function toneClass(c: PatternCondition): string {
  const cap = getCapability(c.type)
  if (cap.backendSupport === 'unsupported') return 'bg-[#FF453A]/12 border-[#FF453A]/25 text-[#FF8A80]'
  if (cap.backendSupport === 'partial') return 'bg-[#FF9F0A]/12 border-[#FF9F0A]/22 text-[#FFD08A]'
  return cap.kind === 'signal' ? 'bg-[#30D158]/12 border-[#30D158]/22 text-[#8FE9A6]' : 'bg-white/[0.07] border-white/[0.1] text-white/80'
}

export function RadarConditionChip({ condition, onEdit, onRemove }: RadarConditionChipProps) {
  const spec = TRIGGER_BY_TYPE[condition.type]
  const cap = getCapability(condition.type)
  const editable = ['min', 'max', 'value', 'maxDiff', 'minutes'].some(k => condition.params[k] !== undefined)
  const label = spec?.title || COND_LABELS[condition.type] || condition.type
  const title = cap.backendSupport === 'unsupported' ? cap.reasonIfUnsupported : cap.backendSupport === 'partial' ? cap.warningIfPartial : (editable ? 'Editar valores' : undefined)
  return (
    <span className={`group inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full border text-[12px] font-medium transition-colors ${toneClass(condition)}`} title={title}>
      {cap.backendSupport === 'unsupported' && <AlertTriangle size={10.5} className="opacity-80 shrink-0" />}
      <button type="button" onClick={() => editable && onEdit ? onEdit() : undefined} className={`outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded ${editable ? 'cursor-pointer' : 'cursor-default'}`}>{label}</button>
      <button type="button" onClick={onRemove} aria-label={`Remover ${label}`} className="h-5 w-5 rounded-full grid place-items-center hover:bg-black/25 opacity-50 group-hover:opacity-100 focus:opacity-100 transition-opacity outline-none focus-visible:ring-1 focus-visible:ring-white/40"><X size={11} /></button>
    </span>
  )
}
