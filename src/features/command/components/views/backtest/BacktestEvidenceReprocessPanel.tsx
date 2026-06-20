/**
 * BacktestEvidenceReprocessPanel (Phase B36) — recover inline snapshot evidence
 * for a run by re-evaluating against the same snapshots. Read-only by default
 * (dry-run); applying a patch needs backend flag + strong confirmation. It NEVER
 * changes the backtest result, score, confidence or outcome.
 */
import { useState } from 'react'
import { RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react'
import { backtestApi } from '@/services/backtestApi'
import { useAuth } from '@/auth/useAuth'
import type { BacktestReplayEvidenceReprocessRunDto } from '@/features/command/backtest/backtestTypes'

interface Props {
  runId: string
  kind: 'backtest' | 'replay'
}

export function BacktestEvidenceReprocessPanel({ runId, kind }: Props) {
  const { isAdmin } = useAuth()
  const [report, setReport] = useState<BacktestReplayEvidenceReprocessRunDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async (mode: 'dry_run' | 'patch_inline') => {
    if (mode === 'patch_inline' && !window.confirm('Aplicar patch de evidência inline? Isto NÃO altera o resultado/score/outcome — apenas grava o snapshotId quando o resultado reprocessado é idêntico ao original. Continuar?')) return
    setBusy(true); setMsg(null)
    const r = kind === 'backtest'
      ? await backtestApi.reprocessBacktestEvidence(runId, mode)
      : await backtestApi.reprocessReplayEvidence(runId, mode)
    if (r.ok && r.data) { setReport(r.data); setMsg(null) }
    else setMsg(r.disabled ? 'Backtest/replay desabilitado neste ambiente.' : (r.error || 'Falha.'))
    setBusy(false)
  }

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-[#13B8A6]/[0.1] border border-[#2DD4BF]/20"><ShieldCheck size={15} className="text-[#5EEAD4]" /></div>
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Reprocessar evidência</h3>
          <p className="text-[11px] text-white/50 mt-0.5">Recupera snapshotId inline reavaliando os mesmos snapshots. Não recalcula resultado.</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" disabled={busy} onClick={() => run('dry_run')} className="h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-white/70 inline-flex items-center gap-1.5 disabled:opacity-40"><RefreshCw size={13} className={busy ? 'animate-spin' : ''} />Simular reprocessamento</button>
        {isAdmin && <button type="button" disabled={busy} onClick={() => run('patch_inline')} className="h-9 px-3 rounded-lg border border-amber-400/20 bg-amber-500/8 hover:bg-amber-500/15 text-[12px] text-amber-100/85 inline-flex items-center gap-1.5 disabled:opacity-40">Aplicar patch</button>}
      </div>

      {msg && <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-[12px] text-white/70">{msg}</div>}

      {report && (
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${report.mode === 'patch_inline' ? 'border-amber-400/20 text-amber-100/80' : 'border-sky-400/20 text-sky-200/80'}`}>{report.mode === 'patch_inline' ? 'patch aplicado' : 'dry-run'}</span>
            <span className="text-[10px] text-white/40">{report.status}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px]">
            <KV k="varridos" v={report.scannedResults} />
            <KV k="match" v={report.matchedResults} />
            <KV k="mismatch" v={report.mismatchedResults} />
            <KV k="patch aplicado" v={report.patchedResults} />
            <KV k="exato recuperado" v={report.exactRecovered} />
            <KV k="pulados" v={report.skippedResults} />
          </div>
          {report.mismatchedResults > 0 && <p className="text-[11px] text-amber-100/75 mt-2 inline-flex items-center gap-1.5"><AlertTriangle size={12} />Divergências bloqueiam o patch (resultado reprocessado ≠ original).</p>}
          {report.limitations.length > 0 && <p className="text-[10px] text-white/35 mt-1.5">{report.limitations[report.limitations.length - 1]}</p>}
          <p className="text-[10px] text-white/30 mt-1">Reprocessar evidência ≠ recalcular resultado. Exato só com snapshotId real; divergência nunca aplica patch.</p>
        </div>
      )}
    </section>
  )
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.012] px-2.5 py-1.5"><span className="text-[10px] text-white/45">{k}</span><span className="text-[13px] text-white/85 tabular-nums">{v}</span></div>
}
