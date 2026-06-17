/**
 * EngineReadinessPanel — Radar Blueprint 3.0 right column
 * ─────────────────────────────────────────────────────────────────────────────
 * Answers the only question that matters before activating: "can the engine
 * execute this radar safely?". Driven entirely by `getRadarReadiness` +
 * `compileRadarContract` — never invents a green state.
 */
import type { RadarContract, RadarReadiness } from '../../../intelligence/radarReadiness'

interface EngineReadinessPanelProps {
  readiness: RadarReadiness
  contract: RadarContract
  actionLabel: string
}

const TONE: Record<string, { dot: string; text: string; chip: string; ring: string }> = {
  blocked: { dot: 'bg-rose-400/85', text: 'text-rose-300', chip: 'bg-rose-500/10 border-rose-400/20 text-rose-300', ring: 'border-rose-400/20' },
  warn: { dot: 'bg-amber-400/85', text: 'text-amber-300', chip: 'bg-amber-500/10 border-amber-400/20 text-amber-200', ring: 'border-amber-400/15' },
  ready: { dot: 'bg-emerald-400/85', text: 'text-emerald-300', chip: 'bg-emerald-500/10 border-emerald-400/20 text-emerald-200', ring: 'border-emerald-400/15' },
  neutral: { dot: 'bg-white/40', text: 'text-white/70', chip: 'bg-white/[0.04] border-white/[0.08] text-white/60', ring: 'border-white/[0.06]' },
}

export function EngineReadinessPanel({ readiness, contract, actionLabel }: EngineReadinessPanelProps) {
  const blocked = readiness.status === 'blocked' || readiness.requirements.length > 0
  const ready = readiness.status === 'ready_to_activate' || readiness.status === 'ready_for_review'
  const tone = blocked ? TONE.blocked : ready ? TONE.ready : readiness.warnings.length > 0 ? TONE.warn : TONE.neutral

  const headline = blocked ? 'Bloqueado para ativar' : ready ? (readiness.status === 'ready_to_activate' ? 'Pronto para ativar' : 'Pronto para revisão') : readiness.maturityLabel

  const engineWill: string[] = []
  if (contract.eligibilityConditions.length > 0) engineWill.push(`avaliar quando ${contract.eligibilityConditions.length} filtro(s) baterem`)
  else engineWill.push('avaliar partidas ao vivo')
  if (contract.signalConditions.length > 0) engineWill.push(`exigir ${contract.signalConditions.length} sinal(is) real(is)`)
  engineWill.push(contract.resolutionMode === 'tracked' ? 'registrar alerta e acompanhar a resolução' : actionLabel.toLowerCase())

  return (
    <section className={`rounded-[16px] border ${tone.ring} bg-white/[0.012] overflow-hidden`}>
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Prontidão do motor</span>
        <div className="flex items-center gap-2 mt-2">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          <span className={`text-[14px] font-semibold ${tone.text}`}>{headline}</span>
        </div>
      </div>

      {/* Counts */}
      <div className="px-4 py-3 border-b border-white/[0.05] grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2">
          <span className="text-[18px] font-bold tabular-nums text-white/90 leading-none">{readiness.counts.eligibility}</span>
          <span className="block text-[10px] text-white/45 mt-1">Filtros</span>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${readiness.counts.signal > 0 ? 'border-emerald-400/15 bg-emerald-500/[0.04]' : 'border-amber-400/20 bg-amber-500/[0.04]'}`}>
          <span className={`text-[18px] font-bold tabular-nums leading-none ${readiness.counts.signal > 0 ? 'text-emerald-200' : 'text-amber-200'}`}>{readiness.counts.signal}</span>
          <span className="block text-[10px] text-white/45 mt-1">Sinais reais</span>
        </div>
      </div>

      {/* Blockers / requirements */}
      {readiness.requirements.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300/80 block mb-2">Falta para ativar</span>
          <ul className="space-y-1.5">
            {readiness.requirements.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[11.5px] text-white/75 leading-snug"><span className="mt-[5px] h-1 w-1 rounded-full bg-rose-400/70 shrink-0" />{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Ready: what the engine will do */}
      {readiness.requirements.length === 0 && (
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/80 block mb-2">O motor vai</span>
          <ul className="space-y-1.5">
            {engineWill.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[11.5px] text-white/80 leading-snug"><span className="mt-[5px] h-1 w-1 rounded-full bg-emerald-400/70 shrink-0" />{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {readiness.warnings.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/75 block mb-2">Avisos</span>
          <ul className="space-y-1.5">
            {readiness.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-white/60 leading-snug"><span className="mt-[5px] h-1 w-1 rounded-full bg-amber-400/60 shrink-0" />{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Data dependencies */}
      {readiness.dataDependencies.length > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 block mb-2">Dependências de dados</span>
          <div className="flex flex-wrap gap-1.5">
            {readiness.dataDependencies.map(d => (
              <span key={d} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07] text-white/65">{d}</span>
            ))}
          </div>
        </div>
      )}

      {/* Backend compatibility footer */}
      <div className="px-4 py-3 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${contract.backendCompatibility.compatible ? 'bg-emerald-400/85' : 'bg-rose-400/85'}`} />
        <span className={`text-[11px] ${contract.backendCompatibility.compatible ? 'text-white/65' : 'text-rose-300'}`}>
          {contract.backendCompatibility.compatible ? 'Condições suportadas pelo motor' : 'Condição não suportada pelo motor'}
        </span>
      </div>
    </section>
  )
}
