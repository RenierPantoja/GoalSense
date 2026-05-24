export type DataDepthLevel = 'basic' | 'standard' | 'advanced' | 'premium'

export interface DataDepthResult {
  level: DataDepthLevel
  score: number
  availableBlocks: string[]
  missingBlocks: string[]
  reasons: string[]
}

export interface MatchAnalyticsBundle {
  hasScoreboard: boolean
  hasStatistics: boolean
  hasEvents: boolean
  hasLineups: boolean
  hasLogos: boolean
  hasLeagueLogo: boolean
  hasVenue: boolean
  hasMultipleSources: boolean
  hasVideos: boolean
  statsCount: number
  eventsCount: number
  rosterCount: number
}

export function calculateDataDepth(bundle: MatchAnalyticsBundle): DataDepthResult {
  let score = 0
  const available: string[] = []
  const missing: string[] = []
  const reasons: string[] = []

  if (bundle.hasScoreboard) { score += 15; available.push('scoreboard'); reasons.push('Placar disponível') }
  else missing.push('scoreboard')

  if (bundle.hasLogos) { score += 10; available.push('logos'); reasons.push('Escudos completos') }
  else missing.push('logos')

  if (bundle.hasStatistics && bundle.statsCount > 5) { score += 25; available.push('statistics'); reasons.push('Estatísticas detalhadas') }
  else if (bundle.hasStatistics) { score += 15; available.push('statistics_basic'); reasons.push('Estatísticas básicas') }
  else missing.push('statistics')

  if (bundle.hasEvents && bundle.eventsCount > 0) { score += 15; available.push('events'); reasons.push('Eventos disponíveis') }
  else missing.push('events')

  if (bundle.hasLineups && bundle.rosterCount > 10) { score += 15; available.push('lineups'); reasons.push('Escalações completas') }
  else if (bundle.hasLineups) { score += 8; available.push('lineups_partial') }
  else missing.push('lineups')

  if (bundle.hasVenue) { score += 5; available.push('venue') }
  if (bundle.hasMultipleSources) { score += 10; reasons.push('Múltiplas fontes') }
  if (bundle.hasVideos) { score += 5; available.push('videos'); reasons.push('Vídeos disponíveis') }

  let level: DataDepthLevel = 'basic'
  if (score >= 80) level = 'premium'
  else if (score >= 55) level = 'advanced'
  else if (score >= 30) level = 'standard'

  return { level, score, availableBlocks: available, missingBlocks: missing, reasons }
}
