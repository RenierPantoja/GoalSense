import { Radio, RefreshCw } from 'lucide-react'

interface Props {
  lastUpdate: Date | null
  refreshing: boolean
  onRefresh: () => void
  error: string | null
}

export function LiveCommandHeader({ lastUpdate, refreshing, onRefresh, error }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-r from-[var(--bg-panel)] to-[#0d1420] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/8 border border-cyan-500/12 shadow-[0_0_15px_rgba(6,182,212,0.06)]">
            <Radio size={20} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">Live Radar</h1>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Monitoramento ao vivo em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sources */}
          <div className="hidden md:flex items-center gap-1.5">
            <SourceDot label="ESPN" active />
            <SourceDot label="football-data" active />
            <SourceDot label="API-Football" active={false} />
          </div>

          {/* Status */}
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-3 py-1 text-[10px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Real Data
          </span>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] transition-all hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
            aria-label="Atualizar dados"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Bottom info */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
        {lastUpdate && <span>Atualizado {lastUpdate.toLocaleTimeString('pt-BR')}</span>}
        <span>Auto-refresh 15s</span>
        {error && <span className="text-amber-400">Aviso: {error.slice(0, 60)}</span>}
      </div>
    </div>
  )
}

function SourceDot({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[9px] text-[var(--text-muted)]" title={label}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-[var(--text-muted)]/40'}`} />
      <span className="hidden lg:inline">{label}</span>
    </span>
  )
}
