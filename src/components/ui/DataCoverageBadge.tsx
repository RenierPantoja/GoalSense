/**
 * Shows data coverage quality for a match.
 * Levels: complete, rich, partial, basic, unavailable.
 */

type CoverageLevel = 'complete' | 'rich' | 'partial' | 'basic' | 'unavailable'

interface CoverageInput {
  hasStats: boolean
  hasEvents: boolean
  hasLineups: boolean
  hasNarration: boolean
  hasLogos: boolean
  provider?: string
}

export function getMatchCoverage(input: CoverageInput): { level: CoverageLevel; label: string; tooltip: string } {
  const { hasStats, hasEvents, hasLineups, hasNarration, hasLogos } = input
  const count = [hasStats, hasEvents, hasLineups, hasNarration, hasLogos].filter(Boolean).length

  if (count >= 5) return { level: 'complete', label: 'Dados completos', tooltip: 'Placar, estatísticas, eventos, escalações e narração disponíveis' }
  if (count >= 3) return { level: 'rich', label: 'Dados ricos', tooltip: 'Placar, estatísticas e eventos disponíveis' }
  if (count >= 2) return { level: 'partial', label: 'Dados parciais', tooltip: 'Placar e eventos disponíveis' }
  if (count >= 1 || hasLogos) return { level: 'basic', label: 'Dados básicos', tooltip: 'Somente placar e informações básicas disponíveis' }
  return { level: 'unavailable', label: 'Sem dados detalhados', tooltip: 'Nenhum dado detalhado disponível para esta partida' }
}

interface Props {
  coverage: { level: CoverageLevel; label: string; tooltip: string }
  compact?: boolean
}

const levelStyles: Record<CoverageLevel, string> = {
  complete: 'text-emerald-400/70 bg-emerald-500/8 border-emerald-500/15',
  rich: 'text-cyan-400/60 bg-cyan-500/6 border-cyan-500/12',
  partial: 'text-amber-400/60 bg-amber-500/6 border-amber-500/12',
  basic: 'text-white/30 bg-white/[0.03] border-white/[0.06]',
  unavailable: 'text-white/20 bg-white/[0.02] border-white/[0.04]',
}

export function DataCoverageBadge({ coverage, compact }: Props) {
  if (coverage.level === 'unavailable' && compact) return null

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-medium ${levelStyles[coverage.level]}`}
      title={coverage.tooltip}
    >
      <CoverageDot level={coverage.level} />
      {!compact && coverage.label}
    </span>
  )
}

function CoverageDot({ level }: { level: CoverageLevel }) {
  const dotColors: Record<CoverageLevel, string> = {
    complete: 'bg-emerald-400',
    rich: 'bg-cyan-400',
    partial: 'bg-amber-400',
    basic: 'bg-white/30',
    unavailable: 'bg-white/15',
  }
  return <span className={`h-1.5 w-1.5 rounded-full ${dotColors[level]}`} />
}
