/**
 * AutoOpportunityPromotionPanel — review a radar PROPOSAL before opening the editor. (B21)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the suggested radar built from real opportunity evidence. "Abrir editor"
 * opens CustomPatternModal PRE-FILLED — it NEVER saves or activates a radar. If the
 * proposal is insufficient, the editor button is disabled with an honest reason.
 */
import { X, FlaskConical, AlertTriangle, ShieldCheck, Filter, Crosshair } from 'lucide-react'
import type { AutoOpportunityPromotionPlanDto } from '@/features/command/intelligence/autoEngineTypes'

interface Props {
  plan: AutoOpportunityPromotionPlanDto
  onOpenEditor: (plan: AutoOpportunityPromotionPlanDto) => void
  onCancel: () => void
}

function CondList({ conditions, icon, label }: { conditions: { type: string; params: Record<string, unknown> }[]; icon: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5"><span className="text-white/35">{icon}</span><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</span></div>
      {conditions.length === 0
        ? <p className="text-[11px] text-white/30">—</p>
        : <div className="flex flex-wrap gap-1.5">
            {conditions.map((c, i) => {
              const params = Object.entries(c.params || {}).map(([k, v]) => `${k}=${v}`).join(', ')
              return <span key={i} className="text-[11px] px-2 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-white/70">{c.type}{params ? ` · ${params}` : ''}</span>
            })}
          </div>}
    </div>
  )
}

export function AutoOpportunityPromotionPanel({ plan, onOpenEditor, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#05080d]/82 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-[640px] max-h-[88vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#0b0f16] overflow-hidden animate-fadeIn">
        <header className="shrink-0 px-5 pt-5 pb-4 border-b border-white/[0.07] flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22 shrink-0"><FlaskConical size={17} className="text-[#5EEAD4]" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold text-white/95 tracking-tight">Proposta de radar</h3>
            <p className="text-[12px] text-white/50 mt-0.5">Gerada a partir da oportunidade. Revise e ajuste — nada é salvo automaticamente.</p>
          </div>
          <button onClick={onCancel} type="button" aria-label="Fechar" className="h-8 w-8 rounded-full grid place-items-center text-white/55 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors shrink-0"><X size={15} /></button>
        </header>

        <div className="flex-1 overflow-y-auto sidebar-scroll p-5 space-y-4">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4 space-y-1">
            <p className="text-[14px] text-white/90 font-medium">{plan.suggestedRadarName}</p>
            <p className="text-[12px] text-white/55 leading-relaxed">{plan.suggestedDescription}</p>
            <div className="flex flex-wrap gap-3 pt-2 text-[11px] text-white/45">
              <span>Escopo: <span className="text-white/70">{plan.suggestedScope}</span></span>
              <span>Confiança sugerida: <span className="text-white/70">{plan.suggestedConfidence}</span></span>
              <span>Ação: <span className="text-white/70">{plan.suggestedAction}</span></span>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4 space-y-3">
            <CondList conditions={plan.suggestedEligibilityConditions} icon={<Filter size={13} />} label="Avaliar quando" />
            <CondList conditions={plan.suggestedSignalConditions} icon={<Crosshair size={13} />} label="Disparar se" />
          </div>

          {plan.sourceEvidence.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Evidências usadas</p>
              <ul className="space-y-1">{plan.sourceEvidence.map((e, i) => <li key={i} className="text-[12px] text-white/65 flex gap-2"><span className="text-[#5EEAD4]/60 mt-0.5">·</span>{e}</li>)}</ul>
            </div>
          )}

          {plan.limitations.length > 0 && (
            <div className="rounded-xl border border-amber-400/18 bg-amber-500/[0.05] p-4">
              <div className="flex items-center gap-1.5 mb-2"><AlertTriangle size={13} className="text-amber-300/80" /><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/70">Limitações</span></div>
              <ul className="space-y-1">{plan.limitations.map((l, i) => <li key={i} className="text-[12px] text-amber-100/75 flex gap-2"><span className="mt-0.5">·</span>{l}</li>)}</ul>
            </div>
          )}

          <div className="flex items-start gap-2 text-[11px] text-white/45">
            <ShieldCheck size={13} className="text-[#5EEAD4]/70 shrink-0 mt-px" />
            <span>O radar será aberto para revisão; nada será salvo nem ativado sem a sua confirmação no editor.</span>
          </div>
        </div>

        <footer className="shrink-0 px-5 py-4 border-t border-white/[0.07] bg-black/15 flex items-center gap-2.5">
          <button onClick={onCancel} type="button" className="px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-white/60 hover:text-white/90 transition-colors mr-auto">Cancelar</button>
          <button
            onClick={() => onOpenEditor(plan)} type="button" disabled={!plan.sufficient}
            className="px-5 py-2.5 rounded-[10px] text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] transition-colors disabled:opacity-30 disabled:hover:bg-[#13B8A6]"
            title={plan.sufficient ? undefined : 'Evidência insuficiente para gerar um radar executável'}
          >Abrir editor de radar</button>
        </footer>
      </div>
    </div>
  )
}
