/**
 * RadarConditionChip — Radar Blueprint 3.4 premium condition chip
 * ─────────────────────────────────────────────────────────────────────────────
 * A condition rendered as a manipulable native object: short label, support
 * state, edit-on-click (when it has params) and a discreet remove control.
 * Tonalized by capability (eligibility / signal / partial / unsupported).
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
  if (cap.backendSupport === 'unsupported') return 'bg-rose-500/10 border-rose-400/25 text-rose-100'
  if (cap.backendSupport === 'partial') return 'bg-amber-500/[0.08] border-amber-400/25 text-amber-100'
  return cap.kind === 'signal' ? 'bg-emerald-500/[0.09] border-emerald-400/25 text-emerald-50' : 'bg-white/[0.05] border-white/[0.12] text-white/85'
}

export function RadarConditionChip({ condition, onEdit, onRemove }: RadarConditionChipProps) {
  const spec = TRIGGER_BY_TYPE[condition.type]
  const cap = getCapability(condition.type)
  const editable = ['min', 'max', 'value', 'maxDiff', 'minutes'].some(k => condition.params[k] !== undefined)
  const label = spec?.title || COND_LABELS[condition.type] || condition.type
  const title = cap.backendSupport === 'unsupported' ? cap.reasonIfUnsupported : cap.backendSupport === 'partial' ? cap.warningIfPartial : (editable ? 'Editar valores' : undefined)
  return (
    <span className={`group inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-lg border text-[12px] font-medium transition-colors ${toneClass(condition)}`} title={title}>
      {cap.backendSupport === 'unsupported' && <AlertTriangle size={11} className="opacity-80 shrink-0" />}
      <button
        type="button"
        onClick={() => editable && onEdit ? onEdit() : undefined}
        className={`outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded ${editable ? 'hover:underline decoration-dotted underline-offset-2 cursor-pointer' : 'cursor-default'}`}
      >
        {label}
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remover ${label}`} className="h-5 w-5 rounded flex items-center justify-center hover:bg-black/20 opacity-50 group-hover:opacity-100 focus:opacity-100 transition-opacity outline-none focus-visible:ring-1 focus-visible:ring-white/40"><X size={11} /></button>
    </span>
  )
}
