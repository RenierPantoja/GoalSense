import { teamsAreSame } from '@/features/providers/teamNameNormalizer'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { reconcileAllFixtureScores, reconcileAllPenaltyScores } from './liveScoreCache'
import { fetchFootballDataMatches } from './footballDataClient'

// BASE moved to apiPath
const BASE = ''

interface ApiResponse<T> {
  ok: boolean
  code?: string
  message?: string
  data?: T
}

async function fetchFunction<T>(path: string): Promise<T> {
  const res = await fetch(`/api/${path}`, { cache: 'no-store' })
  const json = await res.json()

  if (!json.ok && json.code) {
    if (json.code === 'ALL_KEYS_EXHAUSTED') {
      throw new Error('Todas as chaves atingiram o limite diário. Reseta à meia-noite UTC.')
    }
    throw new Error(json.message || `Erro: ${json.code}`)
  }

  return json
}

// Live fixtures
export interface LiveFixture {
  id: number
  provider: string
  externalId: number
  league: {
    id: number
    name: string
    logo: string | null
    country: string
    season: number
  }
  status: {
    long: string
    short: string
    elapsed: number | null
  }
  homeTeam: {
    id: number
    name: string
    logo: string | null
  }
  awayTeam: {
    id: number
    name: string
    logo: string | null
  }
  score: {
    home: number | null
    away: number | null
  }
  /** V14: Penalty shootout score — only present when provider delivers it. */
  penaltyScore?: {
    home: number | null
    away: number | null
  }
  venue: string | null
  referee: string | null
  date: string
  raw: string
  /** V15: Source metadata for score/status debugging. */
  _scoreSource?: string
}

interface LiveResponse {
  ok: boolean
  source: string
  fetchedAt: string
  count: number
  fixtures: LiveFixture[]
  message?: string
  liveCount?: number
}

// --- V13: Fixture deduplication helpers ---

/** Status advancement score — higher = more advanced in the match lifecycle. */
function getFixtureStatusScore(fx: LiveFixture): number {
  const s = fx.status.short?.toUpperCase() || ''
  if (s === 'FT' || s === 'AET' || s === 'PEN') return 100
  if (s === 'ET' || s === 'BT' || s === 'P') return 90
  if (s === '2H' || s === 'LIVE') return 80
  if (s === 'HT') return 70
  if (s === '1H') return 60
  if (s === 'NS' || s === 'TBD') return 10
  return 50
}

/** Pick the best fixture when two represent the same match. */
function pickBestFixture(a: LiveFixture, b: LiveFixture): LiveFixture {
  const scoreA = getFixtureStatusScore(a)
  const scoreB = getFixtureStatusScore(b)

  // More advanced status wins
  if (scoreA !== scoreB) {
    const winner = scoreA > scoreB ? a : b
    const loser = scoreA > scoreB ? b : a
    // Preserve penaltyScore from loser if winner doesn't have it
    if (!winner.penaltyScore && loser.penaltyScore) {
      winner.penaltyScore = loser.penaltyScore
    }
    // Tag source if winner is from a different provider
    if (winner.provider !== loser.provider) {
      winner._scoreSource = `${winner.provider} (won by status over ${loser.provider})`
    }
    return winner
  }

  // Same status: higher minute wins
  const minA = a.status.elapsed || 0
  const minB = b.status.elapsed || 0
  if (minA !== minB) {
    const winner = minA > minB ? a : b
    const loser = minA > minB ? b : a
    if (!winner.penaltyScore && loser.penaltyScore) {
      winner.penaltyScore = loser.penaltyScore
    }
    if (winner.provider !== loser.provider) {
      winner._scoreSource = `${winner.provider} (won by minute over ${loser.provider})`
    }
    return winner
  }

  // Same minute: prefer the one with penalty score or logo
  if (a.penaltyScore && !b.penaltyScore) return a
  if (b.penaltyScore && !a.penaltyScore) return b
  if (a.homeTeam.logo && !b.homeTeam.logo) return a
  if (b.homeTeam.logo && !a.homeTeam.logo) return b

  // Default: keep first
  return a
}

/** Dedup within a single provider's fixtures (ESPN can return same match from multiple league feeds). */
function deduplicateIntraProvider(fixtures: LiveFixture[]): LiveFixture[] {
  if (fixtures.length <= 1) return fixtures
  const seen = new Map<string, LiveFixture>()
  for (const fx of fixtures) {
    const key = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, fx)
    } else {
      // Keep the better version
      seen.set(key, pickBestFixture(existing, fx))
    }
  }
  return Array.from(seen.values())
}

/** Final dedup pass on the fully merged array — catches cross-provider duplicates that slipped through canonical ID differences (e.g., date timezone edge cases). */
function finalDeduplicateFixtures(fixtures: LiveFixture[]): LiveFixture[] {
  if (fixtures.length <= 1) return fixtures
  const result: LiveFixture[] = []
  const consumed = new Set<number>()

  for (let i = 0; i < fixtures.length; i++) {
    if (consumed.has(i)) continue
    let best = fixtures[i]

    for (let j = i + 1; j < fixtures.length; j++) {
      if (consumed.has(j)) continue
      const candidate = fixtures[j]

      // Check if same match using team name similarity
      if (teamsAreSame(best.homeTeam.name, candidate.homeTeam.name) &&
          teamsAreSame(best.awayTeam.name, candidate.awayTeam.name)) {
        // Same match — pick the best version
        best = pickBestFixture(best, candidate)
        consumed.add(j)
      }
    }

    result.push(best)
  }

  return result
}

export async function getLiveFixtures(): Promise<LiveResponse> {
  // Fetch ESPN, football-data.org, and API-Football in parallel
  const [espnResult, fdResult, afResult] = await Promise.allSettled([
    fetchEspnLive(),
    fetchFootballDataLive(),
    fetchApiFootballLive(),
  ])

  const espnFixtures = espnResult.status === 'fulfilled' ? espnResult.value.fixtures : []
  const fdFixtures = fdResult.status === 'fulfilled' ? fdResult.value : []
  const afFixtures = afResult.status === 'fulfilled' ? afResult.value : []

  // V13: Intra-provider dedup for ESPN (ESPN /all/scoreboard can return same match from multiple league feeds)
  const dedupedEspn = deduplicateIntraProvider(espnFixtures)

  // Dedup using canonical match IDs and team name similarity
  // Priority: ESPN first (best logos, reliable), then football-data (Brazilian calendar), then API-Football (stats but no logos)
  const canonicalMap = new Map<string, LiveFixture>()
  const merged: LiveFixture[] = []

  // ESPN first (best logos and event IDs)
  for (const fx of dedupedEspn) {
    const canonical = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
    canonicalMap.set(canonical, fx)
    merged.push(fx)
  }

  // football-data.org second (Brazilian fixtures with crests)
  for (const fx of fdFixtures) {
    const canonical = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
    if (canonicalMap.has(canonical)) continue
    let isDuplicate = false
    for (const existing of merged) {
      if (teamsAreSame(fx.homeTeam.name, existing.homeTeam.name) && teamsAreSame(fx.awayTeam.name, existing.awayTeam.name)) { isDuplicate = true; break }
    }
    if (!isDuplicate) { canonicalMap.set(canonical, fx); merged.push(fx) }
  }

  // API-Football third (fills remaining gaps — logos stripped since domain is down)
  for (const fx of afFixtures) {
    const canonical = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
    if (canonicalMap.has(canonical)) continue
    let isDuplicate = false
    for (const existing of merged) {
      if (teamsAreSame(fx.homeTeam.name, existing.homeTeam.name) && teamsAreSame(fx.awayTeam.name, existing.awayTeam.name)) {
        // API-Football is duplicate but might have better status/score — update score if live
        if (fx.status.elapsed && !existing.status.elapsed) {
          existing.status.elapsed = fx.status.elapsed
        }
        if (fx.score.home !== null && fx.score.away !== null) {
          existing.score = fx.score
        }
        isDuplicate = true
        break
      }
    }
    if (!isDuplicate) {
      // Try to get logo from football-data fixtures if available
      for (const fd of fdFixtures) {
        if (teamsAreSame(fx.homeTeam.name, fd.homeTeam.name) && teamsAreSame(fx.awayTeam.name, fd.awayTeam.name)) {
          if (!fx.homeTeam.logo && fd.homeTeam.logo) fx.homeTeam.logo = fd.homeTeam.logo
          if (!fx.awayTeam.logo && fd.awayTeam.logo) fx.awayTeam.logo = fd.awayTeam.logo
          break
        }
      }
      canonicalMap.set(canonical, fx)
      merged.push(fx)
    }
  }

  if (merged.length > 0) {
    // V13: Final dedup pass — catches any remaining duplicates that slipped through
    // (e.g., same match with slightly different dates across providers)
    const finalDeduped = finalDeduplicateFixtures(merged)
    // V14: Reconcile scores with canonical score cache (events may be ahead of scoreboard)
    reconcileAllFixtureScores(finalDeduped)
    // V15: Reconcile penalty scores with penalty cache
    reconcileAllPenaltyScores(finalDeduped)
    return { ok: true, source: 'fusion', fetchedAt: new Date().toISOString(), count: finalDeduped.length, fixtures: finalDeduped }
  }

  return { ok: true, source: 'combined', fetchedAt: new Date().toISOString(), count: 0, fixtures: [] }
}

function normalizeApiFootball(item: any): LiveFixture {
  // API-Football logos use media.api-sports.io which may be unreachable
  // Filter out unreliable logo URLs
  const sanitizeLogo = (url: string | null): string | null => {
    if (!url) return null
    if (url.includes('media.api-sports.io')) return null // Domain often unreachable
    return url
  }

  return {
    id: item.fixture.id,
    provider: 'api_football',
    externalId: item.fixture.id,
    league: { id: item.league.id, name: item.league.name, logo: sanitizeLogo(item.league.logo), country: item.league.country || '', season: item.league.season },
    status: { long: item.fixture.status.long, short: item.fixture.status.short, elapsed: item.fixture.status.elapsed },
    homeTeam: { id: item.teams.home.id, name: item.teams.home.name, logo: sanitizeLogo(item.teams.home.logo) },
    awayTeam: { id: item.teams.away.id, name: item.teams.away.name, logo: sanitizeLogo(item.teams.away.logo) },
    score: { home: item.goals.home, away: item.goals.away },
    venue: item.fixture.venue?.name || null, referee: item.fixture.referee || null,
    date: item.fixture.date, raw: item.fixture.status.short,
  }
}

// football-data.org live matches
async function fetchFootballDataLive(): Promise<LiveFixture[]> {
  // Fetch today and tomorrow (handles UTC timezone edge cases for Brazilian games).
  // Routed through the throttled client to avoid 429 storms (shared cache + dedup).
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  const [todayData, tomorrowData] = await Promise.all([
    fetchFootballDataMatches(),
    fetchFootballDataMatches(`date=${tomorrow}`),
  ])

  const matchesToday = todayData?.matches || []
  const matchesTomorrow = tomorrowData?.matches || []
  const allMatches = [...matchesToday, ...matchesTomorrow]

  // Filter in-play matches
  const live = allMatches.filter((m: any) => m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'LIVE')

  return live.map((m: any): LiveFixture => ({
    id: m.id,
    provider: 'football_data',
    externalId: m.id,
    league: {
      id: m.competition?.id || 0,
      name: m.competition?.name || '',
      logo: m.competition?.emblem || null,
      country: m.area?.name || '',
      season: 2026,
    },
    status: {
      long: m.status === 'IN_PLAY' ? 'Ao vivo' : 'Intervalo',
      short: m.status === 'IN_PLAY' ? 'LIVE' : 'HT',
      elapsed: null,
    },
    homeTeam: {
      id: m.homeTeam?.id || 0,
      name: m.homeTeam?.shortName || m.homeTeam?.name || '',
      logo: m.homeTeam?.crest || null,
    },
    awayTeam: {
      id: m.awayTeam?.id || 0,
      name: m.awayTeam?.shortName || m.awayTeam?.name || '',
      logo: m.awayTeam?.crest || null,
    },
    score: {
      home: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
      away: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
    },
    venue: null,
    referee: null,
    date: m.utcDate || '',
    raw: m.status,
  }))
}

// API-Football live (Brazilian league stats)
async function fetchApiFootballLive(): Promise<LiveFixture[]> {
  try {
    const res = await fetch('/api/api-football-live', { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    if (json.errors && typeof json.errors === 'object' && Object.keys(json.errors).length > 0) return []
    const response = json.response || []
    return response.map(normalizeApiFootball)
  } catch { return [] }
}

// ESPN normalizer for client-side (dev proxy returns raw ESPN data)
async function fetchEspnLive(): Promise<LiveResponse> {
  const res = await fetch('/api/espn-live', { cache: 'no-store' })
  const raw = await res.json()

  // Netlify Function format
  if (raw.ok && raw.fixtures) {
    return {
      ok: true,
      source: 'espn',
      fetchedAt: raw.fetchedAt || new Date().toISOString(),
      count: raw.count || 0,
      fixtures: raw.fixtures,
    }
  }

  // Raw ESPN scoreboard (dev proxy)
  if (raw.events) {
    const fixtures: LiveFixture[] = raw.events
      .map((event: any) => {
        const comp = event.competitions?.[0]
        const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
        const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
        const elapsed = event.status?.displayClock?.match(/(\d+)/)?.[1]
        const state = event.status?.type?.state // 'pre', 'in', 'post'

        return {
          id: parseInt(event.id) || 0,
          provider: 'espn',
          externalId: parseInt(event.id) || 0,
          league: {
            id: event.season?.type || 0,
            name: extractLeagueName(event),
            logo: null,
            country: '',
            season: event.season?.year || 2026,
          },
          status: {
            long: event.status?.type?.description || '',
            short: state === 'in' ? 'LIVE' : state === 'post' ? 'FT' : 'NS',
            elapsed: elapsed ? parseInt(elapsed) : null,
          },
          homeTeam: {
            id: parseInt(home?.team?.id) || 0,
            name: home?.team?.displayName || 'Home',
            logo: home?.team?.logo || null,
          },
          awayTeam: {
            id: parseInt(away?.team?.id) || 0,
            name: away?.team?.displayName || 'Away',
            logo: away?.team?.logo || null,
          },
          score: {
            home: parseInt(home?.score) || 0,
            away: parseInt(away?.score) || 0,
          },
          venue: comp?.venue?.fullName || null,
          referee: null,
          date: event.date,
          raw: event.status?.type?.name || '',
          _state: state,
        }
      })

    // Return ALL fixtures - LiveRadarPage filters live vs upcoming
    return {
      ok: true,
      source: 'espn',
      fetchedAt: new Date().toISOString(),
      count: fixtures.length,
      fixtures,
    }
  }

  throw new Error('ESPN: formato de resposta inesperado')
}

function extractLeagueName(event: any): string {
  const slug = event.season?.slug || ''
  return slug
    .replace(/^\d{4}-\d{2}-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Liga'
}

function mapEspnStatusShort(name: string): string {
  if (!name) return 'NS'
  if (name === 'STATUS_IN_PROGRESS' || name === 'STATUS_FIRST_HALF' || name === 'STATUS_SECOND_HALF') return 'LIVE'
  if (name === 'STATUS_HALFTIME' || name === 'STATUS_END_PERIOD') return 'HT'
  if (name === 'STATUS_FULL_TIME') return 'FT'
  if (name === 'STATUS_SCHEDULED') return 'NS'
  return 'NS'
}

// Fixture detail
export interface FixtureStatistic {
  type: string
  home: string | number | null
  away: string | number | null
}

export interface FixtureEvent {
  time: { elapsed: number; extra: number | null }
  team: { id: number; name: string; logo: string | null }
  player: { id: number; name: string }
  assist: { id: number | null; name: string | null }
  type: string
  detail: string
}

interface FixtureDetailResponse {
  ok: boolean
  source: string
  fixture: LiveFixture
  statistics: FixtureStatistic[]
  events: FixtureEvent[]
  unavailable: {
    statistics: boolean
    events: boolean
    lineups: boolean
  }
}

export async function getFixtureDetails(id: number): Promise<FixtureDetailResponse> {
  // Try ESPN summary first (works for ESPN fixture IDs, free, no key)
  try {
    const espnRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${id}`)
    if (espnRes.ok) {
      const espn = await espnRes.json()
      if (espn.boxscore || espn.header) {
        return normalizeEspnDetail(espn, id)
      }
    }
  } catch {
    // ESPN failed, try API-Football
  }

  // API-Football fallback
  try {
    const raw = await fetchFunction<any>(`api-football-fixture?id=${id}`)
    if (raw.fixture) return raw as FixtureDetailResponse
    const item = (raw.response || [])[0]
    if (item) {
      return {
        ok: true, source: 'api_football',
        fixture: {
          id: item.fixture.id, provider: 'api_football', externalId: item.fixture.id,
          league: { id: item.league.id, name: item.league.name, logo: item.league.logo || null, country: item.league.country || '', season: item.league.season },
          status: { long: item.fixture.status.long, short: item.fixture.status.short, elapsed: item.fixture.status.elapsed },
          homeTeam: { id: item.teams.home.id, name: item.teams.home.name, logo: item.teams.home.logo || null },
          awayTeam: { id: item.teams.away.id, name: item.teams.away.name, logo: item.teams.away.logo || null },
          score: { home: item.goals.home, away: item.goals.away },
          venue: item.fixture.venue?.name || null, referee: item.fixture.referee || null,
          date: item.fixture.date, raw: item.fixture.status.short,
        },
        statistics: [], events: [],
        unavailable: { statistics: true, events: true, lineups: true },
      }
    }
  } catch {
    // Both failed
  }

  throw new Error('Não foi possível carregar dados desta partida.')
}

function normalizeEspnDetail(espn: any, id: number): FixtureDetailResponse {
  const comp = espn.header?.competitions?.[0]
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
  const elapsed = comp?.status?.displayClock?.match(/(\d+)/)?.[1]

  const fixture: LiveFixture = {
    id, provider: 'espn', externalId: id,
    league: { id: 0, name: espn.header?.league?.name || '', logo: espn.header?.league?.logos?.[0]?.href || null, country: '', season: 2026 },
    status: { long: comp?.status?.type?.description || '', short: comp?.status?.type?.state === 'in' ? 'LIVE' : comp?.status?.type?.state === 'post' ? 'FT' : 'NS', elapsed: elapsed ? parseInt(elapsed) : null },
    homeTeam: { id: parseInt(home?.id) || 0, name: home?.team?.displayName || '', logo: home?.team?.logos?.[0]?.href || home?.team?.logo || null },
    awayTeam: { id: parseInt(away?.id) || 0, name: away?.team?.displayName || '', logo: away?.team?.logos?.[0]?.href || away?.team?.logo || null },
    score: { home: parseInt(home?.score) || 0, away: parseInt(away?.score) || 0 },
    venue: espn.gameInfo?.venue?.fullName || null, referee: null,
    date: comp?.date || '', raw: comp?.status?.type?.name || '',
  }

  // Stats from boxscore
  const homeBoxStats = espn.boxscore?.teams?.[0]?.statistics || []
  const awayBoxStats = espn.boxscore?.teams?.[1]?.statistics || []
  const statistics: FixtureStatistic[] = homeBoxStats.map((s: any, i: number) => ({
    type: s.label || s.name || `stat_${i}`,
    home: s.displayValue,
    away: awayBoxStats[i]?.displayValue ?? null,
  }))

  // Events
  const events: FixtureEvent[] = (espn.keyEvents || espn.commentary || []).slice(0, 30).map((ev: any) => ({
    time: { elapsed: parseInt(ev.clock?.displayValue || '0') || 0, extra: null },
    team: { id: 0, name: ev.team?.displayName || '', logo: null },
    player: { id: 0, name: ev.athletesInvolved?.[0]?.displayName || ev.text || '' },
    assist: { id: null, name: null },
    type: ev.type?.text || 'Event',
    detail: ev.shortText || ev.text || '',
  }))

  return {
    ok: true, source: 'espn', fixture, statistics, events,
    unavailable: { statistics: statistics.length === 0, events: events.length === 0, lineups: true },
  }
}

// Leagues
export async function getLeagues(): Promise<any> {
  return fetchFunction<any>('api-football-leagues')
}

// Fixtures by date
export async function getFixturesByDate(date: string): Promise<any> {
  return fetchFunction<any>(`api-football-fixtures?date=${date}`)
}
