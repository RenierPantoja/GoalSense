/**
 * RadarContractView — Radar Blueprint 3.0 executable contract (review)
 * ─────────────────────────────────────────────────────────────────────────────
 * Plain-Portuguese, auditable statement of exactly what the engine will do.
 * Shown in the review section; activation only happens after this is seen.
 */
import { formatConditionHuman } from '../../../utils/commandFormatters'
import type { RadarContract } from '../../../intelligence/radarReadiness'

interface RadarContractViewProps {
  name: string
  contract: RadarContract
  actionLabel: string
}

export function RadarContractView({ name, contract, actionLabel }: RadarContractViewProps) {
  const sevLabel = contract.severity === 'critical' ? 'Crítico' : contract.severity === 'attention' ? 'Atenção' : 'Informação'
  const elig = contract.eligibilityConditions
  const sig = contract.signalConditions

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05]">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300/80">Contrato do radar</span>
        <h4 className="text-[16px] font-semibold text-white/95 mt-1.5 leading-tight">{name || 'Sem nome'}</h4>
        <p className="text-[12px] text-white/55 mt-1">Vai monitorar <span className="text-white/85 font-medium">{contract.scopeLabel}</span>.</p>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 block mb-2">O motor avaliará a partida quando</span>
          {elig.length === 0 ? (
            <p className="text-[12px] text-white/55">estiver ao vivo (sem filtro de tempo adicional)</p>
          ) : (
            <ul className="space-y-1">
              {elig.map((c, i) => <li key={i} className="flex items-start gap-2 text-[12.5px] text-white/85"><span className="mt-[6px] h-1 w-1 rounded-full bg-white/45 shrink-0" />{formatConditionHuman(c)}</li>)}
            </ul>
          )}
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/75 block mb-2">O alerta será disparado se</span>
          {sig.length === 0 ? (
            <p className="text-[12px] text-amber-300/80">nenhum sinal real definido — adicione ao menos 1</p>
          ) : (
            <ul className="space-y-1">
              {sig.map((c, i) => <li key={i} className="flex items-start gap-2 text-[12.5px] text-white/90"><span className="mt-[6px] h-1 w-1 rounded-full bg-emerald-400/75 shrink-0" />{formatConditionHuman(c)}</li>)}
            </ul>
          )}
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 block mb-2">Ao disparar</span>
          <ul className="space-y-1 text-[12.5px] text-white/85">
            <li className="flex items-start gap-2"><span className="mt-[6px] h-1 w-1 rounded-full bg-cyan-400/70 shrink-0" />{actionLabel}{contract.resolutionMode === 'tracked' ? ' em /app/alerts' : ''}</li>
            {contract.resolutionMode === 'tracked' && <li className="flex items-start gap-2"><span className="mt-[6px] h-1 w-1 rounded-full bg-cyan-400/70 shrink-0" />acompanha a resolução automaticamente</li>}
            <li className="flex items-start gap-2"><span className="mt-[6px] h-1 w-1 rounded-full bg-cyan-400/70 shrink-0" />confiança mínima ≥ {contract.confidence}%</li>
          </ul>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-white/[0.05] flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.05] text-white/65 border border-white/[0.07]">{sevLabel}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.04] text-white/55 border border-white/[0.07]">{elig.length} filtro(s)</span>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${sig.length > 0 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/15' : 'bg-amber-500/10 text-amber-200 border-amber-400/20'}`}>{sig.length} sinal(is)</span>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${contract.backendCompatibility.compatible ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/15' : 'bg-rose-500/10 text-rose-300 border-rose-400/20'}`}>{contract.backendCompatibility.compatible ? 'motor compatível' : 'incompatível'}</span>
      </div>
    </section>
  )
}
