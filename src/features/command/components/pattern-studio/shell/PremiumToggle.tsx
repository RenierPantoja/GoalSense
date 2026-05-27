/**
 * PremiumToggle — bulletproof iOS-style switch
 * ─────────────────────────────────────────────────────────────────────────────
 * Sizing rules to avoid overlap with neighbouring elements:
 * - inline-flex (block-level inside flex parents, no baseline drift)
 * - explicit width/height via inline style
 * - shrink-0 so flex parents never compress the track
 * - box-sizing: border-box and a border that is always 1px wide (transparent
 *   when checked) so the inner padding box stays the same in both states and
 *   the absolute knob never jumps between toggle states
 * - pointer-events-none on the knob so the click always reaches the button
 * - stopPropagation on click so toggles inside clickable cards do not double-fire
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
  // Border is always 1px so the padding box (the absolute positioning
  // reference of the knob) is the same in both states. Subtract 2 from the
  // outer dimensions to compute the available interior.
  const innerW = dims.w - 2
  const innerH = dims.h - 2
  const knobLeft = checked ? innerW - dims.knob - dims.padding : dims.padding
  const knobTop = (innerH - dims.knob) / 2
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-pressed={checked}
      aria-label={ariaLabel}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={`relative inline-flex shrink-0 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d12] border ${checked ? 'bg-emerald-500/55 border-transparent' : 'bg-white/[0.08] border-white/[0.06]'}`}
      style={{ width: dims.w, height: dims.h, minWidth: dims.w, boxSizing: 'border-box' }}
    >
      <span
        aria-hidden="true"
        className={`absolute rounded-full pointer-events-none transition-[left] duration-200 ease-out shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${checked ? 'bg-white' : 'bg-white/65'}`}
        style={{
          width: dims.knob,
          height: dims.knob,
          top: knobTop,
          left: knobLeft,
        }}
      />
    </button>
  )
}
