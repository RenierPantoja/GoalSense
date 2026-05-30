/**
 * PerformanceView — Command Center "Performance" tab.
 * ─────────────────────────────────────────────────────────────────────────────
 * V9B — Fully integrated with patternPerformanceAnalytics engine.
 * Shows per-pattern stats, reliability badges, grouping breakdowns,
 * actionable recommendations, and local backtest section.
 *
 * Rules:
 * - No mocks. No invented data. Only real alerts and resolutions.
 * - Unknown does NOT count as failure.
 * - Rates only appear with minimum sample (5 resolutions).
 * - Local backtest clearly states it's browser-local history.
 */
import { useMemo, useState } from 'react'
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import type { CommandCenterAlert } from '@/context/AlertsContext'
import type { Pattern, TriggeredAlert } from '../../../types/commandTypes'
import { buildPatternHealth, isReviewableHealth, HEALTH_TONE } from '../../../intelligence/patternHealthEngine'
import {
  buildAllPerformanceReports,
  RELIABILITY_TONE,
  RELIABILITY_LABEL,
  type PatternPerformanceReport,
  type PerformanceBucket,
  type ReliabilityLabel,
} from '../../../intelligence/patternPerformanceAnalytics'
import { CounterCell } from '../shared/CounterCell'
import { SidebarRow } from '../shared/SidebarRow'
import { PatternStatRow } from './PatternStatRow'
import { PreMatchOutcomeSection } from './PreMatchOutcomeSection'

export interface PerformanceViewProps {
  patterns: Pattern[]
  triggeredAlerts: TriggeredAlert[]
  commandAlerts: CommandCenterAlert[]
  isAdvanced: boolean
}

// ─── Reliability Summary Cards ───────────────────────────────────────────────

function ReliabilitySummaryCards({ reports }: { reports: PatternPerformanceReport[] }) {
  const counts: Record<ReliabilityLabel, number> = {
    reliable: 0, promising: 0, insufficient_sample: 0, data_limited: 0, noisy: 0, underperforming: 0,
  }
  for (const r of reports) counts[r.reliability]++

  const cards: { label: string; key: ReliabilityLabel; tone: string }[] = [
    { label: 'Confiáveis', key: 'reliable', tone: 'text-emerald-300' },
    { label: 'Promissores', key: 'promising', tone: 'text-cyan-300' },
    { label: 'Amostra insuficiente', key: 'insufficient_sample', tone: 'text-white/50' },
    { label: 'Limitados por dados', key: 'data_limited', tone: 'text-amber-300/70' },
    { label: 'Ruidosos', key: 'noisy', tone: 'text-amber-300' },
    { label: 'Subperformando', key: 'underperforming', tone: 'text-rose-300' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01]">
      {cards.map(c => (
        <div key={c.key} className="px-3 py-2.5 text-center bg-[#080d16]">
          <span className={`text-[18px] font-bold tabular-nums block leading-none ${counts[c.key] > 0 ? c.tone : 'text-white/20'}`}>{counts[c.key]}</span>
          <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Bucket Detail Row ───────────────────────────────────────────────────────

function BucketRow({ label, bucket }: { label: string; bucket: PerformanceBucket }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-white/65">
      <span className="text-white/80 font-medium w-[100px] shrink-0 truncate">{label}</span>
      <span className="tabular-nums">{bucket.total} total</span>
      <span className="text-emerald-300 tabular-nums">✓{bucket.confirmed}</span>
      {bucket.partial > 0 && <span className="text-cyan-300 tabular-nums">~{bucket.partial}</span>}
      <span className="text-rose-300 tabular-nums">✗{bucket.failed}</span>
      {bucket.unknown > 0 && <span className="text-amber-200/80 tabular-nums">?{bucket.unknown}</span>}
      {bucket.usefulRate !== null ? (
        <span className="ml-auto text-white/80 font-semibold tabular-nums">útil {Math.round(bucket.usefulRate * 100)}%</span>
      ) : (
        <span className="ml-auto text-white/40 text-[10px]">amostra &lt;5</span>
      )}
    </div>
  )
}

// ─── Expanded Detail Panel ───────────────────────────────────────────────────

function ReportDetailPanel({ report }: { report: PatternPerformanceReport }) {
  const hasMomentum = Object.keys(report.byMomentumSource).length > 0
  const hasDataQuality = Object.keys(report.byDataQuality).length > 0
  const hasProvider = Object.keys(report.byProvider).length > 0

  const momentumLabels: Record<string, string> = {
    timed_events: 'Eventos minutados',
    mixed: 'Misto',
    stats_proxy: 'Proxy de stats',
    insufficient: 'Insuficiente',
  }
  const dataQualityLabels: Record<string, string> = {
    rich: 'Dados ricos',
    partial: 'Dados parciais',
    poor: 'Dados pobres',
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-3">
      {hasMomentum && (
        <div>
          <span className="text-[9.5px] uppercase tracking-wider text-white/45 font-semibold block mb-1.5">Por fonte de momentum</span>
          <div className="space-y-1">
            {Object.entries(report.byMomentumSource).map(([k, b]) => (
              <BucketRow key={k} label={momentumLabels[k] || k} bucket={b} />
            ))}
          </div>
        </div>
      )}
      {hasDataQuality && (
        <div>
          <span className="text-[9.5px] uppercase tracking-wider text-white/45 font-semibold block mb-1.5">Por qualidade de dados</span>
          <div className="space-y-1">
            {Object.entries(report.byDataQuality).map(([k, b]) => (
              <BucketRow key={k} label={dataQualityLabels[k] || k} bucket={b} />
            ))}
          </div>
        </div>
      )}
      {hasProvider && (
        <div>
          <span className="text-[9.5px] uppercase tracking-wider text-white/45 font-semibold block mb-1.5">Por provider</span>
          <div className="space-y-1">
            {Object.entries(report.byProvider).map(([k, b]) => (
              <BucketRow key={k} label={k === 'unknown' ? 'Desconhecido' : k.toUpperCase()} bucket={b} />
            ))}
          </div>
        </div>
      )}
      {report.warnings.length > 0 && (
        <div>
          <span className="text-[9.5px] uppercase tracking-wider text-amber-200/80 font-semibold block mb-1">Avisos</span>
          <ul className="space-y-0.5">
            {report.warnings.map((w, i) => <li key={i} className="text-[11px] text-amber-200/70 leading-snug">⚠ {w}</li>)}
          </ul>
        </div>
      )}
      {report.recommendations.length > 0 && (
        <div>
          <span className="text-[9.5px] uppercase tracking-wider text-cyan-200/80 font-semibold block mb-1">Recomendações</span>
          <ul className="space-y-0.5">
            {report.recommendations.map((r, i) => <li key={i} className="text-[11px] text-white/65 leading-snug">→ {r}</li>)}
          </ul>
        </div>
      )}
      {!hasMomentum && !hasDataQuality && !hasProvider && report.warnings.length === 0 && report.recommendations.length === 0 && (
        <p className="text-[11px] text-white/40 italic">Sem dados de agrupamento disponíveis ainda.</p>
      )}
    </div>
  )
}

// ─── Performance Report Card ─────────────────────────────────────────────────

function PerformanceReportCard({ report, isAdvanced }: { report: PatternPerformanceReport; isAdvanced: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const tone = RELIABILITY_TONE[report.reliability]

  return (
    <div className={`rounded-xl border px-4 py-3 ${tone.bg} ${tone.border} transition-colors`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[12px] font-semibold text-white/85 block truncate">{report.patternName}</span>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-white/50">
            <span>{report.sampleSize} disparo{report.sampleSize !== 1 ? 's' : ''}</span>
            <span>· {report.resolvedCount} resolvido{report.resolvedCount !== 1 ? 's' : ''}</span>
            {report.confirmedRate !== null && <span>· confirmação {Math.round(report.confirmedRate * 100)}%</span>}
            {report.usefulRate !== null && <span>· útil {Math.round(report.usefulRate * 100)}%</span>}
            {report.failedRate !== null && <span>· falha {Math.round(report.failedRate * 100)}%</span>}
            {report.unknownRate !== null && <span>· sem dados {Math.round(report.unknownRate * 100)}%</span>}
            {report.pendingCount > 0 && <span>· {report.pendingCount} pendente{report.pendingCount !== 1 ? 's' : ''}</span>}
          </div>
          {report.recommendations.length > 0 && !expanded && (
            <span className="text-[10px] text-white/45 block mt-1 italic truncate">→ {report.recommendations[0]}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${tone.text} ${tone.bg} ${tone.border}`}>
            {RELIABILITY_LABEL[report.reliability]}
          </span>
          {isAdvanced && (
            <button onClick={() => setExpanded(!expanded)} type="button" className="text-white/40 hover:text-white/70 transition-colors" aria-label={expanded ? 'Recolher' : 'Expandir'}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>
      {expanded && isAdvanced && <ReportDetailPanel report={report} />}
    </div>
  )
}

// ─── Local Backtest Section ──────────────────────────────────────────────────

function LocalBacktestSection({ reports }: { reports: PatternPerformanceReport[] }) {
  const reportsWithData = reports.filter(r => r.sampleSize > 0)
  if (reportsWithData.length === 0) return null

  return (
    <section className="rounded-[20px] border border-white/[0.06] bg-white/[0.01] p-5">
      <h4 className="text-[13px] font-semibold text-white/55 mb-1">Backtest local</h4>
      <p className="text-[10px] text-white/30 mb-3">Backtest local baseado apenas no histórico salvo neste navegador.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-white/45 text-left border-b border-white/[0.05]">
              <th className="pb-2 pr-3 font-semibold">Padrão</th>
              <th className="pb-2 px-2 font-semibold text-center">Amostra</th>
              <th className="pb-2 px-2 font-semibold text-center">Confirmados</th>
              <th className="pb-2 px-2 font-semibold text-center">Parciais</th>
              <th className="pb-2 px-2 font-semibold text-center">Falhas</th>
              <th className="pb-2 px-2 font-semibold text-center">Unknown</th>
              <th className="pb-2 px-2 font-semibold text-center">Taxa útil</th>
              <th className="pb-2 px-2 font-semibold text-center">Taxa conf.</th>
              <th className="pb-2 pl-2 font-semibold">Limitação</th>
            </tr>
          </thead>
          <tbody>
            {reportsWithData.map(r => (
              <tr key={r.patternId} className="border-b border-white/[0.03]">
                <td className="py-2 pr-3 text-white/80 font-medium truncate max-w-[160px]">{r.patternName}</td>
                <td className="py-2 px-2 text-center text-white/65 tabular-nums">{r.sampleSize}</td>
                <td className="py-2 px-2 text-center text-emerald-300 tabular-nums">{r.confirmedCount}</td>
                <td className="py-2 px-2 text-center text-cyan-300 tabular-nums">{r.partialCount}</td>
                <td className="py-2 px-2 text-center text-rose-300 tabular-nums">{r.failedCount}</td>
                <td className="py-2 px-2 text-center text-amber-200/80 tabular-nums">{r.unknownCount}</td>
                <td className="py-2 px-2 text-center tabular-nums">
                  {r.usefulRate !== null ? <span className="text-white/85 font-semibold">{Math.round(r.usefulRate * 100)}%</span> : <span className="text-white/35">—</span>}
                </td>
                <td className="py-2 px-2 text-center tabular-nums">
                  {r.confirmedRate !== null ? <span className="text-white/85 font-semibold">{Math.round(r.confirmedRate * 100)}%</span> : <span className="text-white/35">—</span>}
                </td>
                <td className="py-2 pl-2 text-white/45 truncate max-w-[180px]">
                  {r.warnings.length > 0 ? r.warnings[0] : r.sampleSize < 5 ? 'Amostra insuficiente' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-white/30 mt-3 italic">Histórico local depende deste navegador. Performance passada não garante resultado futuro.</p>
    </section>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PerformanceView({ patterns, triggeredAlerts, commandAlerts, isAdvanced }: PerformanceViewProps) {
  // Pattern Health engine (for PatternStatRow compatibility)
  const cmdAlertsForHealth = useMemo(
    () => commandAlerts.map(a => ({ patternId: a.patternId, status: a.status, confidence: a.confidence, timestamp: a.createdAt })),
    [commandAlerts]
  )
  const stats = useMemo(() => {
    return patterns.map(p => ({
      pattern: p,
      health: buildPatternHealth(p, triggeredAlerts, cmdAlertsForHealth),
      lastHit: triggeredAlerts.find(t => t.patternId === p.id)?.timestamp || null,
    }))
  }, [patterns, triggeredAlerts, cmdAlertsForHealth])

  // Performance analytics reports — single source of truth
  const performanceReports = useMemo(
    () => buildAllPerformanceReports(patterns, commandAlerts, triggeredAlerts),
    [patterns, commandAlerts, triggeredAlerts]
  )

  const totalDispatched = triggeredAlerts.length
  const totalConfirmed = triggeredAlerts.filter(t => t.status === 'confirmed').length
  const totalPartial = triggeredAlerts.filter(t => t.status === 'confirmed_partial').length
  const totalFailed = triggeredAlerts.filter(t => t.status === 'failed').length
  const totalPending = triggeredAlerts.filter(t => t.status === 'pending').length
  const totalExpired = triggeredAlerts.filter(t => t.status === 'expired' || t.status === 'unknown').length
  const totalResolved = totalConfirmed + totalFailed
  const overallHitRate = totalResolved >= 5 ? Math.round((totalConfirmed / totalResolved) * 100) : null
  const avgConfidence = triggeredAlerts.length > 0 ? Math.round(triggeredAlerts.reduce((s, t) => s + t.confidence, 0) / triggeredAlerts.length) : null
  const activePatterns = patterns.filter(p => p.status === 'active').length
  const reviewable = stats.filter(s => isReviewableHealth(s.health.status))

  if (patterns.length === 0) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] via-white/[0.008] to-transparent p-10 text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-4"><BarChart3 size={20} className="text-white/40" /></div>
        <h3 className="text-[18px] font-semibold text-white/85 mb-1.5">Sem dados suficientes</h3>
        <p className="text-[12px] text-white/55 max-w-[440px] mx-auto leading-relaxed">Ative padrões e deixe o sistema acumular resoluções reais. Taxa de acerto aparece com 5 ou mais resoluções (confirmadas + falhadas).</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        {/* Header */}
        <header className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-6">
          <div>
            <h2 className="text-[20px] font-bold text-white/90 tracking-tight">Performance dos radares</h2>
            <p className="text-[12px] text-white/55 mt-1">Mede padrões disparados, resoluções e jornadas pré-jogo vs resultado.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01] mt-5">
            <CounterCell label="Padrões ativos" value={activePatterns} tone="cyan" />
            <CounterCell label="Disparos" value={totalDispatched} tone="white" />
            <CounterCell label="Confirmados" value={totalConfirmed} tone="emerald" />
            <CounterCell label="Falhados" value={totalFailed} tone="rose" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01] mt-px">
            <CounterCell label="Pendentes" value={totalPending} tone="amber" />
            <CounterCell label="Parciais" value={totalPartial} tone="cyan" />
            <CounterCell label="Expirados" value={totalExpired} tone="white" />
            <div className="px-3 py-2.5 text-center bg-[#080d16]">
              <span className={`text-[18px] font-bold tabular-nums block leading-none ${overallHitRate !== null ? 'text-emerald-300' : 'text-white/35'}`}>{overallHitRate !== null ? `${overallHitRate}%` : '—'}</span>
              <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">Taxa de acerto</span>
            </div>
          </div>
          {overallHitRate === null && totalDispatched > 0 && (
            <p className="text-[10px] text-white/45 mt-3 leading-snug">Taxa só aparece com pelo menos 5 resoluções (confirmadas + falhadas). Atualmente: {totalResolved}/5.</p>
          )}
          {avgConfidence !== null && (
            <p className="text-[11px] text-white/55 mt-2">Confiança média no disparo: <span className="text-white/85 font-bold tabular-nums">{avgConfidence}%</span></p>
          )}
        </header>

        {/* Reliability Summary Cards */}
        {performanceReports.length > 0 && (
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Saúde geral do sistema</h4>
            <ReliabilitySummaryCards reports={performanceReports} />
          </section>
        )}

        {/* Patterns needing review */}
        {reviewable.length > 0 && (
          <section className="rounded-2xl border border-amber-300/15 bg-amber-500/[0.025] p-5">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200/85 mb-3">Padrões para revisar</h4>
            <div className="space-y-2">
              {reviewable.map(s => (
                <div key={s.pattern.id} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-white/85 font-semibold truncate">{s.pattern.name}</span>
                  <span className={`text-[11px] font-medium shrink-0 ${HEALTH_TONE[s.health.status].text}`}>{s.health.label} · {s.health.reason}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Per-pattern breakdown (Health engine) */}
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Por padrão</h4>
          <div className="space-y-2">
            {stats.map(s => <PatternStatRow key={s.pattern.id} stat={s} report={performanceReports.find(r => r.patternId === s.pattern.id)} isAdvanced={isAdvanced} />)}
          </div>
        </section>

        {/* Performance Analytics — Reliability per pattern with expandable detail */}
        {performanceReports.length > 0 && (
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Confiabilidade analítica</h4>
            <div className="space-y-2">
              {performanceReports.map(report => (
                <PerformanceReportCard key={report.patternId} report={report} isAdvanced={isAdvanced} />
              ))}
            </div>
          </section>
        )}

        {/* Local Backtest */}
        {isAdvanced && <LocalBacktestSection reports={performanceReports} />}

        {/* Pre-match outcome */}
        <PreMatchOutcomeSection isAdvanced={isAdvanced} />

        {/* Honest copy */}
        <section className="rounded-2xl border border-white/[0.05] bg-white/[0.008] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 mb-2">Sobre estas métricas</h4>
          <ul className="text-[11px] text-white/50 leading-relaxed space-y-1">
            <li>· Unknown não é falha; significa que o provider não entregou dados suficientes para confirmar ou negar.</li>
            <li>· Taxas só aparecem com amostra mínima de 5 resoluções (confirmadas + falhadas).</li>
            <li>· Histórico local depende deste navegador — limpar dados apaga o histórico.</li>
            <li>· Performance passada não garante resultado futuro.</li>
          </ul>
        </section>
      </div>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Saúde da amostra</h4>
          <div className="space-y-2">
            <SidebarRow label="Resoluções válidas" value={totalResolved} tone={totalResolved >= 5 ? 'emerald' : 'amber'} />
            <SidebarRow label="Padrões ativos" value={activePatterns} tone="cyan" />
            <SidebarRow label="Padrões para revisar" value={reviewable.length} tone={reviewable.length > 0 ? 'amber' : 'white'} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-transparent p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/80 mb-2">Critérios de cálculo</h4>
          <ul className="text-[11px] text-white/65 leading-relaxed space-y-1.5">
            <li>· Taxa = confirmados ÷ (confirmados + falhados)</li>
            <li>· Mínimo: 5 resoluções para exibir taxa</li>
            <li>· Pendentes, parciais e expirados não entram no denominador</li>
            <li>· Unknown não conta como falha</li>
            <li>· Confiança usa todos os disparos</li>
            <li>· Reliability label usa analytics engine real</li>
          </ul>
        </div>
        {totalDispatched < 5 && (
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300 mb-1.5">Dados insuficientes</h4>
            <p className="text-[11px] text-white/65 leading-relaxed">Faltam {Math.max(0, 5 - totalDispatched)} disparos para começar a calcular taxas confiáveis.</p>
          </div>
        )}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-2">Legenda de confiabilidade</h4>
          <div className="space-y-1.5">
            {(Object.entries(RELIABILITY_LABEL) as [ReliabilityLabel, string][]).map(([key, label]) => {
              const t = RELIABILITY_TONE[key]
              return (
                <div key={key} className="flex items-center gap-2 text-[11px]">
                  <span className={`inline-block h-2 w-2 rounded-full border ${t.bg} ${t.border}`} />
                  <span className={`${t.text} font-medium`}>{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </aside>
    </div>
  )
}
