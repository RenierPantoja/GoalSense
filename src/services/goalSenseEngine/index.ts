import type { FixtureStatistic } from '@/lib/apiClient'

export interface SignalResult {
  available: boolean
  reason?: string
  score?: number
  heatLevel?: 'cold' | 'warm' | 'hot' | 'very_hot'
  signals?: Signal[]
}

export interface Signal {
  type: string
  label: string
  score: number
  reasons: string[]
}

function getStatValue(stats: FixtureStatistic[], type: string, side: 'home' | 'away'): number {
  const stat = stats.find((s) => s.type.toLowerCase().includes(type.toLowerCase()))
  if (!stat) return 0
  const val = side === 'home' ? stat.home : stat.away
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return val
  return parseInt(String(val).replace('%', '')) || 0
}

export function calculateGoalSenseScore(stats: FixtureStatistic[], elapsed: number | null): SignalResult {
  if (stats.length === 0) {
    return { available: false, reason: 'Dados estatísticos insuficientes pelo provider.' }
  }

  const signals: Signal[] = []

  const homePoss = getStatValue(stats, 'possession', 'home')
  const awayPoss = getStatValue(stats, 'possession', 'away')
  const homeShots = getStatValue(stats, 'Total Shots', 'home')
  const awayShots = getStatValue(stats, 'Total Shots', 'away')
  const homeOnTarget = getStatValue(stats, 'Shots on Goal', 'home')
  const awayOnTarget = getStatValue(stats, 'Shots on Goal', 'away')
  const homeCorners = getStatValue(stats, 'Corner', 'home')
  const awayCorners = getStatValue(stats, 'Corner', 'away')
  const homeDangerous = getStatValue(stats, 'Dangerous', 'home')
  const awayDangerous = getStatValue(stats, 'Dangerous', 'away')

  const totalShots = homeShots + awayShots
  const totalCorners = homeCorners + awayCorners
  const totalOnTarget = homeOnTarget + awayOnTarget
  const minute = elapsed || 0

  // Goal Pressure
  if (totalOnTarget >= 5 && totalShots >= 12) {
    const score = Math.min(95, 50 + totalOnTarget * 5 + totalShots * 2)
    signals.push({
      type: 'goal_pressure',
      label: 'Pressão para gol',
      score,
      reasons: [`${totalOnTarget} finalizações no alvo`, `${totalShots} finalizações totais`],
    })
  }

  // Corner Storm
  if (totalCorners >= 7) {
    const score = Math.min(90, 40 + totalCorners * 6)
    signals.push({
      type: 'corner_storm',
      label: 'Pressão para escanteio',
      score,
      reasons: [`${totalCorners} escanteios no jogo`, `Ritmo elevado de cobranças`],
    })
  }

  // Late Goal
  if (minute >= 75 && totalOnTarget >= 4) {
    const score = Math.min(92, 55 + (minute - 75) * 2 + totalOnTarget * 4)
    signals.push({
      type: 'late_goal',
      label: 'Gol tardio',
      score,
      reasons: [`Minuto ${minute}`, `${totalOnTarget} no alvo`, `Pressão nos minutos finais`],
    })
  }

  // Open Game
  if (totalShots >= 20 && Math.abs(homePoss - awayPoss) < 15) {
    const score = Math.min(85, 40 + totalShots * 2)
    signals.push({
      type: 'open_game',
      label: 'Jogo aberto',
      score,
      reasons: [`${totalShots} finalizações`, `Posse equilibrada`],
    })
  }

  // Over HT pressure
  if (minute <= 45 && totalShots >= 10 && totalOnTarget >= 4) {
    const score = Math.min(88, 45 + totalShots * 3 + totalOnTarget * 4)
    signals.push({
      type: 'over_ht',
      label: 'Pressão no primeiro tempo',
      score,
      reasons: [`${totalShots} finalizações antes do intervalo`, `Alto volume ofensivo`],
    })
  }

  if (signals.length === 0) {
    return {
      available: true,
      score: 20,
      heatLevel: 'cold',
      signals: [],
    }
  }

  const maxScore = Math.max(...signals.map((s) => s.score))
  let heatLevel: 'cold' | 'warm' | 'hot' | 'very_hot' = 'cold'
  if (maxScore >= 80) heatLevel = 'very_hot'
  else if (maxScore >= 60) heatLevel = 'hot'
  else if (maxScore >= 40) heatLevel = 'warm'

  return {
    available: true,
    score: maxScore,
    heatLevel,
    signals: signals.sort((a, b) => b.score - a.score),
  }
}
