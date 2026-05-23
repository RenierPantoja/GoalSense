export interface TeamInfo {
  id: number
  name: string
  logo: string | null
}

export interface FixtureScore {
  home: number | null
  away: number | null
}

export interface Fixture {
  id: number
  externalId: number
  leagueId: number
  leagueName: string
  leagueLogo: string | null
  country: string
  status: string
  minute: number | null
  elapsed: number | null
  homeTeam: TeamInfo
  awayTeam: TeamInfo
  score: FixtureScore
  goals: FixtureScore
  venue: string | null
  referee: string | null
  rawStatus: string
  date: string
}

export interface FixtureStatistic {
  type: string
  home: number | string | null
  away: number | string | null
}

export interface FixtureEvent {
  time: { elapsed: number; extra: number | null }
  team: TeamInfo
  player: { id: number; name: string }
  assist: { id: number | null; name: string | null }
  type: string
  detail: string
}

export interface FixtureDetails extends Fixture {
  statistics: FixtureStatistic[]
  events: FixtureEvent[]
}
