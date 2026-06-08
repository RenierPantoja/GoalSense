/**
 * SendTelegramSignalModal — confirmation modal for manual Telegram signal delivery.
 * Phase C1.1: User must explicitly confirm before sending.
 */
import { useState, useEffect, useMemo } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { TelegramChannelView } from '@/services/useTelegramIntegration'
import type { HybridCommandAlert } from '@/services/hybridAlertMerge'
import { evaluateTelegramEligibilityPreview } from '@/services/telegramEligibilityPreview'

interface Props {
  alertId: string
  patternName: string
  matchLabel: string
  minute: number | null
  score: { home: number; away: number }
  confidence: number
  channels: TelegramChannelView[]
  sentChannelIds?: Set<string>
  alert?: HybridCommandAlert
  serverEligibility?: any[] | null
  getEligibilityForAlert?: (alertId: string) => Promise<any>
  onSend: (alertId: string, channelId: string) => Promise<{ success: boolean; error?: string }>
  onClose: () => void
}

export function SendTelegramSignalModal({ alertId, patternName, matchLabel, minute, score, confidence, channels, sentChannelIds, alert: hybridAlert, serverEligibility: initialServerEligibility, getEligibilityForAlert, onSend, onClose }: Props) {
  const [serverEligibility, setServerEligibility] = useState<any[] | null>(initialServerEligibility || null)
  const [fetchingEligibility, setFetchingEligibility] = useState(!initialServerEligibility && !!getEligibilityForAlert)

  useEffect(() => {
    if (!initialServerEligibility && getEligibilityForAlert) {
      let isMounted = true
      getEligibilityForAlert(alertId).then(res => {
        if (isMounted) {
          setServerEligibility(res || null)
          setFetchingEligibility(false)
        }
      }).catch(() => {
        if (isMounted) setFetchingEligibility(false)
      })
      return () => { isMounted = false }
    } else {
      setFetchingEligibility(false)
    }
  }, [alertId, initialServerEligibility, getEligibilityForAlert])

  const activeChannels = channels.filter(c => c.isActive)
  const availableChannels = useMemo(() => activeChannels.filter(c => {
    let alreadySent = sentChannelIds?.has(c.id)
    if (serverEligibility) {
      const s = serverEligibility.find(x => x.channelId === c.id)
      if (s && s.alreadySent) alreadySent = true
      if (s && !s.eligible) return false
    } else {
      if (alreadySent) return false
      if (hybridAlert && c.rules) {
        const preview = evaluateTelegramEligibilityPreview(hybridAlert, c.rules)
        if (!preview.eligible) return false
      }
    }
    return !alreadySent
  }), [activeChannels, sentChannelIds, serverEligibility, hybridAlert])
  const [selectedChannel, setSelectedChannel] = useState(availableChannels[0]?.id || '')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)

  const allSent = availableChannels.length === 0 && activeChannels.length > 0

  const handleSend = async () => {
    if (!selectedChannel) return
    setSending(true)
    setResult(null)
    const res = await onSend(alertId, selectedChannel)
    setResult(res)
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0c1220] border border-white/[0.1] rounded-2xl w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[16px] font-bold text-white/90">Enviar para Telegram</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors" type="button" aria-label="Fechar"><X size={18} /></button>
        </div>

        {/* Alert Summary */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 mb-4">
          <div className="text-[12px] font-semibold text-white/80 mb-1">{patternName}</div>
          <div className="text-[11px] text-white/55 space-y-0.5">
            <div>{matchLabel}</div>
            {minute != null && <div>Minuto: {minute}'</div>}
            <div>Placar: {score.home}–{score.away}</div>
            <div>Confiança: {confidence}%</div>
          </div>
        </div>

        {/* Channel Selection */}
        {activeChannels.length === 0 ? (
          <div className="text-[12px] text-amber-300/70 mb-4">Nenhum canal ativo configurado.</div>
        ) : allSent ? (
          <div className="text-[12px] text-emerald-300/70 mb-4">Este alerta já foi enviado para todos os canais ativos.</div>
        ) : (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-white/55 font-medium block">Canal de destino</label>
              <span className="text-[10px] text-white/30">{fetchingEligibility ? <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Verificando regras...</span> : serverEligibility ? '✅ Prévia do servidor' : '⚠️ Prévia local'}</span>
            </div>
            <select
              value={selectedChannel}
              onChange={e => setSelectedChannel(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-white/85 focus:outline-none focus:border-cyan-400/30"
            >
              {activeChannels.map(ch => {
                let alreadySent = sentChannelIds?.has(ch.id)
                let blocked = false
                let blockReason = ''

                if (serverEligibility) {
                  const s = serverEligibility.find(x => x.channelId === ch.id)
                  if (s) {
                    if (s.alreadySent) alreadySent = true
                    if (!s.eligible) { blocked = true; blockReason = s.blockedReasons[0] || 'Bloqueado pelo servidor' }
                  }
                } else if (!alreadySent && hybridAlert && ch.rules) {
                  const preview = evaluateTelegramEligibilityPreview(hybridAlert, ch.rules)
                  if (!preview.eligible) { blocked = true; blockReason = preview.blockedReasons[0] || 'Regra do canal' }
                }

                return <option key={ch.id} value={ch.id} disabled={alreadySent || blocked}>{ch.name} ({ch.type}){alreadySent ? ' — Já enviado' : blocked ? ` — ${blockReason}` : ''}</option>
              })}
            </select>
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-[10px] text-white/40 mb-4 leading-relaxed">
          ⚠️ Este sinal será enviado manualmente ao canal selecionado. Não há garantia de resultado. O envio é registrado para auditoria.
        </div>

        {/* Result */}
        {result && (
          <div className={`text-[11px] mb-3 px-3 py-2 rounded-lg ${result.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/15' : 'bg-rose-500/10 text-rose-300 border border-rose-400/15'}`}>
            {result.success ? '✓ Enviado com sucesso' : `✗ ${result.error || 'Falha no envio'}`}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/55 border border-white/[0.07] hover:text-white/80 transition-colors" type="button">
            {result?.success ? 'Fechar' : 'Cancelar'}
          </button>
          {!result?.success && (
            <button
              onClick={handleSend}
              disabled={sending || !selectedChannel || activeChannels.length === 0 || allSent}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-400/20 hover:bg-cyan-500/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              type="button"
            >
              {sending ? 'Enviando...' : 'Confirmar envio'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
