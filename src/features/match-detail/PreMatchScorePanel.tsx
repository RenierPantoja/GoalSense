/**
 * Pre-Match Score Panel — strategic reading visualization.
 * Shows overall score, dimensions, main read, watch points.
 */
import { useMemo } from 'react'
import { calculatePreMatchScore, type PreMatchScore } from '@/services/intelligence/preMatchScoreEngine'
import type { PreMatchIntelligenceResult } from '@/services/preMatchIntelligence'
import { useViewMode } from '@/context/ViewModeContext'

interface Props {
  data: PreMatchIntelligenceResult
}

export function PreMatchScorePanel({ data }: Props) {
  const { isAdvanced } = useViewMode()
  const score = useMemo(() => calculatePreMatchScore(data), [data])

  if (!score || !score.available) return null

  return (
    <section className="rounded-[22px] border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-white/80">Score pré-jogo GoalSense</h3>
          <p className="text-[11px] text-white/35 mt-0.5">Leitura estratégica baseada em dados reais</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[36px] font-bold tabular-nums leading-none ${score.overallScore >= 70 ? 'text-emerald-400' : score.overallScore >= 50 ? 'text-white/80' : 'text-white/40'}`}>{score.overallScore}</span>
          <div className="text-right">
            <span className="text-[10px] text-white/25 block">/100</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${score.confidence === 'alta' ? 'bg-emerald-500/10 text-emerald-400/70' : score.confidence === 'média' ? 'bg-amber-500/10 text-amber-400/70' : 'bg-white/[0.04] text-white/35'}`}>{score.confidence}</span>
          </div>
        </div>
      </div>

      {/* Main Read */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] px-5 py-4">
        <p className="text-[13px] text-white/65 leading-relaxed">{score.mainRead}</p>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <DimensionCard dim={score.homeStrength} label="Mandante" />
        <DimensionCard dim={score.awayStrength} label="Visitante" />
        <DimensionCard dim={score.goalsTrend} label="Gols" />
        {isAdvanced && <DimensionCard dim={score.disciplineRisk} label="Disciplina" />}
        {isAdvanced && <DimensionCard dim={score.balance} label="Equilíbrio" />}
      </div>

      {/* Watch Points */}
      {score.watchPoints.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">O que observar</h4>
          <div className="space-y-1.5">
            {score.watchPoints.map((wp, i) => (
              <div key={i} className={`rounded-lg px-4 py-2.5 border-l-[3px] ${wp.severity === 'critical' ? 'border-l-rose-400/50 bg-rose-500/[0.02]' : wp.severity === 'attention' ? 'border-l-amber-400/40 bg-amber-500/[0.02]' : 'border-l-white/[0.1] bg-white/[0.01]'}`}>
                <span className="text-[12px] text-white/60 block">{wp.label}</span>
                <span className="text-[11px] text-white/35">{wp.detail}{wp.timing && ` · ${wp.timing}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Flags */}
      {score.riskFlags.length > 0 && isAdvanced && (
        <div className="flex flex-wrap gap-2">
          {score.riskFlags.map((rf, i) => (
            <span key={i} className={`text-[10px] px-2.5 py-1 rounded-lg border ${rf.severity === 'high' ? 'border-rose-500/15 text-rose-400/60 bg-rose-500/[0.02]' : rf.severity === 'medium' ? 'border-amber-500/15 text-amber-400/50 bg-amber-500/[0.02]' : 'border-white/[0.06] text-white/30 bg-white/[0.01]'}`}>{rf.label}</span>
          ))}
        </div>
      )}

      {/* Sources */}
      {isAdvanced && (
        <div className="pt-2 border-t border-white/[0.03] flex items-center gap-3 text-[10px] text-white/20">
          <span>Qualidade: {score.dataQuality}</span>
          {score.sources.length > 0 && <span>Fontes: {score.sources.join(', ')}</span>}
        </div>
      )}
    </section>
  )
}

function DimensionCard({ dim, label }: { dim: { score: number; label: string; explanation: string; evidence: string[] }; label: string }) {
  const color = dim.score >= 70 ? 'text-emerald-400' : dim.score >= 50 ? 'text-white/70' : 'text-white/40'
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3.5 text-center">
      <span className={`text-[20px] font-bold tabular-nums block ${color}`}>{dim.score}</span>
      <span className="text-[10px] text-white/40 block mt-0.5">{label}</span>
      <span className="text-[9px] text-white/25 block">{dim.label}</span>
    </div>
  )
}
