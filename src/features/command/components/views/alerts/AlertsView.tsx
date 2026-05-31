/**
 * AlertsView — Command Center "Alertas" tab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase B10.1: Supports Local / Backend / Hybrid source modes.
 * Hybrid mode merges local + backend alerts by duplicateSignature.
 * localStorage is NEVER altered by this view.
 */
import { useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import type { LiveFixture } from '@/lib/apiClient'
import type { TriggeredAlert } from '../../../types/commandTypes'
import type { HybridCommandAlert, HybridMergeDiagnostics } from '@/services/hybridAlertMerge'
import { CounterCell } from '../shared/CounterCell'
import { SidebarRow } from '../shared/SidebarRow'
import { AlertRow } from './AlertRow'

type AlertFilter = 'all' | 'pending' | 'confirmed' | 'partial' | 'failed' | 'expired'
type AlertSourceMode = 'local' | 'backend' | 'hybrid'

export interface AlertsViewProps {
  triggeredAlerts: TriggeredAlert[]
  isAdvanced: boolean
  openMatch: (fx: LiveFixture) => void
  fixtures: LiveFixture[]
  navigate: (path: string) => void
  hybridAlerts?: HybridCommandAlert[]
  hybridDiagnostics?: HybridMergeDiagnostics
  backendOnline?: boolean
}

// ─── Source Badge ────────────────────────────────────────────────────────────

const SOURCE_BADGE_STYLE: Record<string, string> = {
  local: 'bg-white/[0.05] text-white/50 border-white/[0.08]',
  backend: 'bg-cyan-500/10 text-cyan-300/70 border-cyan-400/15',
  merged: 'bg-emerald-500/10 text-emerald-300/70 border-emerald-400/15',
  conflict: 'bg-amber-500/10 text-amber-300/70 border-amber-400/15',
}

function SourceBadge({ source }: { source: string }) {
  const style = SOURCE_BADGE_STYLE[source] || SOURCE_BADGE_STYLE.local
  const label = source === 'merged' ? 'Merged' : source === 'conflict' ? 'Conflito' : source === 'backend' ? 'Backend' : 'Local'
  return <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${style}`}>{label}</span>
}

// ─── Hybrid Alert Row ────────────────────────────────────────────────────────

function HybridAlertRow({ alert, isAdvanced }: { alert: HybridCommandAlert; isAdvanced: boolean }) {
  const statusColor: Record<string, string> = {
    pending: 'text-amber-300 bg-amber-500/10 border-amber-400/15',
    confirmed: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/15',
    confirmed_partial: 'text-cyan-300 bg-cyan-500/10 border-cyan-400/15',
    failed: 'text-rose-300 bg-rose-500/10 border-rose-400/15',
    unknown: 'text-white/50 bg-white/[0.04] border-white/[0.08]',
    expired: 'text-white/45 bg-white/[0.03] border-white/[0.06]',
  }
  const statusLabel: Record<string, string> = {
    pending: 'Pendente', confirmed: 'Confirmado', confirmed_partial: 'Parcial',
    failed: 'Falhado', unknown: 'Desconhecido', expired: 'Expirado',
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.012] px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[12px] font-semibold text-white/85 truncate">{alert.patternName}</span>
          {isAdvanced && <SourceBadge source={alert.source} />}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${statusColor[alert.status] || statusColor.unknown}`}>
          {statusLabel[alert.status] || alert.status}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-white/55 flex-wrap">
        {alert.homeTeam && alert.awayTeam && <span>{alert.homeTeam} vs {alert.awayTeam}</span>}
        {alert.minuteAtTrigger != null && <span>· {alert.minuteAtTrigger}'</span>}
        <span>· {alert.scoreAtTrigger.home}-{alert.scoreAtTrigger.away}</span>
        <span>· {alert.confidence}%</span>
        {alert.competition && <span className="text-white/35">· {alert.competition}</span>}
      </div>
      {alert.evidences.length > 0 && (
        <div className="mt-1.5 text-[10px] text-white/40 truncate">{alert.evidences[0]}</div>
      )}
      {isAdvanced && alert.hasConflict && alert.conflictFields && (
        <div className="mt-1.5 text-[10px] text-amber-300/60">⚠ Conflito: {alert.conflictFields.join(', ')}</div>
      )}
      {isAdvanced && alert.resolvedAt && (
        <div className="mt-1 text-[10px] text-white/30">Resolvido: {new Date(alert.resolvedAt).toLocaleString('pt-BR')}{alert.resolutionReason ? ` — ${alert.resolutionReason}` : ''}</div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AlertsView({ triggeredAlerts, isAdvanced, openMatch, fixtures, navigate, hybridAlerts, hybridDiagnostics, backendOnline }: AlertsViewProps) {
  const [filter, setFilter] = useState<AlertFilter>('all')
  const [sourceMode, setSourceMode] = useState<AlertSourceMode>(() => backendOnline && hybridAlerts ? 'hybrid' : 'local')

  // Effective source mode (fallback to local if backend unavailable)
  const effectiveMode: AlertSourceMode = (sourceMode === 'hybrid' || sourceMode === 'backend') && !backendOnline ? 'local' : sourceMode

  // Source-aware alert list for counting
  const countSource = useMemo(() => {
    if (effectiveMode === 'hybrid' && hybridAlerts && hybridAlerts.length > 0) {
      return hybridAlerts.map(a => ({ status: a.status }))
    }
    if (effectiveMode === 'backend' && hybridAlerts) {
      return hybridAlerts.filter(a => a.source === 'backend').map(a => ({ status: a.status }))
    }
    return triggeredAlerts.map(t => ({ status: t.status }))
  }, [effectiveMode, hybridAlerts, triggeredAlerts])

  // Counts reflect the active source mode
  const counts = useMemo(() => ({
    all: countSource.length,
    pending: countSource.filter(t => t.status === 'pending').length,
    confirmed: countSource.filter(t => t.status === 'confirmed').length,
    partial: countSource.filter(t => t.status === 'confirmed_partial').length,
    failed: countSource.filter(t => t.status === 'failed').length,
    expired: countSource.filter(t => t.status === 'expired' || t.status === 'unknown').length,
  }), [countSource])

  // Source label for header
  const sourceLabel = effectiveMode === 'hybrid' ? 'Híbrido' : effectiveMode === 'backend' ? 'Backend' : 'Local'

  // Visible alerts based on source mode and filter
  const visibleLocal = useMemo(() => {
    const base = triggeredAlerts
    if (filter === 'all') return base
    if (filter === 'pending') return base.filter(t => t.status === 'pending')
    if (filter === 'confirmed') return base.filter(t => t.status === 'confirmed')
    if (filter === 'partial') return base.filter(t => t.status === 'confirmed_partial')
    if (filter === 'failed') return base.filter(t => t.status === 'failed')
    if (filter === 'expired') return base.filter(t => t.status === 'expired' || t.status === 'unknown')
    return base
  }, [filter, triggeredAlerts])

  const visibleHybrid = useMemo(() => {
    if (!hybridAlerts) return []
    const base = hybridAlerts
    if (filter === 'all') return base
    if (filter === 'pending') return base.filter(a => a.status === 'pending')
    if (filter === 'confirmed') return base.filter(a => a.status === 'confirmed')
    if (filter === 'partial') return base.filter(a => a.status === 'confirmed_partial')
    if (filter === 'failed') return base.filter(a => a.status === 'failed')
    if (filter === 'expired') return base.filter(a => a.status === 'expired' || a.status === 'unknown')
    return base
  }, [filter, hybridAlerts])

  const visibleBackendOnly = useMemo(() => {
    if (!hybridAlerts) return []
    const base = hybridAlerts.filter(a => a.source === 'backend')
    if (filter === 'all') return base
    if (filter === 'pending') return base.filter(a => a.status === 'pending')
    if (filter === 'confirmed') return base.filter(a => a.status === 'confirmed')
    if (filter === 'partial') return base.filter(a => a.status === 'confirmed_partial')
    if (filter === 'failed') return base.filter(a => a.status === 'failed')
    if (filter === 'expired') return base.filter(a => a.status === 'expired' || a.status === 'unknown')
    return base
  }, [filter, hybridAlerts])

  // Empty state
  if (triggeredAlerts.length === 0 && (!hybridAlerts || hybridAlerts.length === 0)) {
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
              <p className="text-[12px] text-white/55 mt-1">
                Eventos registrados pelo Command Center.
                {isAdvanced && <span className="text-[10px] text-white/30 ml-2">· Fonte: {sourceLabel}{effectiveMode !== sourceMode ? ' (fallback)' : ''}</span>}
                {isAdvanced && hybridDiagnostics && backendOnline && (
                  <span className="text-[10px] text-white/30 ml-1">· {hybridDiagnostics.mergedCount} merged, {hybridDiagnostics.onlyBackendCount} backend-only{hybridDiagnostics.divergentStatusCount > 0 ? `, ${hybridDiagnostics.divergentStatusCount} conflitos` : ''}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAdvanced && backendOnline && hybridAlerts && (
                <div className="flex gap-0.5 rounded-lg border border-white/[0.06] overflow-hidden">
                  {(['local', 'hybrid', 'backend'] as AlertSourceMode[]).map(mode => (
                    <button key={mode} onClick={() => setSourceMode(mode)} type="button" className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${effectiveMode === mode ? 'bg-white/[0.08] text-white/85' : 'text-white/40 hover:text-white/65'}`}>
                      {mode === 'local' ? 'Local' : mode === 'hybrid' ? 'Híbrido' : 'Backend'}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => navigate('/app/alerts')} className="px-3.5 py-2 rounded-xl text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 hover:bg-cyan-500/15 transition-colors whitespace-nowrap" type="button">Ver em /app/alerts</button>
            </div>
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

        {/* Alert list — source-dependent */}
        {effectiveMode === 'local' && (
          visibleLocal.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.008] p-8 text-center">
              <p className="text-[12px] text-white/55">Nenhum alerta local nesta categoria.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleLocal.map(t => <AlertRow key={t.id} t={t} fx={fixtures.find(f => f.id === t.fixtureId)} openMatch={openMatch} isAdvanced={isAdvanced} />)}
            </div>
          )
        )}

        {effectiveMode === 'hybrid' && (
          visibleHybrid.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.008] p-8 text-center">
              <p className="text-[12px] text-white/55">{!backendOnline ? 'Backend offline — exibindo alertas locais.' : 'Nenhum alerta nesta categoria.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleHybrid.map(a => <HybridAlertRow key={a.id} alert={a} isAdvanced={isAdvanced} />)}
            </div>
          )
        )}

        {effectiveMode === 'backend' && (
          visibleBackendOnly.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.008] p-8 text-center">
              <p className="text-[12px] text-white/55">{!backendOnline ? 'Backend offline.' : 'Nenhum alerta backend-only nesta categoria.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleBackendOnly.map(a => <HybridAlertRow key={a.id} alert={a} isAdvanced={isAdvanced} />)}
            </div>
          )
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
        {isAdvanced && hybridDiagnostics && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Diagnóstico híbrido</h4>
            <div className="space-y-2">
              <SidebarRow label="Local" value={hybridDiagnostics.localCount} />
              <SidebarRow label="Backend" value={hybridDiagnostics.backendCount} tone="cyan" />
              <SidebarRow label="Matched" value={hybridDiagnostics.matchedCount} tone="emerald" />
              <SidebarRow label="Backend-only" value={hybridDiagnostics.onlyBackendCount} tone="cyan" />
              <SidebarRow label="Local-only" value={hybridDiagnostics.onlyLocalCount} />
              {hybridDiagnostics.divergentStatusCount > 0 && <SidebarRow label="Conflitos" value={hybridDiagnostics.divergentStatusCount} tone="amber" />}
            </div>
          </div>
        )}
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
