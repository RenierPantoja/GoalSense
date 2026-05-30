/**
 * PenaltyShootoutPanel — displays penalty shootout state in Match Detail.
 * ─────────────────────────────────────────────────────────────────────────────
 * Only renders data the provider actually delivers. Never invents scores,
 * kicks, or outcomes.
 */
import { isPenaltyShootout, isPenaltyShootoutLive, formatPenaltyScore, type PenaltyScore, type PenaltyShootoutEvent } from '@/lib/penaltyShootout'

interface PenaltyShootoutPanelProps {
  statusShort: string
  homeName: string
  awayName: string
  penaltyScore?: PenaltyScore | null
  shootoutEvents?: PenaltyShootoutEvent[]
}

const OUTCOME_CONFIG: Record<string, { label: string; icon: string; tone: string }> = {
  scored: { label: 'Convertido', icon: '●', tone: 'text-emerald-400' },
  missed: { label: 'Perdido', icon: '○', tone: 'text-rose-400' },
  saved: { label: 'Defendido', icon: '✋', tone: 'text-amber-400' },
  post: { label: 'Na trave', icon: '◐', tone: 'text-amber-300' },
  unknown: { label: 'Resultado não informado', icon: '?', tone: 'text-white/40' },
}

export function PenaltyShootoutPanel({ statusShort, homeName, awayName, penaltyScore, shootoutEvents }: PenaltyShootoutPanelProps) {
  if (!isPenaltyShootout(statusShort)) return null

  const isLive = isPenaltyShootoutLive(statusShort)
  const hasScore = penaltyScore && penaltyScore.home !== null && penaltyScore.away !== null
  const hasEvents = shootoutEvents && shootoutEvents.length > 0
  const formattedScore = formatPenaltyScore(penaltyScore)

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-amber-500/[0.03] via-white/[0.01] to-transparent p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-amber-400 animate-pulse' : 'bg-white/30'}`} />
        <h4 className="text-[13px] font-bold text-white/90">
          {isLive ? 'Cobrança de pênaltis' : 'Disputa de pênaltis'}
        </h4>
        {isLive && <span className="text-[10px] text-amber-300/80 font-medium uppercase tracking-wider">Ao vivo</span>}
      </div>

      {/* Penalty Score */}
      {hasScore && (
        <div className="flex items-center justify-center gap-4 py-3 mb-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <span className="text-[13px] text-white/80 font-medium truncate max-w-[140px]">{homeName}</span>
          <span className="text-[22px] font-bold text-white/95 tabular-nums tracking-tight">{formattedScore}</span>
          <span className="text-[13px] text-white/80 font-medium truncate max-w-[140px]">{awayName}</span>
        </div>
      )}

      {/* Individual kicks */}
      {hasEvents && (
        <div className="space-y-1.5 mb-3">
          {shootoutEvents!.map((ev, i) => {
            const config = OUTCOME_CONFIG[ev.outcome] || OUTCOME_CONFIG.unknown
            return (
              <div key={ev.id || i} className="flex items-center gap-2 text-[11px]">
                <span className={`w-[18px] text-center font-bold ${config.tone}`}>{config.icon}</span>
                <span className="text-white/60 w-[60px] shrink-0 truncate">{ev.teamSide === 'home' ? homeName.split(' ')[0] : awayName.split(' ')[0]}</span>
                <span className="text-white/80 flex-1 truncate">{ev.playerName || 'Jogador não informado'}</span>
                <span className={`text-[10px] font-medium ${config.tone}`}>{config.label}</span>
                {ev.penaltyScoreHome !== undefined && ev.penaltyScoreAway !== undefined && (
                  <span className="text-[10px] text-white/40 tabular-nums">{ev.penaltyScoreHome}-{ev.penaltyScoreAway}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Fallback messages */}
      {!hasScore && !hasEvents && isLive && (
        <p className="text-[11px] text-white/45 leading-relaxed">
          Partida em cobrança de pênaltis. O provider ainda não forneceu placar das cobranças.
        </p>
      )}
      {hasScore && !hasEvents && (
        <p className="text-[10px] text-white/35 leading-relaxed">
          Detalhes das cobranças individuais não foram fornecidos pelo provider.
        </p>
      )}
    </section>
  )
}
