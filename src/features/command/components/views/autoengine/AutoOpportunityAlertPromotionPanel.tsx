/**
 * AutoOpportunityAlertPromotionPanel — promote an opportunity to a MONITORED ALERT. (B22)
 * ─────────────────────────────────────────────────────────────────────────────
 * Human-confirmed only. Loads a preview, shows what will be monitored + evidence +
 * risks + limitations, requires 3 explicit acknowledgements, then creates a tracked
 * alert. No Telegram, no odds, no bet. Disabled/blocked states are honest.
 */
import { useEffect, useState } from 'react'
import { X, BellRing, AlertTriangle, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react'
import { autoEngineApi } from '@/services/autoEngineApi'
import type { ManualAlertPromotionPreviewDto, ManualAlertPromotionResultDto } from '@/features/command/intelligence/autoEngineTypes'
import { PROMOTION_BLOCK_LABEL } from '@/features/command/intelligence/autoEngineTypes'

interface Props {
  opportunityId: string
  onClose: () => void
  onPromoted: (opportunityId: string, alertId: string) => void
  onGoToAlerts?: () => void
}

export function AutoOpportunityAlertPromotionPanel({ opportunityId, onClose, onPromoted, onGoToAlerts }: Props) {
  const [preview, setPreview] = useState<ManualAlertPromotionPreviewDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [disabledMsg, setDisabledMsg] = useState<string | null>(null)
  const [ack, setAck] = useState({ tg: false, odds: false, guarantee: false })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ManualAlertPromotionResultDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    autoEngineApi.getAlertPromotionPreview(opportunityId).then(r => {
      if (!alive) return
      if (r.ok) setPreview(r.data)
      else setError(r.error || 'Não foi possível carregar o preview.')
      setLoading(false)
    })
    return () => { alive = false }
  }, [opportunityId])

  const allAck = ack.tg && ack.odds && ack.guarantee
  const alreadyPromoted = preview?.duplicateCheck.alreadyPromoted
  const canSubmit = !!preview && preview.canPromote && allAck && !submitting && !alreadyPromoted

  const submit = async () => {
    if (!preview) return
    setSubmitting(true); setError(null); setDisabledMsg(null)
    const r = await autoEngineApi.promoteOpportunityToAlert(opportunityId, {
      userConfirmed: true, confirmationMode: 'explicit_click', acknowledgeNoTelegram: true, acknowledgeNoOdds: true, acknowledgeNotGuaranteed: true,
    })
    if (r.disabled) { setDisabledMsg(r.error || 'Promoção manual desabilitada neste ambiente.'); setSubmitting(false); return }
    if (r.ok && r.data && r.data.success && r.data.alertId) {
      setResult(r.data)
      onPromoted(opportunityId, r.data.alertId)
    } else {
      setError(r.error || 'Não foi possível promover a oportunidade.')
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#05080d]/82 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-[640px] max-h-[88vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#0b0f16] overflow-hidden animate-fadeIn">
        <header className="shrink-0 px-5 pt-5 pb-4 border-b border-white/[0.07] flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22 shrink-0"><BellRing size={17} className="text-[#5EEAD4]" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold text-white/95 tracking-tight">Promover para alerta monitorado</h3>
            <p className="text-[12px] text-white/50 mt-0.5">Cria um alerta rastreável a partir desta oportunidade. Confirmação humana obrigatória.</p>
          </div>
          <button onClick={onClose} type="button" aria-label="Fechar" className="h-8 w-8 rounded-full grid place-items-center text-white/55 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors shrink-0"><X size={15} /></button>
        </header>

        <div className="flex-1 overflow-y-auto sidebar-scroll p-5 space-y-4">
          {loading && <p className="text-[12px] text-white/45">Carregando preview…</p>}
          {disabledMsg && <div className="rounded-xl border border-amber-400/18 bg-amber-500/[0.05] px-4 py-3 text-[12px] text-amber-100/75">{disabledMsg}</div>}
          {error && !result && <div className="rounded-xl border border-rose-400/18 bg-rose-500/[0.05] px-4 py-3 text-[12px] text-rose-200/80">{error}</div>}

          {result && (
            <div className="rounded-xl border border-[#2DD4BF]/20 bg-[#13B8A6]/[0.06] p-4">
              <div className="flex items-center gap-2 text-[#7FE9DC]"><CheckCircle2 size={16} /><span className="text-[13px] font-semibold">{result.duplicate ? 'Alerta já existente' : 'Alerta monitorado criado'}</span></div>
              <p className="text-[12px] text-white/60 mt-1.5">alertId: <span className="text-white/85 font-mono text-[11px]">{result.alertId}</span></p>
              {onGoToAlerts && <button type="button" onClick={onGoToAlerts} className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] transition-colors">Abrir em Alertas →</button>}
            </div>
          )}

          {preview && !result && (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-1">O que será monitorado</p>
                <p className="text-[14px] text-white/90 font-medium">{preview.proposedAlertTitle}</p>
                <p className="text-[12px] text-white/55">{preview.fixtureLabel} · {preview.proposedAlertReason}</p>
                <div className="flex flex-wrap gap-3 pt-2 text-[11px] text-white/45">
                  <span>Severidade: <span className="text-white/70">{preview.proposedSeverity}</span></span>
                  <span>Confiança: <span className="text-white/70">{preview.proposedConfidence}</span> <span className="text-white/35">(qualidade de sinal, não probabilidade)</span></span>
                </div>
              </div>

              {preview.evidence.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Evidências</p>
                  <ul className="space-y-1">{preview.evidence.map((e, i) => <li key={i} className="text-[12px] text-white/65 flex gap-2"><span className="text-[#5EEAD4]/60 mt-0.5">·</span>{e}</li>)}</ul>
                </div>
              )}

              {preview.risks.length > 0 && (
                <div className="rounded-xl border border-amber-400/18 bg-amber-500/[0.05] p-4">
                  <div className="flex items-center gap-1.5 mb-2"><AlertTriangle size={13} className="text-amber-300/80" /><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/70">Riscos</span></div>
                  <ul className="space-y-1">{preview.risks.map((r, i) => <li key={i} className="text-[12px] text-amber-100/75 flex gap-2"><span className="mt-0.5">·</span>{r}</li>)}</ul>
                </div>
              )}

              {preview.limitations.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Limitações</p>
                  <ul className="space-y-1">{preview.limitations.map((l, i) => <li key={i} className="text-[12px] text-white/60 flex gap-2"><span className="text-white/30 mt-0.5">·</span>{l}</li>)}</ul>
                </div>
              )}

              {!preview.canPromote ? (
                <div className="rounded-xl border border-amber-400/18 bg-amber-500/[0.05] px-4 py-3">
                  <p className="text-[12px] text-amber-100/80 font-medium mb-1">Não é possível promover esta oportunidade:</p>
                  <ul className="space-y-0.5">{preview.blockedReasons.map((b, i) => <li key={i} className="text-[11.5px] text-amber-100/70">· {PROMOTION_BLOCK_LABEL[b] || b.replace(/_/g, ' ')}</li>)}</ul>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4 space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Confirmações obrigatórias</p>
                  <Check checked={ack.guarantee} onChange={v => setAck(s => ({ ...s, guarantee: v }))} label="Entendo que isto não é garantia de acerto — o score é qualidade de sinal, não probabilidade." />
                  <Check checked={ack.tg} onChange={v => setAck(s => ({ ...s, tg: v }))} label="Entendo que este alerta não envia Telegram nesta fase." />
                  <Check checked={ack.odds} onChange={v => setAck(s => ({ ...s, odds: v }))} label="Entendo que não há odds nem aposta envolvidas nesta fase." />
                </div>
              )}
            </>
          )}
        </div>

        {preview && !result && (
          <footer className="shrink-0 px-5 py-4 border-t border-white/[0.07] bg-black/15 flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-white/40 mr-auto"><ShieldCheck size={13} className="text-[#5EEAD4]/70" />Nenhum alerta é criado sem a sua confirmação.</div>
            <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-white/60 hover:text-white/90 transition-colors">Cancelar</button>
            <button onClick={submit} type="button" disabled={!canSubmit} className="px-5 py-2.5 rounded-[10px] text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] transition-colors disabled:opacity-30 inline-flex items-center gap-2">
              {submitting && <Loader2 size={14} className="animate-spin" />}Criar alerta monitorado
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 accent-[#13B8A6]" />
      <span className="text-[12px] text-white/70 leading-snug">{label}</span>
    </label>
  )
}
