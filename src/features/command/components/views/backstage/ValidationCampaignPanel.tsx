/**
 * ValidationCampaignPanel (B50).
 * ─────────────────────────────────────────────────────────────────────────────
 * Groups several daily validation reports across a 7–14 day campaign. Observational;
 * a campaign summary is NOT a promise of accuracy.
 */
import { useCallback, useEffect, useState } from 'react'
import { CalendarRange, Plus, Square } from 'lucide-react'
import { localValidationApi } from '@/services/localValidationApi'
import type { ValidationCampaignDto } from '@/features/matchIntelligence/validationCampaignTypes'

export function ValidationCampaignPanel({ isAdmin }: { isAdmin: boolean }) {
  const [campaigns, setCampaigns] = useState<ValidationCampaignDto[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)

  const load = useCallback(async () => {
    const r = await localValidationApi.listValidationCampaigns()
    if (r.reason === 'env_gate' || r.status === 403) { setDisabled(true); return }
    if (r.ok && r.data) setCampaigns(r.data)
  }, [])
  useEffect(() => { void load() }, [load])

  if (disabled) return null

  const create = async () => {
    const r = await localValidationApi.createValidationCampaign(`Campanha ${new Date().toISOString().slice(0, 10)}`, 14)
    if (r.ok) { setMsg('Campanha criada.'); await load() } else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }
  const close = async (id: string) => {
    const r = await localValidationApi.closeValidationCampaign(id)
    if (r.ok) { setMsg('Campanha encerrada.'); await load() } else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarRange size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Campanha de validação (B50)</h4>
        {isAdmin && <button type="button" onClick={create} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1"><Plus size={11} />Nova</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}
      {campaigns.length === 0 ? <p className="text-[11px] text-white/40">Nenhuma campanha. Crie uma e anexe relatórios diários por 7–14 dias.</p> : (
        <div className="space-y-1">
          {campaigns.map(c => (
            <div key={c.id} className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-white/80 font-medium flex-1 truncate">{c.title}</span>
                <span className="text-[9.5px] text-white/45">{c.actualDays}/{c.targetDays} dias · {c.status}</span>
                {isAdmin && c.status === 'running' && <button type="button" onClick={() => close(c.id)} className="text-white/40 hover:text-rose-300/80 inline-flex items-center gap-1 text-[10px]"><Square size={10} />encerrar</button>}
              </div>
              <p className="text-[10px] text-white/45 mt-0.5">analisadas {c.aggregateMetrics.fixturesAnalyzed} · c/ dados {c.aggregateMetrics.fixturesWithData} · causal aval. {c.aggregateMetrics.causalEvaluable}/não {c.aggregateMetrics.causalNotEvaluable}</p>
              {c.finalRecommendation && <p className="text-[10px] text-sky-200/55 mt-0.5">{c.finalRecommendation}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-white/30 mt-2">Campanha observacional — resumo não é promessa de acerto. Mínimo recomendado: 7–14 dias reais.</p>
    </div>
  )
}
