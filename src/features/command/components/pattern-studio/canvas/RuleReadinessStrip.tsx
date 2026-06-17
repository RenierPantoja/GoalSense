/**
 * RuleReadinessStrip — Radar Blueprint 3.5-final integrated readiness
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the fixed side panel: a calm, horizontal strip rendered right below
 * the rule. No tall card, no inner scroll, no clipped content. Driven by
 * getRadarReadiness + compileRadarContract.
 */
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import type { RadarContract, RadarReadiness } from '../../../intelligence/radarReadiness'

interface RuleReadinessStripProps {
  readiness: RadarReadiness
  contract: RadarContract
}

export function RuleReadinessStrip({ readiness, contract }: RuleReadinessStripProps) {
  const blocked = readiness.requirements.length > 0 || readiness.status === 'blocked'
  const ready = readiness.canSavePaused && readiness.requirements.length === 0
  const elig = contract.eligibilityConditions.length
  const sig = contract.signalConditions.length

  const dot = blocked ? 'bg-[#FF5A52]' : ready ? 'bg-[#34D399]' : 'bg-[#FFB02E]'
  const headline = readiness.status === 'ready_to_activate'
    ? 'Contrato confirmado. Pronto para ativar.'
    : ready
      ? `Regra executável pelo backend · ${elig} filtro${elig === 1 ? '' : 's'} · ${sig} sinal${sig === 1 ? '' : 's'} real${sig === 1 ? '' : 'is'}. Revise para ativar.`
      : readiness.primaryMessage

  return (
    <div className="mt-6 rounded-[16px] border border-white/[0.07] bg-white/[0.025] px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`mt-[5px] h-2 w-2 rounded-full shrink-0 ${dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-white/85 leading-snug">{headline}</p>

          {readiness.requirements.length > 0 && (
            <ul className="mt-2 space-y-1">
              {readiness.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-white/55 leading-snug"><span className="mt-[6px] h-1 w-1 rounded-full bg-[#FF5A52]/70 shrink-0" />{r}</li>
              ))}
            </ul>
          )}

          {readiness.warnings.length > 0 && (
            <p className="mt-2 text-[11.5px] text-white/40 leading-snug">{readiness.warnings.join(' · ')}</p>
          )}

          {readiness.dataDependencies.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] text-white/30">Depende de</span>
              {readiness.dataDependencies.map(d => (
                <span key={d} className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/55">{d}</span>
              ))}
            </div>
          )}
        </div>

        <span className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium border ${contract.backendCompatibility.compatible ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#7FE7B5]' : 'border-[#FF5A52]/25 bg-[#FF5A52]/10 text-[#FF9D96]'}`}>
          {contract.backendCompatibility.compatible ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
          {contract.backendCompatibility.compatible ? 'Compatível' : 'Incompatível'}
        </span>
      </div>
    </div>
  )
}
