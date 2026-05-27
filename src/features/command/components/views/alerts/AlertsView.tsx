/**
 * AlertsView — Command Center "Alertas" tab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the alert log with status filters, counters and the sidebar
 * summarising counts plus the "Como ler" legend. Behaviour preserved
 * byte-for-byte from CommandCenterPage.tsx (V3.18E). Receives the
 * `triggeredAlerts` slice already filtered by the page (e.g. last 30 events)
 * and a `navigate` callback to send the user to /app/alerts.
 */
import { useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import type { LiveFixture } from '@/lib/apiClient'
import type { TriggeredAlert } from '../../../types/commandTypes'
import { CounterCell } from '../shared/CounterCell'
import { SidebarRow } from '../shared/SidebarRow'
import { AlertRow } from './AlertRow'

type AlertFilter = 'all' | 'pending' | 'confirmed' | 'partial' | 'failed' | 'expired'

export interface AlertsViewProps {
  triggeredAlerts: TriggeredAlert[]
  isAdvanced: boolean
  openMatch: (fx: LiveFixture) => void
  fixtures: LiveFixture[]
  navigate: (path: string) => void
}

export function AlertsView({ triggeredAlerts, isAdvanced, openMatch, fixtures, navigate }: AlertsViewProps) {
  const [filter, setFilter] = useState<AlertFilter>('all')

  const counts = useMemo(() => ({
    all: triggeredAlerts.length,
    pending: triggeredAlerts.filter(t => t.status === 'pending').length,
    confirmed: triggeredAlerts.filter(t => t.status === 'confirmed').length,
    partial: triggeredAlerts.filter(t => t.status === 'confirmed_partial').length,
    failed: triggeredAlerts.filter(t => t.status === 'failed').length,
    expired: triggeredAlerts.filter(t => t.status === 'expired' || t.status === 'unknown').length,
  }), [triggeredAlerts])

  const visible = useMemo(() => {
    if (filter === 'all') return triggeredAlerts
    if (filter === 'pending') return triggeredAlerts.filter(t => t.status === 'pending')
    if (filter === 'confirmed') return triggeredAlerts.filter(t => t.status === 'confirmed')
    if (filter === 'partial') return triggeredAlerts.filter(t => t.status === 'confirmed_partial')
    if (filter === 'failed') return triggeredAlerts.filter(t => t.status === 'failed')
    if (filter === 'expired') return triggeredAlerts.filter(t => t.status === 'expired' || t.status === 'unknown')
    return triggeredAlerts
  }, [filter, triggeredAlerts])

  if (triggeredAlerts.length === 0) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] via-white/[0.008] to-transparent p-10 text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-4"><Zap size={20} className="text-white/40" /></div>
        <h3 className="text-[18px] font-semibold text-white/85 mb-1.5">Nenhum alerta disparado ainda</h3>
        <p className="text-[12px] text-white/55 max-w-[480px] mx-auto leading-relaxed">Quando um padrão bater, o Command Center registrará aqui e também em <span className="text-cyan-300 font-semibold">/app/alerts</span>.</p>
        <button onClick={() => navigate('/app/alerts')} className="mt-5 px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/60 border border-white/[0.07] hover:text-white/85 hover:border-white/[0.12] transition-colors" type="button">Ver gerenciador de alertas →</button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        {/* Header */}
        <header className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-[20px] font-bold text-white/90 tracking-tight">Alertas disparados</h2>
              <p className="text-[12px] text-white/55 mt-1">Eventos registrados pelo Command Center e enviados para <span className="text-cyan-300/80 font-semibold">/app/alerts</span>.</p>
            </div>
            <button onClick={() => navigate('/app/alerts')} className="px-3.5 py-2 rounded-xl text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 hover:bg-cyan-500/15 transition-colors whitespace-nowrap" type="button">Ver em /app/alerts</button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01]">
            <CounterCell label="Total" value={counts.all} tone="white" />
            <CounterCell label="Pendentes" value={counts.pending} tone="amber" />
            <CounterCell label="Confirmados" value={counts.confirmed} tone="emerald" />
            <CounterCell label="Parciais" value={counts.partial} tone="cyan" />
            <CounterCell label="Falhados" value={counts.failed} tone="rose" />
            <CounterCell label="Expirados" value={counts.expired} tone="white" />
          </div>
        </header>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {([
            ['all', 'Todos', counts.all],
            ['pending', 'Pendentes', counts.pending],
            ['confirmed', 'Confirmados', counts.confirmed],
            ['partial', 'Parciais', counts.partial],
            ['failed', 'Falhados', counts.failed],
            ['expired', 'Expirados', counts.expired],
          ] as [AlertFilter, string, number][]).map(([key, label, count]) => {
            const isActive = filter === key
            return (
              <button key={key} onClick={() => setFilter(key)} type="button" className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1.5 ${isActive ? 'bg-white/[0.09] text-white border border-white/[0.14]' : 'text-white/55 border border-white/[0.06] hover:text-white/85 hover:border-white/[0.1]'}`}>
                {label}
                {count > 0 && <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${isActive ? 'bg-cyan-500/22 text-cyan-200' : 'bg-white/[0.06] text-white/55'}`}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Alert log */}
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.008] p-8 text-center">
            <p className="text-[12px] text-white/55">Nenhum alerta nesta categoria.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(t => <AlertRow key={t.id} t={t} fx={fixtures.find(f => f.id === t.fixtureId)} openMatch={openMatch} isAdvanced={isAdvanced} />)}
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Saúde dos alertas</h4>
          <div className="space-y-2">
            <SidebarRow label="Pendentes" value={counts.pending} tone="amber" />
            <SidebarRow label="Confirmados" value={counts.confirmed} tone="emerald" />
            <SidebarRow label="Parciais" value={counts.partial} tone="cyan" />
            <SidebarRow label="Falhados" value={counts.failed} tone="rose" />
            <SidebarRow label="Expirados" value={counts.expired} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-transparent p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/80 mb-2">Como ler</h4>
          <p className="text-[11px] text-white/55 leading-relaxed">
            <span className="text-amber-300 font-semibold">Pendente</span> aguarda resolução. <span className="text-emerald-300 font-semibold">Confirmado</span> teve evento previsto. <span className="text-cyan-300 font-semibold">Parcial</span> teve evidência mas não fechou. <span className="text-rose-300 font-semibold">Falhado</span> não confirmou. <span className="text-white/65 font-semibold">Expirado</span> chegou ao fim sem evidência.
          </p>
        </div>
        <button onClick={() => navigate('/app/alerts')} className="w-full px-3 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/90 hover:border-white/[0.12] transition-colors" type="button">Abrir gerenciador →</button>
      </aside>
    </div>
  )
}
