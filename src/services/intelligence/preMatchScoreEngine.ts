/**
 * Pre-Match Score Engine — synthesizes available data into a strategic reading.
 * No predictions. No fake odds. Only observable tendencies with confidence levels.
 */
import type { PreMatchIntelligenceResult } from '../preMatchIntelligence'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScoreDimension {
  score: number
  label: string
  explanation: string
  evidence: string[]
}

export interface WatchPoint {
  label: string
  detail: string
  timing?: string
  severity: 'info' | 'attention' | 'critical'
}

export interface RiskFlag {
  label: string
  detail: string
  severity: 'low' | 'medium' | 'high'
}

export interface PreMatchScore {
  available: boolean
  overallScore: number
  confidence: 'alta' | 'média' | 'baixa'
  dataQuality: 'rich' | 'partial' | 'basic' | 'low'
  homeStrength: ScoreDimension
  awayStrength: ScoreDimension
  goalsTrend: ScoreDimension
  disciplineRisk: ScoreDimension
  balance: ScoreDimension
  mainRead: string
  watchPoints: WatchPoint[]
  riskFlags: RiskFlag[]
  limitations: string[]
  sources: string[]
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function calculatePreMatchScore(data: PreMatchIntelligenceResult): PreMatchScore | null {
  if (!data.available) return null

  const sources = [...(data.dataSources || [])]
  const limitations = [...(data.limitations || [])]

  // ─── Home Strength ─────────────────────────────────────────────────────
  const homeStrength = calcHomeStrength(data)

  // ─── Away Strength ─────────────────────────────────────────────────────
  const awayStrength = calcAwayStrength(data)

  // ─── Goals Trend ───────────────────────────────────────────────────────
  const goalsTrend = calcGoalsTrend(data)

  // ─── Discipline ────────────────────────────────────────────────────────
  const disciplineRisk = calcDiscipline(data)

  // ─── Balance ───────────────────────────────────────────────────────────
  const balance = calcBalance(homeStrength.score, awayStrength.score, data)

  // ─── Overall ───────────────────────────────────────────────────────────
  const dimensions = [homeStrength, awayStrength, goalsTrend, disciplineRisk, balance]
  const validDimensions = dimensions.filter(d => d.score > 0)
  const overallScore = validDimensions.length > 0 ? Math.round(validDimensions.reduce((s, d) => s + d.score, 0) / validDimensions.length) : 0

  // ─── Data Quality ──────────────────────────────────────────────────────
  const hasForm = Boolean(data.homeForm && data.awayForm)
  const hasH2H = Boolean(data.h2h && data.h2h.total > 0)
  const hasGoals = Boolean(data.goalsProfile && data.goalsProfile.sampleSize >= 4)
  const hasDiscipline = Boolean(data.disciplineProfile && data.disciplineProfile.trend !== 'unknown')
  const hasHomeAway = Boolean(data.homeAtHome && data.awayAway)
  const strongDims = [hasForm, hasH2H, hasGoals, hasDiscipline, hasHomeAway].filter(Boolean).length

  const dataQuality = strongDims >= 4 ? 'rich' : strongDims >= 2 ? 'partial' : strongDims >= 1 ? 'basic' : 'low'
  const confidence = dataQuality === 'rich' ? 'alta' : dataQuality === 'partial' ? 'média' : 'baixa'

  if (dataQuality === 'low' && overallScore < 30) return null

  // ─── Main Read ─────────────────────────────────────────────────────────
  const mainRead = buildMainRead(homeStrength, awayStrength, goalsTrend, disciplineRisk, balance, confidence)

  // ─── Watch Points ──────────────────────────────────────────────────────
  const watchPoints = buildWatchPoints(homeStrength, awayStrength, goalsTrend, disciplineRisk)

  // ─── Risk Flags ────────────────────────────────────────────────────────
  const riskFlags = buildRiskFlags(data, confidence)

  return { available: true, overallScore, confidence, dataQuality, homeStrength, awayStrength, goalsTrend, disciplineRisk, balance, mainRead, watchPoints, riskFlags, limitations, sources }
}

// ─── Dimension Calculators ───────────────────────────────────────────────────

function calcHomeStrength(data: PreMatchIntelligenceResult): ScoreDimension {
  const evidence: string[] = []
  let score = 50

  if (data.homeForm) {
    const { wins, goalsFor, goalsAgainst } = data.homeForm.summary
    const n = data.homeForm.matches.length
    const winRate = wins / Math.max(n, 1)
    score = Math.round(40 + winRate * 40 + (goalsFor / Math.max(n, 1)) * 8 - (goalsAgainst / Math.max(n, 1)) * 5)
    evidence.push(`${wins}V em ${n} jogos`)
    evidence.push(`${goalsFor} gols marcados`)
    if (data.homeForm.summary.cleanSheets > 0) evidence.push(`${data.homeForm.summary.cleanSheets} clean sheets`)
  }

  if (data.homeAtHome && data.homeAtHome.matches.length >= 2) {
    const hw = data.homeAtHome.summary.wins
    evidence.push(`${hw}V em casa`)
    score += hw * 3
  }

  score = clamp(score, 20, 95)
  const label = score >= 75 ? 'Forte' : score >= 55 ? 'Regular' : 'Fraco'

  return { score, label, explanation: `Mandante chega com forma ${label.toLowerCase()}`, evidence }
}

function calcAwayStrength(data: PreMatchIntelligenceResult): ScoreDimension {
  const evidence: string[] = []
  let score = 50

  if (data.awayForm) {
    const { wins, goalsFor, goalsAgainst } = data.awayForm.summary
    const n = data.awayForm.matches.length
    const winRate = wins / Math.max(n, 1)
    score = Math.round(35 + winRate * 40 + (goalsFor / Math.max(n, 1)) * 8 - (goalsAgainst / Math.max(n, 1)) * 5)
    evidence.push(`${wins}V em ${n} jogos`)
    evidence.push(`${goalsFor} gols marcados`)
  }

  if (data.awayAway && data.awayAway.matches.length >= 2) {
    const aw = data.awayAway.summary.wins
    evidence.push(`${aw}V fora`)
    score += aw * 3
  }

  score = clamp(score, 15, 90)
  const label = score >= 70 ? 'Forte' : score >= 50 ? 'Regular' : 'Fraco'

  return { score, label, explanation: `Visitante chega com forma ${label.toLowerCase()}`, evidence }
}

function calcGoalsTrend(data: PreMatchIntelligenceResult): ScoreDimension {
  const evidence: string[] = []
  let score = 50

  if (data.goalsProfile) {
    const { avgGoalsPerMatch, over25Pct, bothScoredPct } = data.goalsProfile
    score = Math.round(30 + avgGoalsPerMatch * 12 + over25Pct * 0.2 + bothScoredPct * 0.15)
    evidence.push(`Média ${avgGoalsPerMatch} gols/jogo`)
    evidence.push(`Over 2.5: ${over25Pct}%`)
    if (bothScoredPct >= 50) evidence.push(`Ambos marcam: ${bothScoredPct}%`)
  }

  if (data.h2h && data.h2h.total > 0) {
    const h2hAvg = (data.h2h.homeGoals + data.h2h.awayGoals) / data.h2h.total
    if (h2hAvg >= 2.5) { score += 8; evidence.push(`H2H: média ${h2hAvg.toFixed(1)} gols`) }
  }

  score = clamp(score, 20, 95)
  const label = score >= 72 ? 'Alta' : score >= 50 ? 'Moderada' : 'Baixa'

  return { score, label, explanation: `Tendência de gols: ${label.toLowerCase()}`, evidence }
}

function calcDiscipline(data: PreMatchIntelligenceResult): ScoreDimension {
  const evidence: string[] = []
  let score = 40

  if (data.disciplineProfile) {
    const { homeYellowAvg, awayYellowAvg, trend } = data.disciplineProfile
    const totalAvg = homeYellowAvg + awayYellowAvg
    score = Math.round(30 + totalAvg * 10)
    evidence.push(`Mandante: ${homeYellowAvg} amarelos/jogo`)
    evidence.push(`Visitante: ${awayYellowAvg} amarelos/jogo`)
    if (trend === 'high') evidence.push('Tendência alta')
  }

  score = clamp(score, 20, 90)
  const label = score >= 65 ? 'Alto' : score >= 45 ? 'Moderado' : 'Baixo'

  return { score, label, explanation: `Risco disciplinar: ${label.toLowerCase()}`, evidence }
}

function calcBalance(homeScore: number, awayScore: number, data: PreMatchIntelligenceResult): ScoreDimension {
  const diff = Math.abs(homeScore - awayScore)
  const evidence: string[] = []
  let score = 50

  if (diff <= 10) { score = 80; evidence.push('Times com forma muito similar') }
  else if (diff <= 20) { score = 65; evidence.push('Leve vantagem para um lado') }
  else { score = 40; evidence.push('Diferença significativa de forma') }

  if (data.h2h && data.h2h.total >= 3) {
    const { homeWins, awayWins, draws } = data.h2h
    if (draws >= homeWins && draws >= awayWins) { score += 10; evidence.push('H2H com muitos empates') }
  }

  score = clamp(score, 20, 95)
  const label = score >= 70 ? 'Equilibrado' : score >= 50 ? 'Leve vantagem' : 'Desequilibrado'

  return { score, label, explanation: label, evidence }
}

// ─── Main Read ───────────────────────────────────────────────────────────────

function buildMainRead(home: ScoreDimension, away: ScoreDimension, goals: ScoreDimension, discipline: ScoreDimension, balance: ScoreDimension, confidence: string): string {
  const parts: string[] = []

  if (goals.score >= 70) parts.push('Os dados sugerem tendência para gols nesta partida')
  else if (goals.score <= 40) parts.push('Leitura inicial aponta jogo com poucos gols')

  if (balance.score >= 70) parts.push('confronto equilibrado')
  else if (home.score > away.score + 15) parts.push('mandante com vantagem na forma recente')
  else if (away.score > home.score + 15) parts.push('visitante chega em melhor momento')

  if (discipline.score >= 65) parts.push('atenção ao risco disciplinar')

  if (parts.length === 0) parts.push('Leitura pré-jogo com sinais moderados')

  const confNote = confidence === 'baixa' ? ' A confiança é baixa por dados limitados.' : confidence === 'média' ? ' Confiança média.' : ''

  return parts.join(', ') + '.' + confNote
}

// ─── Watch Points ────────────────────────────────────────────────────────────

function buildWatchPoints(home: ScoreDimension, away: ScoreDimension, goals: ScoreDimension, discipline: ScoreDimension): WatchPoint[] {
  const points: WatchPoint[] = []

  if (goals.score >= 65) points.push({ label: 'Monitorar volume ofensivo', detail: 'Perfil de gols sugere jogo aberto', timing: 'Primeiros 30 minutos', severity: 'info' })
  if (home.score >= 75) points.push({ label: 'Mandante forte', detail: 'Verificar se confirma pressão inicial em casa', timing: 'Primeiros 15 minutos', severity: 'info' })
  if (away.score >= 70) points.push({ label: 'Visitante perigoso', detail: 'Atenção às finalizações do visitante', timing: 'Ao longo do jogo', severity: 'attention' })
  if (discipline.score >= 65) points.push({ label: 'Cartões prováveis', detail: 'Jogo com tendência a faltas e cartões', timing: 'Após 30 minutos', severity: 'attention' })
  if (goals.score >= 55) points.push({ label: 'Segundo tempo', detail: 'Se empate até 60\', monitorar padrão Reta final', timing: 'Após 60 minutos', severity: 'info' })

  return points.slice(0, 4)
}

// ─── Risk Flags ──────────────────────────────────────────────────────────────

function buildRiskFlags(data: PreMatchIntelligenceResult, confidence: string): RiskFlag[] {
  const flags: RiskFlag[] = []

  if (confidence === 'baixa') flags.push({ label: 'Dados limitados', detail: 'A leitura pode ser imprecisa por falta de amostra', severity: 'medium' })
  if (data.goalsProfile && data.goalsProfile.sampleSize < 6) flags.push({ label: 'Amostra pequena', detail: `Apenas ${data.goalsProfile.sampleSize} jogos na base`, severity: 'low' })
  if (data.dataSources.includes('Base GoalSense')) flags.push({ label: 'Dados parciais da Base GoalSense', detail: 'Parte da leitura usa histórico próprio, não do provider', severity: 'low' })

  return flags.slice(0, 3)
}

function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)) }
