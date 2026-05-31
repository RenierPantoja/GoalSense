/**
 * TelegramConfigPanel — channel management in advanced mode.
 */
import { useState } from 'react'
import { Trash2, Settings } from 'lucide-react'
import type { TelegramChannelView } from '@/services/useTelegramIntegration'
import type { TelegramChannelRules } from '@/services/telegramEligibilityPreview'
import { getRulesSummaryLabel } from '@/services/telegramEligibilityPreview'

interface Props {
  enabled: boolean
  configured: boolean
  channels: TelegramChannelView[]
  onAddChannel: (name: string, chatId: string, type?: string) => Promise<{ success: boolean; error?: string }>
  onRemoveChannel: (id: string) => Promise<{ success: boolean; error?: string }>
  onUpdateRules?: (channelId: string, rules: TelegramChannelRules) => Promise<{ success: boolean; error?: string }>
}

export function TelegramConfigPanel({ enabled, configured, channels, onAddChannel, onRemoveChannel, onUpdateRules }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editingRules, setEditingRules] = useState<string | null>(null)
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
              <div className="min-w-0 flex-1">
                <span className="text-white/70 truncate block">{ch.name} <span className="text-white/30">({ch.type})</span></span>
                <span className="text-[9px] text-white/35 block truncate">{getRulesSummaryLabel(ch.rules)}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onUpdateRules && <button onClick={() => setEditingRules(editingRules === ch.id ? null : ch.id)} className="text-white/25 hover:text-cyan-400/70 transition-colors" type="button" aria-label="Regras"><Settings size={11} /></button>}
                <button onClick={() => onRemoveChannel(ch.id)} className="text-white/25 hover:text-rose-400/70 transition-colors" type="button" aria-label="Remover"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline Rules Editor */}
      {editingRules && onUpdateRules && (() => {
        const ch = channels.find(c => c.id === editingRules)
        if (!ch) return null
        return <InlineRulesEditor channel={ch} onSave={async (rules) => { await onUpdateRules(ch.id, rules); setEditingRules(null) }} onCancel={() => setEditingRules(null)} />
      })()}

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

// ─── Inline Rules Editor ─────────────────────────────────────────────────────

function InlineRulesEditor({ channel, onSave, onCancel }: { channel: TelegramChannelView; onSave: (rules: TelegramChannelRules) => Promise<void>; onCancel: () => void }) {
  const existing = channel.rules || {}
  const [minConf, setMinConf] = useState(String(existing.minConfidence || ''))
  const [richData, setRichData] = useState(existing.requireRichData || false)
  const [timedEvents, setTimedEvents] = useState(existing.requireTimedEvents || false)
  const [blockProxy, setBlockProxy] = useState(existing.blockStatsProxy || false)
  const [cooldown, setCooldown] = useState(String(existing.cooldownMinutes || ''))
  const [maxPerMatch, setMaxPerMatch] = useState(String(existing.maxSignalsPerMatch || ''))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const rules: TelegramChannelRules = {}
    const mc = parseInt(minConf)
    if (!isNaN(mc) && mc > 0) rules.minConfidence = mc
    if (richData) rules.requireRichData = true
    if (timedEvents) rules.requireTimedEvents = true
    if (blockProxy) rules.blockStatsProxy = true
    const cd = parseInt(cooldown)
    if (!isNaN(cd) && cd > 0) rules.cooldownMinutes = cd
    const mpm = parseInt(maxPerMatch)
    if (!isNaN(mpm) && mpm > 0) rules.maxSignalsPerMatch = mpm
    await onSave(rules)
    setSaving(false)
  }

  return (
    <div className="pt-2 border-t border-white/[0.05] space-y-2">
      <span className="text-[10px] font-semibold text-white/50 block">Regras: {channel.name}</span>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] text-white/40 block">Confiança mín.</label>
          <input value={minConf} onChange={e => setMinConf(e.target.value)} placeholder="0-100" className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/80" />
        </div>
        <div>
          <label className="text-[9px] text-white/40 block">Cooldown (min)</label>
          <input value={cooldown} onChange={e => setCooldown(e.target.value)} placeholder="0" className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/80" />
        </div>
        <div>
          <label className="text-[9px] text-white/40 block">Max/partida</label>
          <input value={maxPerMatch} onChange={e => setMaxPerMatch(e.target.value)} placeholder="0" className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/80" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-[10px] text-white/60"><input type="checkbox" checked={richData} onChange={e => setRichData(e.target.checked)} className="rounded" /> Exigir dados ricos</label>
        <label className="flex items-center gap-2 text-[10px] text-white/60"><input type="checkbox" checked={timedEvents} onChange={e => setTimedEvents(e.target.checked)} className="rounded" /> Exigir eventos minutados</label>
        <label className="flex items-center gap-2 text-[10px] text-white/60"><input type="checkbox" checked={blockProxy} onChange={e => setBlockProxy(e.target.checked)} className="rounded" /> Bloquear stats proxy</label>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="flex-1 px-2 py-1 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-400/15 disabled:opacity-30" type="button">{saving ? '...' : 'Salvar'}</button>
        <button onClick={onCancel} className="px-2 py-1 rounded text-[10px] text-white/50 border border-white/[0.06]" type="button">Cancelar</button>
      </div>
    </div>
  )
}
