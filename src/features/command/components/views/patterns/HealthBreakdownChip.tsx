/**
 * HealthBreakdownChip — small numeric chip used in the advanced view of
 * ConfiguredRadarRow. Renders nothing when value is zero. Behaviour preserved
 * byte-for-byte from CommandCenterPage.tsx (V3.18E).
 */
interface HealthBreakdownChipProps {
  label: string
  value: number
  tone: 'emerald' | 'cyan' | 'rose' | 'amber' | 'white'
}

export function HealthBreakdownChip({ label, value, tone }: HealthBreakdownChipProps) {
  if (value === 0) return null
  const cls = tone === 'emerald' ? 'text-emerald-200/85 bg-emerald-500/[0.05] border-emerald-400/15'
    : tone === 'cyan' ? 'text-cyan-200/85 bg-cyan-500/[0.05] border-cyan-400/15'
    : tone === 'rose' ? 'text-rose-200/85 bg-rose-500/[0.05] border-rose-400/15'
    : tone === 'amber' ? 'text-amber-200/85 bg-amber-500/[0.05] border-amber-400/15'
    : 'text-white/65 bg-white/[0.04] border-white/[0.07]'
  return <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${cls}`}><span className="font-semibold tabular-nums">{value}</span><span>{label}</span></span>
}
