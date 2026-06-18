/**
 * BacktestRunsHistory — previously executed backtest runs (honest empty state).
 */
import { History } from 'lucide-react'
import type { BacktestRun } from '../../../backtest/backtestTypes'

interface Props {
  runs: BacktestRun[]
  activeRunId: string | null
  loading: boolean
  onOpen: (runId: string) => void
}

function pct(v: number | null | undefined): string { return v == null ? '—' : `${Math.round(v * 100)}%` }
function when(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const STATUS_TONE: Record<string, string> = {
  completed: 'text-emerald-300/80', running: 'text-cyan-300/80', failed: 'text-rose-300/80', queued: 'text-white/50', cancelled: 'text-white/40',
}

export function BacktestRunsHistory({ runs, activeRunId, loading, onOpen }: Props) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-white/[0.04] border border-white/[0.07]"><History size={15} className="text-white/55" /></div>
        <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Histórico de backtests</h3>
      </div>

      {loading ? (
        <p className="text-[12px] text-white/40 py-6 text-center">Carregando…</p>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] p-6 text-center">
          <p className="text-[12.5px] text-white/70 font-medium">Nenhum backtest executado ainda</p>
          <p className="text-[11px] text-white/45 mt-1">Configure um radar acima e rode o primeiro teste.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {runs.map(r => (
            <button key={r.id} onClick={() => onOpen(r.id)} type="button" className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${activeRunId === r.id ? 'border-[#2DD4BF]/30 bg-[#13B8A6]/[0.05]' : 'border-white/[0.06] bg-white/[0.012] hover:border-white/[0.12]'}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[12.5px] font-semibold text-white/90 truncate">{r.patternName}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${STATUS_TONE[r.status] || 'text-white/50'}`}>{r.status}</span>
              </div>
              <div className="flex items-center gap-x-3 text-[11px] text-white/45 mt-1 flex-wrap">
                <span>{when(r.createdAt)}</span>
                {r.summary && <span>· {r.summary.fixturesAnalyzed} jogos</span>}
                {r.summary && <span>· {r.summary.signalsTriggered} sinais</span>}
                {r.summary && <span>· útil {pct(r.summary.usefulRate)}</span>}
                {r.dataCoverage && <span>· {r.dataCoverage.fixturesWithSnapshots}/{r.dataCoverage.fixturesFound} c/ snapshot</span>}
                {r.error && <span className="text-rose-300/70">· {r.error}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
