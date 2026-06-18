/**
 * BacktestSummaryPanel — honest read of a backtest run.
 * usefulRate = confirmed + confirmed_partial; failedRate excludes unknown/not_evaluable;
 * unknown & not_evaluable are distinct neutral states. No win/loss green/red framing.
 */
import { Info } from 'lucide-react'
import type { BacktestSummary } from '../../../backtest/backtestTypes'
import { SAMPLE_QUALITY_LABEL } from '../../../backtest/backtestTypes'

function pct(v: number | null): string { return v == null ? '—' : `${Math.round(v * 100)}%` }

function RateCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45 block">{label}</span>
      <span className={`text-[24px] font-bold tabular-nums leading-none block mt-1.5 ${tone}`}>{value}</span>
      <span className="text-[10px] text-white/40 mt-1.5 block leading-snug">{hint}</span>
    </div>
  )
}

function Pill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
      <span className="text-[11px] text-white/55">{label}</span>
      <span className={`text-[13px] font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  )
}

export function BacktestSummaryPanel({ summary }: { summary: BacktestSummary }) {
  const lowSample = summary.sampleQuality === 'insufficient' || summary.sampleQuality === 'low'
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Resumo do backtest</h3>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${lowSample ? 'text-amber-200/80 bg-amber-500/[0.08] border-amber-400/20' : 'text-[#7FE9DC]/85 bg-[#13B8A6]/[0.08] border-[#2DD4BF]/20'}`}>
          {SAMPLE_QUALITY_LABEL[summary.sampleQuality]}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <RateCard label="Útil (confirm. + parcial)" value={pct(summary.usefulRate)} tone="text-emerald-200/90" hint="Confirmados + parciais sobre os resolvidos" />
        <RateCard label="Falha" value={pct(summary.failedRate)} tone="text-rose-200/85" hint="Não inclui sem-dados nem não avaliável" />
        <RateCard label="Sem dados" value={pct(summary.unknownRate)} tone="text-amber-100/80" hint="Ausência de dados, não falha do radar" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <Pill label="Jogos analisados" value={summary.fixturesAnalyzed} tone="text-white/85" />
        <Pill label="Dispararia" value={summary.signalsTriggered} tone="text-white/85" />
        <Pill label="Confirmados" value={summary.confirmed} tone="text-emerald-200/85" />
        <Pill label="Parciais" value={summary.confirmedPartial} tone="text-teal-200/85" />
        <Pill label="Falhas" value={summary.failed} tone="text-rose-200/80" />
        <Pill label="Sem dados" value={summary.unknown} tone="text-amber-100/75" />
        <Pill label="Não avaliável" value={summary.notEvaluable} tone="text-white/55" />
        <Pill label="Conf. média" value={summary.avgConfidence ?? 0} tone="text-white/85" />
        <Pill label="Min. médio disparo" value={summary.avgTriggerMinute ?? 0} tone="text-white/85" />
      </div>

      {lowSample && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.05] px-3.5 py-2.5 flex items-start gap-2">
          <Info size={13} className="text-amber-300/70 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-100/75 leading-relaxed">Amostra insuficiente para conclusão forte. Trate estes números como indício inicial, não como projeção garantida.</p>
        </div>
      )}

      {(summary.bestMinuteWindows.length > 0 || summary.bestCompetitions.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <BreakdownList title="Janelas mais fortes (indício)" items={summary.bestMinuteWindows} metric="useful" />
          <BreakdownList title="Ligas mais fortes (indício)" items={summary.bestCompetitions} metric="useful" />
        </div>
      )}
    </section>
  )
}

function BreakdownList({ title, items, metric }: { title: string; items: BacktestSummary['bestMinuteWindows']; metric: 'useful' | 'failed' }) {
  if (items.length === 0) return null
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45 block mb-2">{title}</span>
      <div className="space-y-1.5">
        {items.map(s => (
          <div key={s.contextKey} className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-white/75 truncate">{s.label}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] tabular-nums text-emerald-200/80">{metric === 'useful' ? pct(s.usefulRate) : pct(s.failedRate)}</span>
              <span className="text-[9px] text-white/35 tabular-nums">n={s.sampleSize}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
