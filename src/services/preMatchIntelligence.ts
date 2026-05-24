/**
 * Pre-Match Intelligence V2 — comprehensive pre-match analysis.
 * Form (overall + home/away), H2H, goals profile, discipline, applicable patterns.
 * Uses API-Football with aggressive caching. Graceful fallback on quota/errors.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecentTeamMatch {
  date: string
  competition?: string
  homeTeam: string
  awayTeam: string
  homeScore?: number
  awayScore?: number
  resultForTeam: 'W' | 'D' | 'L'
  wasHome: boolean
  events?: { type: string; minute?: number }[]
}

export interface TeamFormSummary {
  teamName: string
  matches: RecentTeamMatch[]
  summary: { wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; scored: number; conceded: number; cleanSheets: number }
  formString: string
}

export interface H2HRecord { total: number; homeWins: number; awayWins: number; draws: number; homeGoals: number; awayGoals: number }
export interface RecentMeeting { date: string; competition?: string; homeTeam: string; awayTeam: string; homeScore?: number; awayScore?: number }

export interface GoalsProfile {
  avgGoalsPerMatch: number
  over15Pct: number
  over25Pct: number
  bothScoredPct: number
  homeAvgFor: number
  homeAvgAgainst: number
  awayAvgFor: number
  awayAvgAgainst: number
  sampleSize: number
}

export interface DisciplineProfile {
  homeYellowAvg: number
  awayYellowAvg: number
  homeRedTotal: number
  awayRedTotal: number
  trend: 'low' | 'moderate' | 'high' | 'unknown'
  summary: string
  limitations: string[]
}

export interface PreMatchPreview { title: string; summary: string; keyPoints: string[] }

export interface PreMatchIntelligenceResult {
  available: boolean
  status: 'rich' | 'partial' | 'basic' | 'unavailable'
  confidence: 'high' | 'medium' | 'low'
  executiveSummary: string
  homeForm?: TeamFormSummary
  awayForm?: TeamFormSummary
  homeAtHome?: TeamFormSummary
  awayAway?: TeamFormSummary
  h2h?: H2HRecord
  recentMeetings?: RecentMeeting[]
  preview?: PreMatchPreview
  goalsProfile?: GoalsProfile
  disciplineProfile?: DisciplineProfile
  dataSources: string[]
  limitations: string[]
}

interface PreMatchInput {
  homeName: string
  awayName: string
  homeId?: string | number
  awayId?: string | number
  competition?: string
  utcDate?: string
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_TTL = 6 * 3600_000

function getCacheKey(home: string, away: string): string {
  return `goalsense_prematch_v2_${home.toLowerCase().replace(/\s+/g, '_')}_${away.toLowerCase().replace(/\s+/g, '_')}`
}

function getFromCache(key: string): PreMatchIntelligenceResult | null {
  try { const raw = localStorage.getItem(key); if (!raw) return null; const { data, savedAt } = JSON.parse(raw); if (Date.now() - savedAt > CACHE_TTL) return null; return data } catch { return null }
}

function saveToCache(key: string, data: PreMatchIntelligenceResult): void {
  try { localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() })) } catch { /* */ }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function getPreMatchIntelligence(input: PreMatchInput): Promise<PreMatchIntelligenceResult> {
  const { homeName, awayName, homeId, awayId, competition } = input
  const cacheKey = getCacheKey(homeName, awayName)
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  const dataSources: string[] = []
  const limitations: string[] = []

  // Resolve IDs
  let hId = homeId ? Number(homeId) : undefined
  let aId = awayId ? Number(awayId) : undefined
  if (!hId) { try { const { resolveApiFootballTeamId } = await import('./teamIdResolver'); const r = await resolveApiFootballTeamId({ teamName: homeName, competition }); if (r.found && r.teamId) hId = r.teamId } catch {} }
  if (!aId) { try { const { resolveApiFootballTeamId } = await import('./teamIdResolver'); const r = await resolveApiFootballTeamId({ teamName: awayName, competition }); if (r.found && r.teamId) aId = r.teamId } catch {} }

  // Fetch fixtures for both teams (last 10 for home/away split)
  let homeFixtures: any[] = []
  let awayFixtures: any[] = []

  if (hId) {
    try {
      const season = new Date().getFullYear()
      const res = await fetch(`/api/api-football-fixtures?team=${hId}&last=10&season=${season}`)
      if (res.ok) { const j = await res.json(); homeFixtures = j.response || []; dataSources.push('API-Football') }
    } catch {}
  }
  if (aId) {
    try {
      const season = new Date().getFullYear()
      const res = await fetch(`/api/api-football-fixtures?team=${aId}&last=10&season=${season}`)
      if (res.ok) { const j = await res.json(); awayFixtures = j.response || [] }
    } catch {}
  }

  // Build form summaries
  const homeForm = buildFormSummary(homeFixtures, hId, homeName, 'all')
  const awayForm = buildFormSummary(awayFixtures, aId, awayName, 'all')
  const homeAtHome = buildFormSummary(homeFixtures, hId, homeName, 'home')
  const awayAway = buildFormSummary(awayFixtures, aId, awayName, 'away')

  // H2H
  let h2h: H2HRecord | undefined
  let recentMeetings: RecentMeeting[] | undefined
  if (hId && aId) {
    try {
      const res = await fetch(`/api/api-football-fixtures?h2h=${hId}-${aId}`)
      if (res.ok) {
        const j = await res.json(); const fxs = j.response || []
        if (fxs.length > 0) {
          let hW = 0, aW = 0, dr = 0, hG = 0, aG = 0
          const meetings: RecentMeeting[] = []
          for (const fx of fxs.slice(0, 10)) {
            const hs = fx.goals?.home ?? 0; const as2 = fx.goals?.away ?? 0
            const isHomeFirst = fx.teams?.home?.id === hId
            if (isHomeFirst) { hG += hs; aG += as2; if (hs > as2) hW++; else if (as2 > hs) aW++; else dr++ }
            else { hG += as2; aG += hs; if (as2 > hs) hW++; else if (hs > as2) aW++; else dr++ }
            meetings.push({ date: fx.fixture?.date || '', competition: fx.league?.name, homeTeam: fx.teams?.home?.name || '', awayTeam: fx.teams?.away?.name || '', homeScore: hs, awayScore: as2 })
          }
          h2h = { total: fxs.length, homeWins: hW, awayWins: aW, draws: dr, homeGoals: hG, awayGoals: aG }
          recentMeetings = meetings.slice(0, 5)
          if (!dataSources.includes('API-Football H2H')) dataSources.push('API-Football H2H')
        }
      }
    } catch {}
  }

  // Goals profile
  const goalsProfile = calculateGoalsProfile(homeForm, awayForm)

  // Discipline from events in fixtures
  const disciplineProfile = calculateDiscipline(homeFixtures, awayFixtures, hId, aId, homeName, awayName)

  // Limitations
  if (!homeForm) limitations.push(`Forma recente de ${homeName} indisponível`)
  if (!awayForm) limitations.push(`Forma recente de ${awayName} indisponível`)
  if (!homeAtHome || (homeAtHome.matches.length < 3)) limitations.push('Amostra casa insuficiente para o mandante')
  if (!awayAway || (awayAway.matches.length < 3)) limitations.push('Amostra fora insuficiente para o visitante')
  if (!h2h) limitations.push('Confronto direto indisponível')
  if (disciplineProfile?.limitations.length) limitations.push(...disciplineProfile.limitations)

  const hasAny = Boolean(homeForm || awayForm || h2h)
  if (!hasAny) {
    const result: PreMatchIntelligenceResult = { available: false, status: 'unavailable', confidence: 'low', executiveSummary: 'Dados pré-jogo indisponíveis.', dataSources, limitations }
    return result
  }

  const status = (homeForm && awayForm && h2h && goalsProfile) ? 'rich' : (homeForm && awayForm) ? 'partial' : 'basic'
  const confidence = status === 'rich' ? 'high' : status === 'partial' ? 'medium' : 'low'
  const preview = generatePreview(homeName, awayName, homeForm, awayForm, h2h, competition)
  const executiveSummary = preview.summary

  const result: PreMatchIntelligenceResult = { available: true, status, confidence, executiveSummary, homeForm, awayForm, homeAtHome: homeAtHome?.matches.length ? homeAtHome : undefined, awayAway: awayAway?.matches.length ? awayAway : undefined, h2h, recentMeetings, preview, goalsProfile, disciplineProfile: disciplineProfile?.trend !== 'unknown' ? disciplineProfile : undefined, dataSources, limitations }

  saveToCache(cacheKey, result)
  return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFormSummary(fixtures: any[], teamId: number | undefined, teamName: string, filter: 'all' | 'home' | 'away'): TeamFormSummary | undefined {
  if (!teamId || fixtures.length === 0) return undefined

  const filtered = fixtures.filter(fx => {
    if (filter === 'home') return fx.teams?.home?.id === teamId
    if (filter === 'away') return fx.teams?.away?.id === teamId
    return true
  }).slice(0, 5)

  if (filtered.length === 0) return undefined

  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, scored = 0, conceded = 0, cleanSheets = 0
  const matches: RecentTeamMatch[] = []

  for (const fx of filtered) {
    const hs = fx.goals?.home ?? 0; const as2 = fx.goals?.away ?? 0
    const isHome = fx.teams?.home?.id === teamId
    const gf = isHome ? hs : as2; const ga = isHome ? as2 : hs
    goalsFor += gf; goalsAgainst += ga
    if (gf > 0) scored++
    if (ga > 0) conceded++
    if (ga === 0) cleanSheets++

    let result: 'W' | 'D' | 'L' = 'D'
    if (gf > ga) { result = 'W'; wins++ } else if (ga > gf) { result = 'L'; losses++ } else { draws++ }

    // Extract events for discipline
    const events = (fx.events || []).map((e: any) => ({ type: e.type || '', minute: e.time?.elapsed }))

    matches.push({ date: fx.fixture?.date || '', competition: fx.league?.name, homeTeam: fx.teams?.home?.name || '', awayTeam: fx.teams?.away?.name || '', homeScore: hs, awayScore: as2, resultForTeam: result, wasHome: isHome, events })
  }

  return { teamName, matches, summary: { wins, draws, losses, goalsFor, goalsAgainst, scored, conceded, cleanSheets }, formString: matches.map(m => m.resultForTeam).join(' ') }
}

function calculateGoalsProfile(homeForm?: TeamFormSummary, awayForm?: TeamFormSummary): GoalsProfile | undefined {
  if (!homeForm && !awayForm) return undefined
  const allMatches: { gf: number; ga: number }[] = []
  if (homeForm) for (const m of homeForm.matches) { const isH = m.wasHome; allMatches.push({ gf: isH ? (m.homeScore ?? 0) : (m.awayScore ?? 0), ga: isH ? (m.awayScore ?? 0) : (m.homeScore ?? 0) }) }
  if (awayForm) for (const m of awayForm.matches) { const isH = m.wasHome; allMatches.push({ gf: isH ? (m.homeScore ?? 0) : (m.awayScore ?? 0), ga: isH ? (m.awayScore ?? 0) : (m.homeScore ?? 0) }) }
  if (allMatches.length === 0) return undefined

  const total = allMatches.reduce((s, m) => s + m.gf + m.ga, 0)
  const avg = total / allMatches.length
  const o15 = allMatches.filter(m => m.gf + m.ga > 1).length
  const o25 = allMatches.filter(m => m.gf + m.ga > 2).length
  const both = allMatches.filter(m => m.gf > 0 && m.ga > 0).length
  const hLen = homeForm?.matches.length || 1; const aLen = awayForm?.matches.length || 1

  return { avgGoalsPerMatch: Math.round(avg * 10) / 10, over15Pct: Math.round((o15 / allMatches.length) * 100), over25Pct: Math.round((o25 / allMatches.length) * 100), bothScoredPct: Math.round((both / allMatches.length) * 100), homeAvgFor: homeForm ? Math.round((homeForm.summary.goalsFor / hLen) * 10) / 10 : 0, homeAvgAgainst: homeForm ? Math.round((homeForm.summary.goalsAgainst / hLen) * 10) / 10 : 0, awayAvgFor: awayForm ? Math.round((awayForm.summary.goalsFor / aLen) * 10) / 10 : 0, awayAvgAgainst: awayForm ? Math.round((awayForm.summary.goalsAgainst / aLen) * 10) / 10 : 0, sampleSize: allMatches.length }
}

function calculateDiscipline(homeFixtures: any[], awayFixtures: any[], hId?: number, aId?: number, homeName?: string, awayName?: string): DisciplineProfile | undefined {
  const limitations: string[] = []
  let hYellow = 0, hRed = 0, aYellow = 0, aRed = 0, hGames = 0, aGames = 0

  for (const fx of homeFixtures.slice(0, 5)) {
    const events = fx.events || []
    if (events.length === 0) continue
    hGames++
    for (const e of events) {
      if (e.team?.id === hId) {
        if (e.type === 'Card' && e.detail === 'Yellow Card') hYellow++
        if (e.type === 'Card' && e.detail === 'Red Card') hRed++
      }
    }
  }

  for (const fx of awayFixtures.slice(0, 5)) {
    const events = fx.events || []
    if (events.length === 0) continue
    aGames++
    for (const e of events) {
      if (e.team?.id === aId) {
        if (e.type === 'Card' && e.detail === 'Yellow Card') aYellow++
        if (e.type === 'Card' && e.detail === 'Red Card') aRed++
      }
    }
  }

  if (hGames === 0 && aGames === 0) {
    limitations.push('Eventos de cartões indisponíveis nos jogos recentes')
    return { homeYellowAvg: 0, awayYellowAvg: 0, homeRedTotal: 0, awayRedTotal: 0, trend: 'unknown', summary: 'Dados de cartões indisponíveis.', limitations }
  }

  const hAvg = hGames > 0 ? Math.round((hYellow / hGames) * 10) / 10 : 0
  const aAvg = aGames > 0 ? Math.round((aYellow / aGames) * 10) / 10 : 0
  const totalAvg = (hAvg + aAvg) / 2
  const trend: 'low' | 'moderate' | 'high' = totalAvg >= 3 ? 'high' : totalAvg >= 1.5 ? 'moderate' : 'low'

  if (hGames < 3) limitations.push(`Amostra de cartões de ${homeName} limitada (${hGames} jogos com eventos)`)
  if (aGames < 3) limitations.push(`Amostra de cartões de ${awayName} limitada (${aGames} jogos com eventos)`)

  const summary = trend === 'high' ? 'Jogo com tendência a muitos cartões.' : trend === 'moderate' ? 'Disciplina moderada nos jogos recentes.' : 'Poucos cartões nos jogos recentes.'

  return { homeYellowAvg: hAvg, awayYellowAvg: aAvg, homeRedTotal: hRed, awayRedTotal: aRed, trend, summary, limitations }
}

function generatePreview(homeName: string, awayName: string, homeForm?: TeamFormSummary, awayForm?: TeamFormSummary, h2h?: H2HRecord, competition?: string): PreMatchPreview {
  const keyPoints: string[] = []
  const parts: string[] = []

  if (homeForm && awayForm) {
    parts.push(`${homeName} chega com ${homeForm.summary.wins} ${homeForm.summary.wins === 1 ? 'vitória' : 'vitórias'} nos últimos ${homeForm.matches.length} jogos, enquanto ${awayName} venceu ${awayForm.summary.wins}.`)
    keyPoints.push(`${homeName}: ${homeForm.formString.replace(/W/g, 'V').replace(/L/g, 'D').replace(/D/g, 'E')}`)
    keyPoints.push(`${awayName}: ${awayForm.formString.replace(/W/g, 'V').replace(/L/g, 'D').replace(/D/g, 'E')}`)
  } else if (homeForm) {
    parts.push(`${homeName} chega com ${homeForm.summary.wins} vitórias nos últimos ${homeForm.matches.length} jogos.`)
    keyPoints.push(`${homeName}: ${homeForm.formString.replace(/W/g, 'V').replace(/L/g, 'D').replace(/D/g, 'E')}`)
  } else if (awayForm) {
    parts.push(`${awayName} chega com ${awayForm.summary.wins} vitórias nos últimos ${awayForm.matches.length} jogos.`)
    keyPoints.push(`${awayName}: ${awayForm.formString.replace(/W/g, 'V').replace(/L/g, 'D').replace(/D/g, 'E')}`)
  }

  if (h2h && h2h.total > 0) {
    parts.push(`Nos últimos ${h2h.total} confrontos: ${h2h.homeWins}V ${h2h.draws}E ${h2h.awayWins}D.`)
    keyPoints.push(`H2H: ${h2h.homeWins}V ${h2h.draws}E ${h2h.awayWins}D`)
  }

  if (competition) keyPoints.push(competition)

  return { title: homeForm || awayForm ? 'Prévia da partida' : 'Dados limitados', summary: parts.join(' ') || 'Prévia será atualizada quando mais dados estiverem disponíveis.', keyPoints: keyPoints.slice(0, 5) }
}
