/**
 * Auto Signal Scoring (Phase B19) — deterministic signal-QUALITY score.
 * ─────────────────────────────────────────────────────────────────────────────
 * Blends live evidence + learning context. Penalizes missing data, low sample
 * and high unknown. The score is a quality indicator, NOT a probability and NOT a
 * promise of outcome. With learning profiles absent it runs in "limited context".
 */
import type { DataQuality, SampleQuality } from '../contracts/learning.types.js'
import type { AutoSignalScore } from './autoEngine.types.js'

export interface ScoringInput {
  baseScore: number
  recentOffensive: number
  hasLiveStats: boolean
  scoreDiff: number
  importanceLabel: string | null
  patternProfile?: { usefulRate: number | null; sampleQuality: SampleQuality; unknownRate: number | null } | null
  competitionUsefulRate?: number | null
  teamUsefulRate?: number | null
  minuteWindowUsefulRate?: number | null
  dataQuality: DataQuality
  unknownRate: number | null
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)) }

export function scoreOpportunity(i: ScoringInput): AutoSignalScore {
  const notes: string[] = []

  const baseScore = clamp(i.baseScore, 0, 50)

  // Live context: recent offensive pressure + tight scoreline.
  let liveContextScore = clamp(i.recentOffensive * 3, 0, 12)
  if (i.scoreDiff <= 1) liveContextScore += 3
  if (i.hasLiveStats) liveContextScore += 2
  liveContextScore = clamp(liveContextScore, 0, 16)
  if (liveContextScore > 0) notes.push(`Contexto ao vivo +${liveContextScore} (${i.recentOffensive} eventos ofensivos recentes)`)

  // Pattern learning context (only when a real sample exists).
  let patternLearningScore = 0
  if (i.patternProfile && i.patternProfile.usefulRate != null && (i.patternProfile.sampleQuality === 'moderate' || i.patternProfile.sampleQuality === 'strong')) {
    patternLearningScore = clamp(Math.round((i.patternProfile.usefulRate - 0.4) * 30), -6, 15)
    notes.push(`Aprendizado do padrão ${patternLearningScore >= 0 ? '+' : ''}${patternLearningScore} (útil ${Math.round((i.patternProfile.usefulRate) * 100)}%, ${i.patternProfile.sampleQuality})`)
  } else if (i.patternProfile) {
    notes.push('Padrão com amostra baixa — contexto limitado')
  }

  const competitionScore = i.competitionUsefulRate != null ? clamp(Math.round((i.competitionUsefulRate - 0.5) * 16), -4, 8) : 0
  if (competitionScore !== 0) notes.push(`Competição ${competitionScore >= 0 ? '+' : ''}${competitionScore}`)

  const teamContextScore = i.teamUsefulRate != null ? clamp(Math.round((i.teamUsefulRate - 0.5) * 12), -3, 6) : 0
  if (teamContextScore !== 0) notes.push(`Contexto de time ${teamContextScore >= 0 ? '+' : ''}${teamContextScore}`)

  const minuteWindowScore = i.minuteWindowUsefulRate != null ? clamp(Math.round((i.minuteWindowUsefulRate - 0.5) * 16), -4, 8) : 0
  if (minuteWindowScore !== 0) notes.push(`Janela de minuto ${minuteWindowScore >= 0 ? '+' : ''}${minuteWindowScore}`)

  let dataQualityScore = 0
  if (i.dataQuality === 'rich') dataQualityScore = 6
  else if (i.dataQuality === 'partial') dataQualityScore = 1
  else dataQualityScore = -12
  notes.push(`Qualidade de dados (${i.dataQuality}) ${dataQualityScore >= 0 ? '+' : ''}${dataQualityScore}`)

  // Risk penalty for thin/uncertain context.
  let riskPenalty = 0
  if (i.patternProfile && i.patternProfile.sampleQuality === 'insufficient') riskPenalty += 8
  if (i.unknownRate != null && i.unknownRate >= 0.4) riskPenalty += 6
  if (riskPenalty > 0) notes.push(`Penalidade de risco -${riskPenalty}`)

  const finalScore = clamp(
    baseScore + liveContextScore + patternLearningScore + competitionScore + teamContextScore + minuteWindowScore + dataQualityScore - riskPenalty,
    0, 100,
  )

  return {
    baseScore, liveContextScore, patternLearningScore, competitionScore,
    teamContextScore, minuteWindowScore, dataQualityScore, riskPenalty, finalScore, scoringNotes: notes,
  }
}
