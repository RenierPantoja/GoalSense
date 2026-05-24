/**
 * Intelligence Timeline Panel — shows the full GoalSense intelligence journey
 * for a finished match: pre-match → alerts → resolution → knowledge base.
 * Only renders when real data exists.
 */
import { useMemo } from 'react'
import { buildIntelligenceTimeline, type IntelligenceTimelineItem } from '@/services/intelligence/intelligenceTimeline'
import { useAlerts } from '@/context/AlertsContext'
import { useViewMode } from '@/context/ViewModeContext'

interface Props {
  homeName: string
  awayName: string
  fixtureId?: number
  finalScore?: { home: number; away: number }
}

export function IntelligenceTimelinePanel({ homeName, awayName, fixtureId, finalScore }: Props) {
  const { commandAlerts } = useAlerts()
  const { isAdvanced } = useViewMode()

  const timeline = useMemo(() => {
    return buildIntelligenceTimeline({ homeName, awayName, fixtureId, commandAlerts, finalScore })
  }, [homeName, awayName, fixtureId, commandAlerts, finalScore])

  if (timeline.length === 0) return null

  return (
    <section className="rounded-[22px] border border-white/[0.06] bg-white/[0.01] p-6">
      <h3 className="text-[14px] font-bold text-white/70 mb-1">Timeline de inteligência</h3>
      <p className="text-[11px] text-white/30 mb-4">Jornada completa do GoalSense nesta partida</p>

      <div className="space-y-3">
        {timeline.map((item, idx) => (
          <div key={item.id} className="flex gap-3">
            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <div className={`h-3 w-3 rounded-full shrink-0 ${item.status === 'confirmed' ? 'bg-emerald-400' : item.status === 'partial' ? 'bg-cyan-400' : item.status === 'failed' ? 'bg-rose-400' : item.status === 'pending' ? 'bg-amber-400' : 'bg-white/20'}`} />
              {idx < timeline.length - 1 && <div className="w-px flex-1 bg-white/[0.06] mt-1" />}
            </div>

            {/* Content */}
            <div className="pb-3 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${item.phase === 'prematch' ? 'bg-cyan-500/8 text-cyan-400/60' : item.phase === 'live' ? 'bg-amber-500/8 text-amber-400/60' : 'bg-white/[0.04] text-white/30'}`}>{item.phase === 'prematch' ? 'Pré-jogo' : item.phase === 'live' ? 'Ao vivo' : 'Pós-jogo'}</span>
                {item.minute && <span className="text-[10px] text-white/25 tabular-nums">{item.minute}'</span>}
              </div>
              <p className="text-[12px] text-white/65 font-medium">{item.title}</p>
              {item.description && <p className="text-[11px] text-white/35 mt-0.5">{item.description}</p>}
              {isAdvanced && item.evidence.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {item.evidence.map((e, i) => <span key={i} className="text-[9px] text-white/20 bg-white/[0.02] px-2 py-0.5 rounded">{e}</span>)}
                </div>
              )}
              {isAdvanced && <span className="text-[9px] text-white/15 mt-1 block">{item.source}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
