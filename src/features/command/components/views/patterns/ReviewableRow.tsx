/**
 * ReviewableRow — compact row in the "Radares para revisar" section of the
 * Patterns view. Shows the radar name, the health label/reason in pt-BR and
 * up to 3 actionable recommendations. Behaviour preserved byte-for-byte.
 */
import type { Pattern } from '../../../types/commandTypes'
import { HEALTH_TONE, type PatternHealth } from '../../../intelligence/patternHealthEngine'

interface ReviewableRowProps {
  pattern: Pattern
  health: PatternHealth
  onEdit: () => void
  /** Optional V4.4 prefetch hook for the CustomPatternModal chunk. */
  onPrefetch?: () => void
}

export function ReviewableRow({ pattern, health, onEdit, onPrefetch }: ReviewableRowProps) {
  const tone = HEALTH_TONE[health.status]
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] px-4 py-3 flex items-start gap-3">
      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h4 className="text-[12.5px] font-semibold text-white/95 truncate">{pattern.name}</h4>
          <span className={`text-[10px] font-medium ${tone.text}`}>{health.label}</span>
        </div>
        <p className={`text-[11.5px] leading-snug ${tone.text}`}>{health.reason}</p>
        {health.recommendations.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {health.recommendations.slice(0, 3).map((r, i) => (
              <li key={i} className="text-[11px] text-white/65 leading-snug">· {r}</li>
            ))}
          </ul>
        )}
      </div>
      <button onClick={onEdit} onMouseEnter={onPrefetch} onFocus={onPrefetch} type="button" className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-colors">Editar</button>
    </div>
  )
}
