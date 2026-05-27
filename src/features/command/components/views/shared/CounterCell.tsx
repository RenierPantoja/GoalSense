/**
 * CounterCell — compact stat tile used in headers across views.
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure presentational component, behaviour preserved from the inline version
 * in CommandCenterPage.tsx (V3.18E). Treats numeric `value > 0` as "positive"
 * and string values "Off" / "—" / "0" as inactive (greyed out).
 */
interface CounterCellProps {
  label: string
  value: number | string
  tone: 'rose' | 'amber' | 'cyan' | 'emerald' | 'white'
}

export function CounterCell({ label, value, tone }: CounterCellProps) {
  const isPositive = typeof value === 'number' ? value > 0 : value !== 'Off' && value !== '—' && value !== '0'
  const c = isPositive
    ? tone === 'rose' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : tone === 'cyan' ? 'text-cyan-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white/85'
    : 'text-white/25'
  return (
    <div className="px-3 py-2.5 text-center bg-[#080d16]">
      <span className={`text-[18px] font-bold tabular-nums block leading-none ${c}`}>{value}</span>
      <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">{label}</span>
    </div>
  )
}
