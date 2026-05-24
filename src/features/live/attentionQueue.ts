import type { LiveFixture } from '@/lib/apiClient'
import type { FixtureStats } from './LiveScannerTable'

export type AttentionLevel = 'critical' | 'high' | 'medium' | 'low'

export interface AttentionResult {
  score: number
  level: AttentionLevel
  reasons: string[]
}

const TOP_LEAGUES = new Set([
  'laliga', 'la liga', 'premier league', 'serie a', 'bundesliga', 'ligue 1',
  'champions league', 'europa league', 'conference league',
  'brasileirão', 'brasileirao', 'copa libertadores', 'eredivisie', 'mls', 'liga mx',
])

const KNOWN_CLUBS = new Set([
  'real madrid', 'barcelona', 'atletico madrid', 'manchester city', 'manchester united',
  'liverpool', 'arsenal', 'chelsea', 'tottenham', 'bayern munich', 'bayern münchen',
  'borussia dortmund', 'juventus', 'inter', 'ac milan', 'napoli', 'psg',
  'flamengo', 'palmeiras', 'river plate', 'boca juniors',
  'real betis', 'sevilla', 'athletic club', 'real sociedad', 'valencia',
  'roma', 'lazio', 'atalanta', 'lyon', 'marseille', 'newcastle',
])

export function calculateAttention(fx: LiveFixture, stats?: FixtureStats): AttentionResult {
  let score = 0
  const reasons: string[] = []
  const elapsed = fx.status.elapsed || 0
  const homeGoals = fx.score.home ?? 0
  const awayGoals = fx.score.away ?? 0
  const totalGoals = homeGoals + awayGoals
  const isLive = ['LIVE', 'HT', '1H', '2H'].includes(fx.status.short)

  // Base: live
  if (isLive) { score += 15; reasons.push('Partida ao vivo') }

  // Time context
  if (elapsed > 45) { score += 8 }
  if (elapsed >= 75) { score += 12; reasons.push('Fase final') }
  else if (elapsed <= 15 && isLive) { score -= 8 }

  // Score dynamics
  if (elapsed >= 60 && homeGoals === awayGoals && totalGoals > 0) { score += 14; reasons.push('Empate no segundo tempo') }
  if (elapsed >= 60 && Math.abs(homeGoals - awayGoals) === 1) { score += 12; reasons.push('Diferença mínima em fase avançada') }
  if (totalGoals >= 4) { score += 14; reasons.push('Jogo com muitos gols') }
  else if (totalGoals >= 3) { score += 10 }
  else if (totalGoals === 0 && !stats) { score -= 10 }

  // Stats available
  if (stats) {
    const totalShots = (stats.shots?.home || 0) + (stats.shots?.away || 0)
    const totalOnTarget = (stats.shotsOnTarget?.home || 0) + (stats.shotsOnTarget?.away || 0)
    const totalCorners = (stats.corners?.home || 0) + (stats.corners?.away || 0)
    const totalCards = (stats.yellowCards?.home || 0) + (stats.yellowCards?.away || 0)

    if (totalShots >= 16) { score += 10; reasons.push('Alto volume ofensivo') }
    if (totalOnTarget >= 6) { score += 10; reasons.push('Muitas finalizações no alvo') }
    if (totalCorners >= 8) { score += 8; reasons.push('Muitos escanteios') }
    if (totalCards >= 5) { score += 6; reasons.push('Jogo com muitos cartões') }
    score += 8 // bonus por ter stats
  } else {
    score -= 8
  }

  // League & clubs
  if (TOP_LEAGUES.has(fx.league.name.toLowerCase())) { score += 6 }
  if (KNOWN_CLUBS.has(fx.homeTeam.name.toLowerCase()) || KNOWN_CLUBS.has(fx.awayTeam.name.toLowerCase())) { score += 6 }

  // Clamp
  score = Math.max(0, Math.min(100, score))

  let level: AttentionLevel = 'low'
  if (score >= 80) level = 'critical'
  else if (score >= 60) level = 'high'
  else if (score >= 35) level = 'medium'

  return { score, level, reasons: reasons.slice(0, 4) }
}

export function sortByAttention(fixtures: LiveFixture[], statsMap?: Map<number, FixtureStats>): LiveFixture[] {
  return [...fixtures].sort((a, b) => {
    const sa = calculateAttention(a, statsMap?.get(a.id)).score
    const sb = calculateAttention(b, statsMap?.get(b.id)).score
    return sb - sa
  })
}
