/**
 * Pre-Match Advanced Intelligence — on-demand data (injuries, scorers, patterns).
 * Only fetched when user clicks "Carregar análise avançada".
 * Uses cache aggressively. Graceful fallback on quota/errors.
 */
import { getCache, setCache, CACHE_TTL } from '../cache/goalsenseCache'
import { cacheKeys } from '../cache/cacheKeys'
import { getTeamProfile } from './goalsenseKnowledgeBase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlayerAbsence {
  name: string
  reason: string
  type: 'injury' | 'suspension' | 'doubt' | 'unknown'
}

export interface TeamAbsenceReport {
  teamName: string
  injuries: PlayerAbsence[]
  suspensions: PlayerAbsence[]
  source: string
  limitations: string[]
}

export interface TeamScorerReport {
  teamName: string
  players: { name: string; goals: number; assists?: number; position?: string }[]
  source: string
}

export interface ApplicablePattern {
  patternId: string
  name: string
  severity: string
  reason: string
  readiness: 'ready' | 'needs_live_data' | 'needs_more_data'
}

export interface PreMatchRiskFlag {
  label: string
  detail: string
  severity: 'info' | 'attention' | 'critical'
}

export interface PreMatchAdvancedResult {
  loaded: boolean
  absences: { home: TeamAbsenceReport; away: TeamAbsenceReport }
  scorers: { home: TeamScorerReport; away: TeamScorerReport }
  applicablePatterns: ApplicablePattern[]
  riskFlags: PreMatchRiskFlag[]
  sources: string[]
  limitations: string[]
  confidence: 'high' | 'medium' | 'low'
}

interface AdvancedInput {
  homeName: string
  awayName: string
  homeId?: number
  awayId?: number
  leagueId?: number
  season?: number
  activePatterns?: { id: string; name: string; severity: string; conditions: { type: string }[] }[]
  goalsProfile?: { avgGoalsPerMatch: number; over25Pct: number; bothScoredPct: number }
  homeForm?: { summary: { wins: number; goalsFor: number; goalsAgainst: number }; matches: { wasHome: boolean }[] }
  awayForm?: { summary: { wins: number; goalsFor: number; goalsAgainst: number }; matches: { wasHome: boolean }[] }
  disciplineTrend?: string
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function getPreMatchAdvanced(input: AdvancedInput): Promise<PreMatchAdvancedResult> {
  const { homeName, awayName, homeId, awayId, leagueId, season: inputSeason } = input
  const season = inputSeason || new Date().getFullYear()
  const sources: string[] = []
  const limitations: string[] = []

  // Check cache
  const cacheKey = cacheKeys.prematchAdvanced(homeName, awayName)
  const cached = getCache<PreMatchAdvancedResult>(cacheKey)
  if (cached) return cached.value

  // ─── Injuries ────────────────────────────────────────────────────────────
  const homeAbsences = await fetchAbsences(homeId, homeName, season, sources, limitations)
  const awayAbsences = await fetchAbsences(awayId, awayName, season, sources, limitations)

  // ─── Top Scorers ─────────────────────────────────────────────────────────
  const homeScorers = await fetchScorers(homeId, homeName, leagueId, season, sources, limitations)
  const awayScorers = await fetchScorers(awayId, awayName, leagueId, season, sources, limitations)

  // ─── Applicable Patterns ─────────────────────────────────────────────────
  const applicablePatterns = buildApplicablePatterns(input)

  // ─── Risk Flags ──────────────────────────────────────────────────────────
  const riskFlags = buildRiskFlags(input)

  const confidence = (homeAbsences.injuries.length > 0 || homeScorers.players.length > 0) ? 'medium' : 'low'

  const result: PreMatchAdvancedResult = {
    loaded: true,
    absences: { home: homeAbsences, away: awayAbsences },
    scorers: { home: homeScorers, away: awayScorers },
    applicablePatterns,
    riskFlags,
    sources,
    limitations,
    confidence,
  }

  setCache(cacheKey, result, CACHE_TTL.PREMATCH_ADVANCED, 'goalsense_advanced')
  return result
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchAbsences(teamId: number | undefined, teamName: string, season: number, sources: string[], limitations: string[]): Promise<TeamAbsenceReport> {
  if (!teamId) {
    limitations.push(`Ausências de ${teamName}: ID do time não resolvido`)
    return { teamName, injuries: [], suspensions: [], source: 'unavailable', limitations: ['ID não resolvido'] }
  }

  const key = cacheKeys.injuries(teamId, season)
  const cached = getCache<TeamAbsenceReport>(key)
  if (cached) { sources.push('Cache GoalSense'); return cached.value }

  try {
    const res = await fetch(`/api/misc?fn=api-football-injuries&team=${teamId}&season=${season}`)
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const json = await res.json()
    const items = json.response || []

    const injuries: PlayerAbsence[] = []
    const suspensions: PlayerAbsence[] = []

    for (const item of items.slice(0, 10)) {
      const name = item.player?.name || 'Desconhecido'
      const reason = item.player?.reason || item.fixture?.reason || ''
      const type = reason.toLowerCase().includes('suspend') ? 'suspension' : 'injury'
      if (type === 'suspension') suspensions.push({ name, reason, type })
      else injuries.push({ name, reason, type })
    }

    const report: TeamAbsenceReport = { teamName, injuries, suspensions, source: 'API-Football', limitations: [] }
    setCache(key, report, CACHE_TTL.INJURIES, 'api-football')
    sources.push('API-Football Injuries')
    return report
  } catch {
    // Try knowledge base fallback
    const profile = getTeamProfile(teamId)
    if (profile && profile.samples >= 3) {
      limitations.push(`Ausências de ${teamName}: API indisponível, usando base GoalSense`)
      return { teamName, injuries: [], suspensions: [], source: 'Base GoalSense (sem dados de ausências)', limitations: ['API de lesões indisponível'] }
    }
    limitations.push(`Ausências de ${teamName}: indisponível`)
    return { teamName, injuries: [], suspensions: [], source: 'unavailable', limitations: ['API de lesões não respondeu'] }
  }
}

async function fetchScorers(teamId: number | undefined, teamName: string, leagueId: number | undefined, season: number, sources: string[], limitations: string[]): Promise<TeamScorerReport> {
  if (!leagueId) {
    limitations.push(`Goleadores de ${teamName}: liga não identificada`)
    return { teamName, players: [], source: 'unavailable' }
  }

  const key = cacheKeys.topScorers(leagueId, season)
  const cached = getCache<any[]>(key)
  let scorers: any[] = []

  if (cached) { scorers = cached.value; sources.push('Cache GoalSense') }
  else {
    try {
      const res = await fetch(`/api/misc?fn=api-football-topscorers&league=${leagueId}&season=${season}`)
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const json = await res.json()
      scorers = json.response || []
      if (scorers.length > 0) { setCache(key, scorers, CACHE_TTL.TOPSCORERS, 'api-football'); sources.push('API-Football TopScorers') }
    } catch {
      limitations.push(`Goleadores de ${teamName}: API indisponível`)
      return { teamName, players: [], source: 'unavailable' }
    }
  }

  // Filter by team
  const teamPlayers = scorers
    .filter((s: any) => s.statistics?.[0]?.team?.id === teamId)
    .slice(0, 3)
    .map((s: any) => ({
      name: s.player?.name || '',
      goals: s.statistics?.[0]?.goals?.total || 0,
      assists: s.statistics?.[0]?.goals?.assists || 0,
      position: s.player?.position || '',
    }))

  return { teamName, players: teamPlayers, source: teamPlayers.length > 0 ? 'API-Football' : 'unavailable' }
}

// ─── Pattern Analysis ────────────────────────────────────────────────────────

function buildApplicablePatterns(input: AdvancedInput): ApplicablePattern[] {
  const patterns: ApplicablePattern[] = []
  if (!input.activePatterns) return patterns

  for (const p of input.activePatterns) {
    const condTypes = p.conditions.map(c => c.type)
    const needsLive = condTypes.some(t => ['is_live', 'is_final_phase', 'shots_on_target_gte', 'shots_recent_gte', 'possession_gte', 'corners_gte', 'cards_gte'].includes(t))
    const needsScore = condTypes.some(t => ['score_tied', 'score_diff_lte', 'goals_total_gte', 'goals_total_lte'].includes(t))

    let readiness: ApplicablePattern['readiness'] = 'ready'
    let reason = 'Padrão será monitorado'

    if (needsLive) { readiness = 'needs_live_data'; reason = 'Requer estatísticas ao vivo' }
    else if (needsScore) { readiness = 'needs_live_data'; reason = 'Requer placar ao vivo' }

    // Pre-match compatibility hints
    if (p.name.toLowerCase().includes('over') && input.goalsProfile && input.goalsProfile.over25Pct >= 60) {
      reason = `Perfil de gols compatível (Over 2.5: ${input.goalsProfile.over25Pct}%)`
      readiness = 'ready'
    }
    if (p.name.toLowerCase().includes('cartão') && input.disciplineTrend === 'high') {
      reason = 'Tendência alta de cartões nos jogos recentes'
      readiness = 'ready'
    }

    patterns.push({ patternId: p.id, name: p.name, severity: p.severity, reason, readiness })
  }

  return patterns
}

function buildRiskFlags(input: AdvancedInput): PreMatchRiskFlag[] {
  const flags: PreMatchRiskFlag[] = []

  if (input.goalsProfile) {
    if (input.goalsProfile.avgGoalsPerMatch >= 3) flags.push({ label: 'Jogo com tendência a muitos gols', detail: `Média ${input.goalsProfile.avgGoalsPerMatch} gols/jogo`, severity: 'info' })
    if (input.goalsProfile.bothScoredPct >= 70) flags.push({ label: 'Ambos marcam frequentemente', detail: `${input.goalsProfile.bothScoredPct}% dos jogos recentes`, severity: 'info' })
  }

  if (input.homeForm) {
    const homeWinRate = input.homeForm.summary.wins / Math.max(input.homeForm.matches.length, 1)
    const homeAtHomeMatches = input.homeForm.matches.filter(m => m.wasHome).length
    if (homeWinRate >= 0.8 && homeAtHomeMatches >= 2) flags.push({ label: 'Mandante em grande fase', detail: `${input.homeForm.summary.wins} vitórias recentes`, severity: 'attention' })
  }

  if (input.awayForm) {
    const awayLossRate = input.awayForm.summary.goalsAgainst / Math.max(input.awayForm.matches.length, 1)
    if (awayLossRate >= 2) flags.push({ label: 'Visitante sofre muitos gols', detail: `Média ${awayLossRate.toFixed(1)} gols sofridos/jogo`, severity: 'attention' })
  }

  if (input.disciplineTrend === 'high') flags.push({ label: 'Disciplina alta', detail: 'Muitos cartões nos jogos recentes', severity: 'info' })

  return flags.slice(0, 4)
}

// Re-export for panel usage
export type { PreMatchAdvancedResult as AdvancedResult }
