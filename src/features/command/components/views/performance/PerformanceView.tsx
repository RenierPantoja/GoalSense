/**
 * PerformanceView — Command Center "Performance" tab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows per-pattern stats derived from the same `buildPatternHealth` engine
 * used by the Pattern Studio. The hit rate is intentionally only displayed
 * once the sample reaches at least 5 resolutions (confirmed + failed); the
 * sidebar explains the rules in plain Portuguese.
 *
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 */
import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import type { CommandCenterAlert } from '@/context/AlertsContext'
import type { Pattern, TriggeredAlert } from '../../../types/commandTypes'
import { buildPatternHealth, isReviewableHealth, HEALTH_TONE } from '../../../intelligence/patternHealthEngine'
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

export function PerformanceView({ patterns, triggeredAlerts, commandAlerts, isAdvanced }: PerformanceViewProps) {
  // V3.17 — derive every per-pattern stat from the same Pattern Health engine
  // used by the Pattern Studio. Single source of truth for status, hit rate,
  // recommendations and review labels.
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

        {/* Per-pattern breakdown */}
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Por padrão</h4>
          <div className="space-y-2">
            {stats.map(s => <PatternStatRow key={s.pattern.id} stat={s} isAdvanced={isAdvanced} />)}
          </div>
        </section>

        {/* Pre-match outcome */}
        <PreMatchOutcomeSection isAdvanced={isAdvanced} />
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
            <li>· Confiança usa todos os disparos</li>
          </ul>
        </div>
        {totalDispatched < 5 && (
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300 mb-1.5">Dados insuficientes</h4>
            <p className="text-[11px] text-white/65 leading-relaxed">Faltam {Math.max(0, 5 - totalDispatched)} disparos para começar a calcular taxas confiáveis.</p>
          </div>
        )}
      </aside>
    </div>
  )
}
