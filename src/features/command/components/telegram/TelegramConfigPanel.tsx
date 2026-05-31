/**
 * TelegramConfigPanel — channel management in advanced mode.
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { TelegramChannelView } from '@/services/useTelegramIntegration'

interface Props {
  enabled: boolean
  configured: boolean
  channels: TelegramChannelView[]
  onAddChannel: (name: string, chatId: string, type?: string) => Promise<{ success: boolean; error?: string }>
  onRemoveChannel: (id: string) => Promise<{ success: boolean; error?: string }>
}

export function TelegramConfigPanel({ enabled, configured, channels, onAddChannel, onRemoveChannel }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [chatId, setChatId] = useState('')
  const [type, setType] = useState<'group' | 'channel' | 'private'>('group')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim() || !chatId.trim()) return
    setAdding(true)
    setError(null)
    const res = await onAddChannel(name.trim(), chatId.trim(), type)
    if (res.success) {
      setName('')
      setChatId('')
      setShowForm(false)
    } else {
      setError(res.error || 'Falha ao criar canal')
    }
    setAdding(false)
  }

  if (!enabled) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3">
        <span className="text-[11px] text-white/40">Telegram desativado no backend (TELEGRAM_ENABLED=false)</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-white/55">Telegram · {channels.length} canal{channels.length !== 1 ? 'is' : ''}</span>
        <button onClick={() => setShowForm(!showForm)} className="text-[10px] text-cyan-400/60 hover:text-cyan-400/90 transition-colors" type="button">
          {showForm ? 'Cancelar' : '+ Canal'}
        </button>
      </div>

      {/* Channel list */}
      {channels.length > 0 && (
        <div className="space-y-1.5">
          {channels.map(ch => (
            <div key={ch.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-white/70 truncate">{ch.name} <span className="text-white/30">({ch.type})</span></span>
              <button onClick={() => onRemoveChannel(ch.id)} className="text-white/25 hover:text-rose-400/70 transition-colors shrink-0" type="button" aria-label="Remover"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="space-y-2 pt-2 border-t border-white/[0.05]">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do canal" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white/80 placeholder:text-white/30 focus:outline-none focus:border-cyan-400/30" />
          <input value={chatId} onChange={e => setChatId(e.target.value)} placeholder="Chat ID (ex: -1001234567890)" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white/80 placeholder:text-white/30 focus:outline-none focus:border-cyan-400/30" />
          <select value={type} onChange={e => setType(e.target.value as any)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white/80 focus:outline-none">
            <option value="group">Grupo</option>
            <option value="channel">Canal</option>
            <option value="private">Privado</option>
          </select>
          {error && <div className="text-[10px] text-rose-400/70">{error}</div>}
          <button onClick={handleAdd} disabled={adding || !name.trim() || !chatId.trim()} className="w-full px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-400/15 hover:bg-cyan-500/20 transition-colors disabled:opacity-30" type="button">
            {adding ? 'Criando...' : 'Adicionar canal'}
          </button>
        </div>
      )}
    </div>
  )
}
