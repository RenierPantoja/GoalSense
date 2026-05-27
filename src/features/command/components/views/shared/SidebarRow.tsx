/**
 * SidebarRow — label + numeric value row for sidebars.
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure presentational component, behaviour preserved byte-for-byte from the
 * inline version in CommandCenterPage.tsx (V3.18E). Greys out the value when
 * zero (text-white/35); coloured tone applies only when the value is positive.
 */
interface SidebarRowProps {
  label: string
  value: number
  tone?: 'rose' | 'amber' | 'cyan' | 'emerald' | 'white'
}

export function SidebarRow({ label, value, tone }: SidebarRowProps) {
  const c = value > 0
    ? tone === 'rose' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : tone === 'cyan' ? 'text-cyan-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white/85'
    : 'text-white/35'
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-white/55">{label}</span>
      <span className={`font-bold tabular-nums ${c}`}>{value}</span>
    </div>
  )
}
