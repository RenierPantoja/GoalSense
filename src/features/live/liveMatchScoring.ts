import type { LiveFixture } from '@/lib/apiClient'

export interface MatchRelevance {
  score: number
  reasons: string[]
  dataQuality: 'complete' | 'good' | 'partial' | 'limited'
}

export function calculateRelevance(fx: LiveFixture): MatchRelevance {
  let score = 0
  const reasons: string[] = []

  // Live bonus
  if (fx.status.short === 'LIVE' || fx.status.short === 'HT' || fx.status.short === '1H' || fx.status.short === '2H') {
    score += 50
    reasons.push('Partida ao vivo')
  }

  // Elapsed minute (higher = more interesting)
  if (fx.status.elapsed && fx.status.elapsed > 60) {
    score += 15
    reasons.push('Minuto avançado')
  } else if (fx.status.elapsed && fx.status.elapsed > 30) {
    score += 8
  }

  // Goals scored
  const goals = (fx.score.home ?? 0) + (fx.score.away ?? 0)
  if (goals >= 3) {
    score += 20
    reasons.push('Jogo com muitos gols')
  } else if (goals >= 1) {
    score += 10
  }

  // Logos available
  if (fx.homeTeam.logo && fx.awayTeam.logo) {
    score += 10
    reasons.push('Escudos disponíveis')
  }

  // League logo
  if (fx.league.logo) score += 3

  // Provider enrichment
  if (fx.provider === 'api_football') {
    score += 5
    reasons.push('Dados API-Football')
  }

  // Data quality
  let dataQuality: MatchRelevance['dataQuality'] = 'limited'
  if (fx.homeTeam.logo && fx.awayTeam.logo && fx.league.logo) {
    dataQuality = 'complete'
  } else if (fx.homeTeam.logo && fx.awayTeam.logo) {
    dataQuality = 'good'
  } else if (fx.homeTeam.logo || fx.awayTeam.logo) {
    dataQuality = 'partial'
  }

  return { score, reasons, dataQuality }
}

export function sortByRelevance(fixtures: LiveFixture[]): LiveFixture[] {
  return [...fixtures].sort((a, b) => calculateRelevance(b).score - calculateRelevance(a).score)
}
