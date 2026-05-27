/**
 * PremiumToggle — bulletproof iOS-style switch
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses absolute positioning with `left` instead of CSS transforms so it never
 * inherits unexpected `transform` resets and never grows inside flex layouts
 * (shrink-0 + display:inline-block via inline-flex on button).
 *
 * Preserved API:
 * - role="switch", aria-checked, aria-pressed, aria-label
 * - size: 'sm' | 'md'
 * - checked / onChange contract
 */
interface PremiumToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  ariaLabel?: string
  size?: 'sm' | 'md'
}

export function PremiumToggle({ checked, onChange, ariaLabel, size = 'md' }: PremiumToggleProps) {
  const dims = size === 'sm'
    ? { w: 34, h: 20, knob: 14, padding: 3 }
    : { w: 42, h: 24, knob: 18, padding: 3 }
  const knobLeft = checked ? dims.w - dims.knob - dims.padding : dims.padding
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-pressed={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-block shrink-0 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d12] ${checked ? 'bg-emerald-500/55' : 'bg-white/[0.08] border border-white/[0.06]'}`}
      style={{ width: dims.w, height: dims.h }}
    >
      <span
        aria-hidden="true"
        className={`absolute rounded-full transition-[left] duration-200 ease-out shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${checked ? 'bg-white' : 'bg-white/65'}`}
        style={{
          width: dims.knob,
          height: dims.knob,
          top: (dims.h - dims.knob) / 2,
          left: knobLeft,
        }}
      />
    </button>
  )
}
