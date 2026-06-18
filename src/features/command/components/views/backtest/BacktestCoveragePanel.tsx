/**
 * BacktestCoveragePanel — how strong/weak the backtest's data foundation is.
 * Honest: fixtures without snapshots are NOT failures.
 */
import { Database, AlertTriangle } from 'lucide-react'
import type { BacktestDataCoverage, BacktestLimitation } from '../../../backtest/backtestTypes'

interface Props {
  coverage: BacktestDataCoverage
  limitations: BacktestLimitation[]
}

const QUALITY_BARS = [
  { key: 'richDataCount', label: 'Rica', color: '#34D399' },
  { key: 'partialDataCount', label: 'Parcial', color: '#2DD4BF' },
  { key: 'poorDataCount', label: 'Pobre', color: '#FFB02E' },
  { key: 'unknownDataCount', label: 'Desconhecida', color: 'rgba(255,255,255,0.25)' },
] as const

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="px-3 py-2.5 text-center bg-[#080d16]">
      <span className={`text-[18px] font-bold tabular-nums block leading-none ${muted ? 'text-white/35' : 'text-white/90'}`}>{value}</span>
      <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">{label}</span>
    </div>
  )
}

export function BacktestCoveragePanel({ coverage, limitations }: Props) {
  const totalQuality = coverage.richDataCount + coverage.partialDataCount + coverage.poorDataCount + coverage.unknownDataCount || 1
  const providers = Object.entries(coverage.providerBreakdown || {}).sort((a, b) => b[1] - a[1])

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-[#13B8A6]/[0.1] border border-[#2DD4BF]/20"><Database size={15} className="text-[#5EEAD4]" /></div>
        <div>
          <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Cobertura de dados</h3>
          <p className="text-[11px] text-white/50 mt-0.5">Backtest forte depende do histórico gravado.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02] mb-4">
        <Stat label="Jogos" value={coverage.fixturesFound} />
        <Stat label="Com snapshot" value={coverage.fixturesWithSnapshots} />
        <Stat label="Sem snapshot" value={coverage.fixturesWithoutSnapshots} muted />
        <Stat label="Snapshots" value={coverage.snapshotsEvaluated} />
        <Stat label="Não avaliável" value={coverage.notEvaluableCount} muted />
      </div>

      {/* Data quality stacked bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Qualidade dos snapshots</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden flex bg-white/[0.04]">
          {QUALITY_BARS.map(b => {
            const v = (coverage as any)[b.key] as number
            const pct = (v / totalQuality) * 100
            if (pct <= 0) return null
            return <div key={b.key} style={{ width: `${pct}%`, backgroundColor: b.color }} title={`${b.label}: ${v}`} />
          })}
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {QUALITY_BARS.map(b => (
            <span key={b.key} className="flex items-center gap-1.5 text-[10px] text-white/55">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: b.color }} />{b.label}
              <span className="text-white/40 tabular-nums">{(coverage as any)[b.key]}</span>
            </span>
          ))}
        </div>
      </div>

      {providers.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-[10px] text-white/40">Provedores:</span>
          {providers.map(([p, n]) => <span key={p} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07] text-white/65 tabular-nums">{p} · {n}</span>)}
        </div>
      )}

      <div className="rounded-xl border border-[#2DD4BF]/15 bg-[#13B8A6]/[0.04] px-3.5 py-2.5 mb-3">
        <p className="text-[11px] text-[#7FE9DC]/85 leading-relaxed">Jogos sem snapshots não são considerados falha — entram como <span className="font-semibold">não avaliável</span>.</p>
      </div>

      {limitations.length > 0 && (
        <div className="space-y-1.5">
          {limitations.map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-amber-100/70">
              <AlertTriangle size={12} className="text-amber-300/70 mt-0.5 shrink-0" />
              <span>{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
