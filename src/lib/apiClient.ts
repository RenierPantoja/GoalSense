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
  const raw = await fetchFunction<any>('api-football-live')

  // Netlify Function returns { ok, fixtures }
  // Dev proxy returns raw API-Football { response: [...] }
  if (raw.fixtures) {
    return raw as LiveResponse
  }

  // Raw API-Football response — normalize client-side in dev
  const fixtures: LiveFixture[] = (raw.response || []).map((item: any) => ({
    id: item.fixture.id,
    provider: 'api_football',
    externalId: item.fixture.id,
    league: {
      id: item.league.id,
      name: item.league.name,
      logo: item.league.logo || null,
      country: item.league.country || '',
      season: item.league.season,
    },
    status: {
      long: item.fixture.status.long,
      short: item.fixture.status.short,
      elapsed: item.fixture.status.elapsed,
    },
    homeTeam: {
      id: item.teams.home.id,
      name: item.teams.home.name,
      logo: item.teams.home.logo || null,
    },
    awayTeam: {
      id: item.teams.away.id,
      name: item.teams.away.name,
      logo: item.teams.away.logo || null,
    },
    score: {
      home: item.goals.home,
      away: item.goals.away,
    },
    venue: item.fixture.venue?.name || null,
    referee: item.fixture.referee || null,
    date: item.fixture.date,
    raw: item.fixture.status.short,
  }))

  return {
    ok: true,
    source: 'api_football',
    fetchedAt: new Date().toISOString(),
    count: fixtures.length,
    fixtures,
  }
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
  const raw = await fetchFunction<any>(`api-football-fixture?id=${id}`)

  // Netlify Function returns normalized { ok, fixture, statistics, events }
  if (raw.fixture) {
    return raw as FixtureDetailResponse
  }

  // Raw API-Football response in dev proxy
  const item = (raw.response || [])[0]
  if (!item) {
    throw new Error('Partida não encontrada.')
  }

  const fixture: LiveFixture = {
    id: item.fixture.id,
    provider: 'api_football',
    externalId: item.fixture.id,
    league: {
      id: item.league.id,
      name: item.league.name,
      logo: item.league.logo || null,
      country: item.league.country || '',
      season: item.league.season,
    },
    status: {
      long: item.fixture.status.long,
      short: item.fixture.status.short,
      elapsed: item.fixture.status.elapsed,
    },
    homeTeam: { id: item.teams.home.id, name: item.teams.home.name, logo: item.teams.home.logo || null },
    awayTeam: { id: item.teams.away.id, name: item.teams.away.name, logo: item.teams.away.logo || null },
    score: { home: item.goals.home, away: item.goals.away },
    venue: item.fixture.venue?.name || null,
    referee: item.fixture.referee || null,
    date: item.fixture.date,
    raw: item.fixture.status.short,
  }

  return {
    ok: true,
    source: 'api_football',
    fixture,
    statistics: [],
    events: (item.events || []).map((e: any) => ({
      time: e.time,
      team: { id: e.team.id, name: e.team.name, logo: e.team.logo },
      player: e.player,
      assist: e.assist,
      type: e.type,
      detail: e.detail,
    })),
    unavailable: { statistics: true, events: (item.events || []).length === 0, lineups: true },
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
