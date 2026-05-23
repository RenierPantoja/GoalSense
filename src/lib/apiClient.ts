const BASE = '/.netlify/functions'

interface ApiResponse<T> {
  ok: boolean
  code?: string
  message?: string
  data?: T
}

async function fetchFunction<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`)
  const json = await res.json()

  if (!json.ok && json.code) {
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
  venue: string | null
  referee: string | null
  date: string
  raw: string
}

interface LiveResponse {
  ok: boolean
  source: string
  fetchedAt: string
  count: number
  fixtures: LiveFixture[]
  message?: string
}

export async function getLiveFixtures(): Promise<LiveResponse> {
  return fetchFunction<LiveResponse>('api-football-live')
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
  return fetchFunction<FixtureDetailResponse>(`api-football-fixture?id=${id}`)
}

// Leagues
export async function getLeagues(): Promise<any> {
  return fetchFunction<any>('api-football-leagues')
}

// Fixtures by date
export async function getFixturesByDate(date: string): Promise<any> {
  return fetchFunction<any>(`api-football-fixtures?date=${date}`)
}
