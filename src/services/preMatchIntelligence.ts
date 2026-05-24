/**
 * Pre-Match Intelligence service.
 * Fetches H2H, recent form, and generates preview from real data.
 * Uses API-Football when available, with local cache.
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
}

export interface TeamRecentForm {
  teamName: string
  matches: RecentTeamMatch[]
  summary: { wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number }
  formString: string
}

export interface H2HRecord {
  total: number
  homeWins: number
  awayWins: number
  draws: number
  homeGoals: number
  awayGoals: number
}

export interface RecentMeeting {
  date: string
  competition?: string
  homeTeam: string
  awayTeam: string
  homeScore?: number
  awayScore?: number
}

export interface PreMatchPreview {
  title: string
  summary: string
  keyPoints: string[]
}

export interface PreMatchIntelligenceResult {
  available: boolean
  confidence: 'high' | 'medium' | 'low'
  homeForm?: TeamRecentForm
  awayForm?: TeamRecentForm
  h2h?: H2HRecord
  recentMeetings?: RecentMeeting[]
  preview?: PreMatchPreview
  goalsProfile?: GoalsProfile
  dataSources?: string[]
  limitations?: string[]
}

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

interface PreMatchInput {
  homeName: string
  awayName: string
  homeId?: string | number
  awayId?: string | number
  competition?: string
  utcDate?: string
  provider?: string
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_TTL_SCHEDULED = 6 * 3600_000
const CACHE_TTL_FINISHED = 24 * 3600_000

function getCacheKey(home: string, away: string): string {
  return `goalsense_prematch_${home.toLowerCase().replace(/\s+/g, '_')}_${away.toLowerCase().replace(/\s+/g, '_')}`
}

function getFromCache(key: string): PreMatchIntelligenceResult | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, savedAt, ttl } = JSON.parse(raw)
    if (Date.now() - savedAt > ttl) return null
    return data
  } catch { return null }
}

function saveToCache(key: string, data: PreMatchIntelligenceResult, isFinished: boolean): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now(), ttl: isFinished ? CACHE_TTL_FINISHED : CACHE_TTL_SCHEDULED }))
  } catch { /* storage full */ }
}

// ─── Main function ───────────────────────────────────────────────────────────

export async function getPreMatchIntelligence(input: PreMatchInput): Promise<PreMatchIntelligenceResult> {
  const { homeName, awayName, homeId, awayId, competition } = input
  const cacheKey = getCacheKey(homeName, awayName)

  // Check cache
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  const dataSources: string[] = []
  const limitations: string[] = []
  let homeForm: TeamRecentForm | undefined
  let awayForm: TeamRecentForm | undefined
  let h2h: H2HRecord | undefined
  let recentMeetings: RecentMeeting[] | undefined

  // Resolve team IDs if not provided
  let resolvedHomeId = homeId ? Number(homeId) : undefined
  let resolvedAwayId = awayId ? Number(awayId) : undefined

  if (!resolvedHomeId) {
    try {
      const { resolveApiFootballTeamId } = await import('./teamIdResolver')
      const result = await resolveApiFootballTeamId({ teamName: homeName, competition })
      if (result.found && result.teamId) resolvedHomeId = result.teamId
    } catch {}
  }
  if (!resolvedAwayId) {
    try {
      const { resolveApiFootballTeamId } = await import('./teamIdResolver')
      const result = await resolveApiFootballTeamId({ teamName: awayName, competition })
      if (result.found && result.teamId) resolvedAwayId = result.teamId
    } catch {}
  }

  // Try API-Football H2H if we have both team IDs
  if (resolvedHomeId && resolvedAwayId) {
    try {
      const h2hData = await fetchApiFootballH2H(resolvedHomeId, resolvedAwayId)
      if (h2hData) {
        h2h = h2hData.record
        recentMeetings = h2hData.meetings
        dataSources.push('API-Football H2H')
      }
    } catch { /* */ }
  }

  // Try API-Football team fixtures for form
  if (resolvedHomeId) {
    try {
      const form = await fetchTeamForm(resolvedHomeId, homeName)
      if (form) { homeForm = form; if (!dataSources.includes('API-Football')) dataSources.push('API-Football') }
    } catch { /* */ }
  }
  if (resolvedAwayId) {
    try {
      const form = await fetchTeamForm(resolvedAwayId, awayName)
      if (form) { awayForm = form; if (!dataSources.includes('API-Football')) dataSources.push('API-Football') }
    } catch { /* */ }
  }

  // Determine availability
  const hasAnyData = Boolean(homeForm || awayForm || h2h || recentMeetings)

  if (!hasAnyData) {
    limitations.push('Dados pré-jogo indisponíveis para esta partida')
    const result: PreMatchIntelligenceResult = { available: false, confidence: 'low', limitations, dataSources }
    return result
  }

  if (!h2h) limitations.push('Confronto direto indisponível')
  if (!homeForm && !resolvedHomeId) limitations.push(`ID de ${homeName} não resolvido com confiança`)
  else if (!homeForm) limitations.push(`Forma recente de ${homeName} indisponível`)
  if (!awayForm && !resolvedAwayId) limitations.push(`ID de ${awayName} não resolvido com confiança`)
  else if (!awayForm) limitations.push(`Forma recente de ${awayName} indisponível`)

  // Generate preview
  const preview = generatePreview(homeName, awayName, homeForm, awayForm, h2h, competition)

  // Calculate goals profile from form data
  const goalsProfile = calculateGoalsProfile(homeForm, awayForm)

  const confidence = (homeForm && awayForm && h2h) ? 'high' : (homeForm || awayForm) ? 'medium' : 'low'

  const result: PreMatchIntelligenceResult = {
    available: true,
    confidence,
    homeForm,
    awayForm,
    h2h,
    recentMeetings,
    preview,
    goalsProfile,
    dataSources,
    limitations: limitations.length > 0 ? limitations : undefined,
  }

  saveToCache(cacheKey, result, false)
  return result
}

// ─── API-Football fetchers ───────────────────────────────────────────────────

async function fetchApiFootballH2H(homeId: number, awayId: number): Promise<{ record: H2HRecord; meetings: RecentMeeting[] } | null> {
  try {
    const res = await fetch(`/api/api-football-fixture?h2h=${homeId}-${awayId}`)
    if (!res.ok) return null
    const json = await res.json()
    const fixtures = json.response || []
    if (fixtures.length === 0) return null

    let homeWins = 0, awayWins = 0, draws = 0, homeGoals = 0, awayGoals = 0
    const meetings: RecentMeeting[] = []

    for (const fx of fixtures.slice(0, 10)) {
      const hScore = fx.goals?.home ?? fx.score?.fulltime?.home ?? 0
      const aScore = fx.goals?.away ?? fx.score?.fulltime?.away ?? 0
      const hTeam = fx.teams?.home?.name || ''
      const aTeam = fx.teams?.away?.name || ''

      // Determine who is "home" in our context
      const isHomeFirst = fx.teams?.home?.id === homeId
      if (isHomeFirst) {
        homeGoals += hScore; awayGoals += aScore
        if (hScore > aScore) homeWins++
        else if (aScore > hScore) awayWins++
        else draws++
      } else {
        homeGoals += aScore; awayGoals += hScore
        if (aScore > hScore) homeWins++
        else if (hScore > aScore) awayWins++
        else draws++
      }

      meetings.push({ date: fx.fixture?.date || '', competition: fx.league?.name, homeTeam: hTeam, awayTeam: aTeam, homeScore: hScore, awayScore: aScore })
    }

    return { record: { total: fixtures.length, homeWins, awayWins, draws, homeGoals, awayGoals }, meetings: meetings.slice(0, 5) }
  } catch { return null }
}

async function fetchTeamForm(teamId: number, teamName: string): Promise<TeamRecentForm | null> {
  try {
    const season = new Date().getFullYear()
    const res = await fetch(`/api/api-football-fixtures?team=${teamId}&last=5&season=${season}`)
    if (!res.ok) return null
    const json = await res.json()
    const fixtures = json.response || []
    if (fixtures.length === 0) return null

    const matches: RecentTeamMatch[] = []
    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0

    for (const fx of fixtures) {
      const hScore = fx.goals?.home ?? 0
      const aScore = fx.goals?.away ?? 0
      const isHome = fx.teams?.home?.id === teamId
      const gf = isHome ? hScore : aScore
      const ga = isHome ? aScore : hScore
      goalsFor += gf; goalsAgainst += ga

      let result: 'W' | 'D' | 'L' = 'D'
      if (gf > ga) { result = 'W'; wins++ }
      else if (ga > gf) { result = 'L'; losses++ }
      else { draws++ }

      matches.push({
        date: fx.fixture?.date || '',
        competition: fx.league?.name,
        homeTeam: fx.teams?.home?.name || '',
        awayTeam: fx.teams?.away?.name || '',
        homeScore: hScore,
        awayScore: aScore,
        resultForTeam: result,
      })
    }

    const formString = matches.map(m => m.resultForTeam).join(' ')

    return { teamName, matches, summary: { wins, draws, losses, goalsFor, goalsAgainst }, formString }
  } catch { return null }
}

// ─── Preview generator ───────────────────────────────────────────────────────

function generatePreview(homeName: string, awayName: string, homeForm?: TeamRecentForm, awayForm?: TeamRecentForm, h2h?: H2HRecord, competition?: string): PreMatchPreview {
  const keyPoints: string[] = []
  const parts: string[] = []

  if (homeForm && awayForm) {
    const hWins = homeForm.summary.wins
    const aWins = awayForm.summary.wins
    parts.push(`${homeName} chega com ${hWins} ${hWins === 1 ? 'vitória' : 'vitórias'} nos últimos ${homeForm.matches.length} jogos, enquanto ${awayName} venceu ${aWins}.`)
    keyPoints.push(`${homeName}: ${homeForm.formString}`)
    keyPoints.push(`${awayName}: ${awayForm.formString}`)

    if (homeForm.summary.goalsFor > awayForm.summary.goalsFor) {
      keyPoints.push(`${homeName} marca mais gols recentemente`)
    } else if (awayForm.summary.goalsFor > homeForm.summary.goalsFor) {
      keyPoints.push(`${awayName} marca mais gols recentemente`)
    }
  } else if (homeForm) {
    parts.push(`${homeName} chega com ${homeForm.summary.wins} ${homeForm.summary.wins === 1 ? 'vitória' : 'vitórias'} nos últimos ${homeForm.matches.length} jogos.`)
    keyPoints.push(`${homeName}: ${homeForm.formString}`)
  } else if (awayForm) {
    parts.push(`${awayName} chega com ${awayForm.summary.wins} ${awayForm.summary.wins === 1 ? 'vitória' : 'vitórias'} nos últimos ${awayForm.matches.length} jogos.`)
    keyPoints.push(`${awayName}: ${awayForm.formString}`)
  }

  if (h2h && h2h.total > 0) {
    parts.push(`Nos últimos ${h2h.total} confrontos, ${homeName} venceu ${h2h.homeWins}, ${awayName} venceu ${h2h.awayWins} e ${h2h.draws} ${h2h.draws === 1 ? 'empate' : 'empates'}.`)
    keyPoints.push(`H2H: ${h2h.homeWins}V ${h2h.draws}E ${h2h.awayWins}D`)
  }

  if (competition) keyPoints.push(competition)

  const title = homeForm || awayForm ? 'Prévia da partida' : 'Dados pré-jogo limitados'
  const summary = parts.length > 0 ? parts.join(' ') : 'A prévia será atualizada quando mais informações estiverem disponíveis.'

  return { title, summary, keyPoints: keyPoints.slice(0, 5) }
}


// ─── Goals Profile ───────────────────────────────────────────────────────────

function calculateGoalsProfile(homeForm?: TeamRecentForm, awayForm?: TeamRecentForm): GoalsProfile | undefined {
  if (!homeForm && !awayForm) return undefined

  const allMatches: { goalsFor: number; goalsAgainst: number; isHome: boolean }[] = []

  if (homeForm) {
    for (const m of homeForm.matches) {
      const isHome = m.homeTeam.toLowerCase().includes(homeForm.teamName.toLowerCase().split(' ')[0])
      const gf = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0)
      const ga = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0)
      allMatches.push({ goalsFor: gf, goalsAgainst: ga, isHome: true })
    }
  }
  if (awayForm) {
    for (const m of awayForm.matches) {
      const isHome = m.homeTeam.toLowerCase().includes(awayForm.teamName.toLowerCase().split(' ')[0])
      const gf = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0)
      const ga = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0)
      allMatches.push({ goalsFor: gf, goalsAgainst: ga, isHome: false })
    }
  }

  if (allMatches.length === 0) return undefined

  const totalGoals = allMatches.reduce((s, m) => s + m.goalsFor + m.goalsAgainst, 0)
  const avgGoalsPerMatch = totalGoals / allMatches.length
  const over15 = allMatches.filter(m => (m.goalsFor + m.goalsAgainst) > 1.5).length
  const over25 = allMatches.filter(m => (m.goalsFor + m.goalsAgainst) > 2.5).length
  const bothScored = allMatches.filter(m => m.goalsFor > 0 && m.goalsAgainst > 0).length

  const homeMatches = homeForm?.matches || []
  const awayMatches = awayForm?.matches || []
  const homeAvgFor = homeForm ? homeForm.summary.goalsFor / Math.max(homeMatches.length, 1) : 0
  const homeAvgAgainst = homeForm ? homeForm.summary.goalsAgainst / Math.max(homeMatches.length, 1) : 0
  const awayAvgFor = awayForm ? awayForm.summary.goalsFor / Math.max(awayMatches.length, 1) : 0
  const awayAvgAgainst = awayForm ? awayForm.summary.goalsAgainst / Math.max(awayMatches.length, 1) : 0

  return {
    avgGoalsPerMatch: Math.round(avgGoalsPerMatch * 10) / 10,
    over15Pct: Math.round((over15 / allMatches.length) * 100),
    over25Pct: Math.round((over25 / allMatches.length) * 100),
    bothScoredPct: Math.round((bothScored / allMatches.length) * 100),
    homeAvgFor: Math.round(homeAvgFor * 10) / 10,
    homeAvgAgainst: Math.round(homeAvgAgainst * 10) / 10,
    awayAvgFor: Math.round(awayAvgFor * 10) / 10,
    awayAvgAgainst: Math.round(awayAvgAgainst * 10) / 10,
    sampleSize: allMatches.length,
  }
}
