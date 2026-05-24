interface Props {
  countdown: number
  total: number
}

export function RefreshProgressBar({ countdown, total }: Props) {
  const pct = ((total - countdown) / total) * 100

  return (
    <div className="h-[2px] w-full rounded-full bg-white/[0.03] overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-cyan-500/40 to-cyan-400/20 rounded-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
