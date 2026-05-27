/**
 * PatternStatRow — per-pattern row inside the Performance view "Por padrão"
 * section. Behaviour preserved byte-for-byte from CommandCenterPage.tsx
 * (V3.18E). Health tone, sample bands, badges and recommendations are all
 * driven by the `buildPatternHealth` engine output.
 */
import type { Pattern } from '../../../types/commandTypes'
import { HEALTH_TONE, type PatternHealth } from '../../../intelligence/patternHealthEngine'

interface PatternStatRowProps {
  stat: { pattern: Pattern; health: PatternHealth; lastHit: string | null }
  isAdvanced: boolean
}

export function PatternStatRow({ stat, isAdvanced }: PatternStatRowProps) {
  const { pattern, health, lastHit } = stat
  const total = Math.max(health.sampleSize, 1)
  const confirmedPct = (health.confirmedCount / total) * 100
  const partialPct = (health.partialCount / total) * 100
  const failedPct = (health.failedCount / total) * 100
  const sampleStatus = health.resolvedCount >= 5 ? 'utilizável' : health.resolvedCount >= 2 ? 'em observação' : 'insuficiente'
  const sampleTone = health.resolvedCount >= 5 ? 'text-emerald-300' : health.resolvedCount >= 2 ? 'text-cyan-300' : 'text-white/55'
  const healthTone = HEALTH_TONE[health.status]
  const hitRatePct = health.hitRate !== null ? Math.round(health.hitRate * 100) : null

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-gradient-to-r from-white/[0.012] to-white/[0.005] px-5 py-4">
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <span className="text-[13px] font-bold text-white/90 truncate flex-1 min-w-0">{pattern.name}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${pattern.status === 'active' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/15' : 'bg-white/[0.04] text-white/45 border border-white/[0.06]'}`}>{pattern.status === 'active' ? 'Ativo' : 'Pausado'}</span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border ${healthTone.bg} ${healthTone.border} ${healthTone.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${healthTone.dot}`} />
          {health.label}
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.04] ${sampleTone} border border-white/[0.06] whitespace-nowrap`}>{sampleStatus}</span>
      </div>
      {health.sampleSize > 0 && (
        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden flex mb-2.5">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${confirmedPct}%` }} />
          <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all" style={{ width: `${partialPct}%` }} />
          <div className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all" style={{ width: `${failedPct}%` }} />
        </div>
      )}
      <div className="flex items-center gap-3 text-[11px] text-white/65 flex-wrap">
        <span><span className="text-white/85 font-bold tabular-nums">{health.sampleSize}</span> disparos</span>
        {health.confirmedCount > 0 && <span className="text-emerald-300">✓ {health.confirmedCount}</span>}
        {health.partialCount > 0 && <span className="text-cyan-300">~ {health.partialCount}</span>}
        {health.failedCount > 0 && <span className="text-rose-300">✗ {health.failedCount}</span>}
        {health.expiredCount > 0 && <span className="text-white/45">⏱ {health.expiredCount}</span>}
        {health.unknownCount > 0 && <span className="text-amber-200/80">? {health.unknownCount}</span>}
        {hitRatePct !== null ? (
          <span className="ml-auto text-[12px] font-bold tabular-nums text-emerald-300">Taxa {hitRatePct}%</span>
        ) : (
          <span className="ml-auto text-[10px] text-white/45 font-medium">Amostra {health.resolvedCount}/5</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-white/45 mt-1.5 flex-wrap">
        {health.avgConfidence !== null && <span>Confiança média: <span className="text-white/75 font-semibold tabular-nums">{health.avgConfidence}%</span></span>}
        {lastHit && <span>Último: {new Date(lastHit).toLocaleDateString('pt-BR')}</span>}
        {health.reason && <span className={`${healthTone.text}`}>· {health.reason}</span>}
      </div>
      {isAdvanced && health.recommendations.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/[0.04]">
          <span className="text-[9.5px] uppercase tracking-wider text-amber-200/80 font-semibold">Sugestões</span>
          <ul className="mt-1 space-y-0.5">
            {health.recommendations.map((r, i) => <li key={i} className="text-[11px] text-white/65 leading-snug">· {r}</li>)}
          </ul>
        </div>
      )}
      {isAdvanced && (
        <div className="mt-2 text-[10px] text-white/45 font-mono">
          ✓{health.confirmedCount} · ~{health.partialCount} · ✗{health.failedCount} · ⏱{health.expiredCount} · ?{health.unknownCount} · pendentes:{health.pendingCount}
        </div>
      )}
    </div>
  )
}
