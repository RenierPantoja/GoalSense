/**
 * ScoreDebugBadge — shows score source/freshness info in advanced mode.
 * Only renders when advanced mode is active. Zero impact on normal UX.
 */
import { useViewMode } from '@/context/ViewModeContext'
import type { LiveFixture } from '@/lib/apiClient'

interface ScoreDebugBadgeProps {
  fixture: LiveFixture
  compact?: boolean
}

export function ScoreDebugBadge({ fixture, compact = false }: ScoreDebugBadgeProps) {
  const { isAdvanced } = useViewMode()
  if (!isAdvanced) return null

  const source = fixture._scoreSource || fixture.provider || 'unknown'
  const isEventConfirmed = source.includes('events_confirmed')
  const isCacheCorrected = source.includes('was ')
  const tone = isEventConfirmed ? 'text-emerald-300/70 border-emerald-400/15 bg-emerald-500/[0.04]'
    : isCacheCorrected ? 'text-cyan-300/70 border-cyan-400/15 bg-cyan-500/[0.04]'
    : 'text-white/40 border-white/[0.06] bg-white/[0.02]'

  const label = isEventConfirmed ? 'evento'
    : isCacheCorrected ? 'cache'
    : source.split(' ')[0] // Just the provider name

  if (compact) {
    return (
      <span className={`text-[8px] font-mono px-1 py-0.5 rounded border ${tone}`} title={source}>
        {label}
      </span>
    )
  }

  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${tone} inline-flex items-center gap-1`} title={source}>
      <span className={`h-1 w-1 rounded-full ${isEventConfirmed ? 'bg-emerald-400/80' : isCacheCorrected ? 'bg-cyan-400/80' : 'bg-white/30'}`} />
      {label}
    </span>
  )
}
