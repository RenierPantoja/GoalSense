import { useState } from 'react'
import { Check, X, Loader2, AlertTriangle, Send } from 'lucide-react'
import type { TelegramApprovalQueueItem } from '@/services/useTelegramApprovalQueue'

interface Props {
  loading: boolean
  items: TelegramApprovalQueueItem[]
  approvingIds: Set<string>
  ignoringIds: Set<string>
  onApprove: (alertId: string, channelId: string) => Promise<{ success: boolean; error?: string }>
  onIgnore: (alertId: string) => Promise<{ success: boolean; error?: string }>
  onRefresh: () => void
}

export function TelegramApprovalQueuePanel({ loading, items, approvingIds, ignoringIds, onApprove, onIgnore, onRefresh }: Props) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  // Local state for selecting the channel if there are multiple eligible channels for an item
  const [selectedChannels, setSelectedChannels] = useState<Record<string, string>>({})

  const handleApprove = async (item: TelegramApprovalQueueItem) => {
    setErrorMsg(null)
    const channelId = selectedChannels[item.alertId] || item.eligibleChannels[0]?.channelId
    if (!channelId) return
    
    const res = await onApprove(item.alertId, channelId)
    if (!res.success) {
      setErrorMsg(res.error || 'Falha ao aprovar')
    }
  }

  const handleIgnore = async (alertId: string) => {
    setErrorMsg(null)
    const res = await onIgnore(alertId)
    if (!res.success) {
      setErrorMsg(res.error || 'Falha ao ignorar')
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-white/90 flex items-center gap-2">
          <Send size={14} className="text-cyan-400" /> Fila de Aprovação Telegram
          {items.length > 0 && <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 text-[10px]">{items.length} pendentes</span>}
        </h3>
        <button onClick={onRefresh} disabled={loading} className="text-[10px] text-white/40 hover:text-white/70 disabled:opacity-50 transition-colors" type="button">
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {errorMsg && (
        <div className="text-[11px] text-rose-400/80 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
          {errorMsg}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-6 text-[12px] text-white/30 border border-dashed border-white/[0.05] rounded-xl bg-white/[0.01]">
          {loading ? 'Buscando alertas...' : 'Nenhum alerta pendente de aprovação.'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const ev = safeParseJson(item.alert.evidenceJson, {})
            const isApproving = approvingIds.has(item.alertId)
            const isIgnoring = ignoringIds.has(item.alertId)
            const isBusy = isApproving || isIgnoring

            return (
              <div key={item.alertId} className="rounded-xl border border-white/[0.06] bg-[#0c1220]/50 p-3">
                {/* Header */}
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-[12px] font-medium text-white/80">{ev.patternName || 'Padrão'}</div>
                    <div className="text-[11px] text-white/50">{ev.homeTeam} x {ev.awayTeam}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-emerald-400/90 font-medium">{item.alert.triggerScoreHome} - {item.alert.triggerScoreAway}</div>
                    <div className="text-[10px] text-white/40">{item.alert.triggerMinute ? `${item.alert.triggerMinute}'` : 'HT/FT'}</div>
                  </div>
                </div>

                {/* Info / Channels */}
                <div className="text-[10px] bg-white/[0.02] border border-white/[0.04] rounded-lg px-2.5 py-2 mb-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-white/40">Confiança: <span className="text-white/70">{item.alert.confidence}%</span></span>
                    {item.warnings.length > 0 && <span className="text-amber-400/80 flex items-center gap-1"><AlertTriangle size={10} /> {item.warnings.length} aviso(s)</span>}
                  </div>
                  
                  {item.eligibleChannels.length === 1 ? (
                    <div className="text-white/60">Destino: <span className="text-cyan-300">{item.eligibleChannels[0].channelName}</span></div>
                  ) : item.eligibleChannels.length > 1 ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-white/60">Destino:</span>
                      <select 
                        className="bg-white/[0.05] border border-white/[0.08] rounded px-1.5 py-0.5 text-white/80 focus:outline-none"
                        value={selectedChannels[item.alertId] || item.eligibleChannels[0].channelId}
                        onChange={e => setSelectedChannels(prev => ({ ...prev, [item.alertId]: e.target.value }))}
                      >
                        {item.eligibleChannels.map(ch => (
                          <option key={ch.channelId} value={ch.channelId}>{ch.channelName}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-rose-400/80">Sem canais elegíveis (Isto não deveria aparecer aqui).</div>
                  )}

                  {/* Blocked Channels summary */}
                  {item.blockedChannels.length > 0 && (
                    <div className="text-white/30 mt-1.5 border-t border-white/[0.04] pt-1.5">
                      Bloqueado em {item.blockedChannels.length} canal(is): {item.blockedChannels.map(b => b.channelName).join(', ')}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleApprove(item)}
                    disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                    type="button"
                  >
                    {isApproving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Aprovar Envio
                  </button>
                  <button 
                    onClick={() => handleIgnore(item.alertId)}
                    disabled={isBusy}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/50 border border-white/[0.06] hover:bg-white/[0.02] hover:text-white/70 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    type="button"
                  >
                    {isIgnoring ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                    Ignorar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function safeParseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}
