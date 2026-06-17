/**
 * ReadinessInline — Radar Blueprint 3.3 inline readiness (replaces fixed panel)
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact, elegant readiness block rendered inside the Rule Studio canvas
 * instead of a heavy fixed side panel. Driven entirely by getRadarReadiness +
 * compileRadarContract — never invents a green state, never hides a hard blocker.
 */
import type { RadarContract, RadarReadiness } from '../../../intelligence/radarReadiness'

interface ReadinessInlineProps {
  readiness: RadarReadiness
  contract: RadarContract
}

export function ReadinessInline({ readiness, contract }: ReadinessInlineProps) {
  const blocked = readiness.requirements.length > 0 || readiness.status === 'blocked'
  const ready = readiness.canSavePaused && readiness.requirements.length === 0
  const tone = blocked
    ? { dot: 'bg-rose-400/85', text: 'text-rose-200', label: 'Falta para ativar' }
    : ready
      ? { dot: 'bg-emerald-400/85', text: 'text-emerald-200', label: 'Pronto para revisão' }
      : { dot: 'bg-amber-400/80', text: 'text-amber-200', label: readiness.maturityLabel }

  return (
    <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        <span className={`text-[12px] font-semibold ${tone.text}`}>{tone.label}</span>
        <span className="text-[11px] text-white/40 ml-1">· {contract.eligibilityConditions.length} filtro(s) · {contract.signalConditions.length} sinal(is) real(is)</span>
      </div>

      {readiness.requirements.length > 0 && (
        <ul className="mt-2 space-y-1">
          {readiness.requirements.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-[11.5px] text-white/70 leading-snug"><span className="mt-[5px] h-1 w-1 rounded-full bg-rose-400/70 shrink-0" />{r}</li>
          ))}
        </ul>
      )}

      {readiness.requirements.length === 0 && (
        <ul className="mt-2 space-y-1">
          <li className="flex items-start gap-2 text-[11.5px] text-white/70 leading-snug"><span className="mt-[5px] h-1 w-1 rounded-full bg-emerald-400/70 shrink-0" />Regra executável pelo backend</li>
          {contract.resolutionMode === 'tracked' && <li className="flex items-start gap-2 text-[11.5px] text-white/70 leading-snug"><span className="mt-[5px] h-1 w-1 rounded-full bg-emerald-400/70 shrink-0" />Resolução automática disponível</li>}
        </ul>
      )}

      {readiness.warnings.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.05]">
          <ul className="space-y-1">
            {readiness.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-white/45 leading-snug"><span className="mt-[5px] h-1 w-1 rounded-full bg-amber-400/55 shrink-0" />{w}</li>
            ))}
          </ul>
        </div>
      )}

      {readiness.dataDependencies.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-white/35">Depende de:</span>
          {readiness.dataDependencies.map(d => (
            <span key={d} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07] text-white/60">{d}</span>
          ))}
        </div>
      )}
    </div>
  )
}
