export interface LiveFixture {
  id: string
  league: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  minute: number
  status: string
  homeStats?: MatchStats
  awayStats?: MatchStats
}

export interface MatchStats {
  possession?: number
  shots?: number
  shotsOnTarget?: number
  corners?: number
  yellowCards?: number
  redCards?: number
}
