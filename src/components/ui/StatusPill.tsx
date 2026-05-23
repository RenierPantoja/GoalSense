type Variant = 'live' | 'finished' | 'scheduled' | 'halftime' | 'default'

interface StatusPillProps {
  label: string
  variant?: Variant
}

const variants: Record<Variant, string> = {
  live: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  finished: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  scheduled: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  halftime: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  default: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
}

export function StatusPill({ label, variant = 'default' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${variants[variant]}`}
    >
      {variant === 'live' && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      )}
      {label}
    </span>
  )
}
