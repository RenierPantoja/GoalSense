/**
 * PreMatchOutcomeSection — pre-match score vs result accuracy panel.
 * ─────────────────────────────────────────────────────────────────────────────
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E). Pulls
 * data from `buildPreMatchOutcomeSummary()` and gracefully renders an empty
 * state when there are no jornadas to display yet.
 */
import { useMemo } from 'react'
import { buildPreMatchOutcomeSummary } from '@/services/intelligence/preMatchOutcomePerformance'

interface PreMatchOutcomeSectionProps {
  isAdvanced: boolean
}

export function PreMatchOutcomeSection({ isAdvanced }: PreMatchOutcomeSectionProps) {
  const summary = useMemo(() => buildPreMatchOutcomeSummary(), [])
  if (summary.totalOutcomes === 0) return (<section className="rounded-[20px] border border-white/[0.05] bg-white/[0.008] p-5"><h4 className="text-[12px] font-semibold text-white/45 mb-1">Pré-jogo vs Resultado</h4><p className="text-[11px] text-white/25">Quando partidas tiverem score pré-jogo, alertas e resolução, a análise aparecerá aqui.</p></section>)
  return (
    <section className="rounded-[20px] border border-white/[0.06] bg-white/[0.01] p-5">
      <h4 className="text-[13px] font-semibold text-white/55 mb-1">Pré-jogo vs Resultado</h4>
      <p className="text-[10px] text-white/30 mb-3">Compara leituras pré-jogo, alertas disparados e resoluções reais.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[16px] font-bold text-white/60 block">{summary.totalOutcomes}</span><span className="text-[9px] text-white/30">Jornadas</span></div>
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[16px] font-bold text-emerald-400/70 block">{summary.completeJourneys}</span><span className="text-[9px] text-white/30">Completas</span></div>
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[16px] font-bold text-white/50 block">{summary.withTriggeredAlerts}</span><span className="text-[9px] text-white/30">Com alertas</span></div>
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[16px] font-bold text-white/50 block">{summary.resolvedAlerts}</span><span className="text-[9px] text-white/30">Resolvidos</span></div>
      </div>
      {summary.insufficientSample && <p className="text-[10px] text-white/25 italic mb-3">Dados insuficientes para medir relação entre score e resultado. Os indicadores ficam mais confiáveis conforme jogos são analisados.</p>}
      {!summary.insufficientSample && summary.avgScoreConfirmed !== null && (<div className="flex gap-4 text-[11px] text-white/40 mb-3">{summary.avgScoreConfirmed !== null && <span>Score médio confirmados: <b className="text-emerald-400/70">{summary.avgScoreConfirmed}</b></span>}{summary.avgScoreFailed !== null && <span>Score médio falhados: <b className="text-rose-400/70">{summary.avgScoreFailed}</b></span>}</div>)}
      {isAdvanced && summary.recentOutcomes.length > 0 && (<div className="space-y-1.5 pt-2 border-t border-white/[0.04]"><h5 className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Recentes</h5>{summary.recentOutcomes.slice(0, 5).map(o => (<div key={o.canonicalMatchId} className="flex items-center gap-3 text-[11px] text-white/40"><span className="flex-1 truncate">{o.homeTeam} x {o.awayTeam}</span>{o.monitoredPatterns.length > 0 && <span className="text-[9px] text-white/20 truncate max-w-[120px]">{o.monitoredPatterns.slice(0, 2).map(p => p.patternName).join(', ')}{o.monitoredPatterns.length > 2 ? ` +${o.monitoredPatterns.length - 2}` : ''}</span>}{o.preMatchScore && <span className="text-white/25 tabular-nums">{o.preMatchScore}/100</span>}<span className={`text-[9px] px-2 py-0.5 rounded ${o.outcomeStatus === 'complete' ? 'bg-emerald-500/8 text-emerald-400/50' : o.outcomeStatus === 'prematch_only' ? 'bg-white/[0.03] text-white/20' : 'bg-amber-500/6 text-amber-400/40'}`}>{o.outcomeStatus === 'complete' ? 'Completa' : o.outcomeStatus === 'prematch_only' ? 'Pré-jogo' : 'Resolvida'}</span></div>))}</div>)}
    </section>
  )
}
