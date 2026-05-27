/**
 * ConfidenceBar — small horizontal gradient bar used in scanner rows.
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 */
interface ConfidenceBarProps {
  value: number
}

export function ConfidenceBar({ value }: ConfidenceBarProps) {
  const tone = value >= 75 ? 'from-emerald-500 to-emerald-400' : value >= 50 ? 'from-cyan-500 to-blue-500' : 'from-white/30 to-white/20'
  return (
    <div className="hidden sm:block w-16 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
      <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}
