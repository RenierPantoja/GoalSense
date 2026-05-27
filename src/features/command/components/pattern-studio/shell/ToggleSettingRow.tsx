/**
 * ToggleSettingRow — premium row layout for toggle settings
 * ─────────────────────────────────────────────────────────────────────────────
 * Title + optional description on the left, PremiumToggle on the right. Used
 * in AutoDiscoveryConfigModal and the advanced filters block of ScopePicker.
 */
import { PremiumToggle } from './PremiumToggle'

interface ToggleSettingRowProps {
  title: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}

export function ToggleSettingRow({ title, description, checked, onChange }: ToggleSettingRowProps) {
  return (
    <div className="flex items-start gap-4 py-3 first:pt-0 last:pb-0 border-b border-white/[0.04] last:border-b-0 min-h-[56px]">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white/95 font-semibold leading-tight">{title}</p>
        {description && <p className="text-[11px] text-white/55 leading-snug mt-1">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">
        <PremiumToggle checked={checked} onChange={onChange} ariaLabel={title} size="md" />
      </div>
    </div>
  )
}
