import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const getQuery = (key: string): string => {
    const v = req.query[key];
    return Array.isArray(v) ? v[0] || '' : v || '';
  };
  try {
    const API_KEY = process.env.API_FOOTBALL_KEY
  const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"

  if (!API_KEY) {
    return res.status(500).json({ ok: false, code: "API_FOOTBALL_KEY_MISSING", message: "Provider real não configurado." })
  }

  const id = getQuery('id')
  if (!id) {
    return res.status(400).json({ ok: false, code: "MISSING_ID", message: "Parâmetro id obrigatório." })
  }

  try {
    // Fetch fixture, statistics, events in parallel
    const [fixtureRes, statsRes, eventsRes] = await Promise.all([
      fetch(`${BASE}/fixtures?id=${id}`, { headers: { "x-apisports-key": API_KEY } }),
      fetch(`${BASE}/fixtures/statistics?fixture=${id}`, { headers: { "x-apisports-key": API_KEY } }),
      fetch(`${BASE}/fixtures/events?fixture=${id}`, { headers: { "x-apisports-key": API_KEY } }),
    ])

    const fixtureData = await fixtureRes.json()
    const statsData = await statsRes.json()
    const eventsData = await eventsRes.json()

    const raw = fixtureData.response?.[0]
    if (!raw) {
      return res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Fixture não encontrada." })
    }

    const homeStats = statsData.response?.[0]?.statistics || []
    const awayStats = statsData.response?.[1]?.statistics || []

    const statistics = homeStats.map((s: any, i: number) => ({
      type: s.type,
      home: s.value,
      away: awayStats[i]?.value ?? null,
    }))

    const events = (eventsData.response || []).map((e: any) => ({
      time: e.time,
      team: { id: e.team.id, name: e.team.name, logo: e.team.logo },
      player: e.player,
      assist: e.assist,
      type: e.type,
      detail: e.detail,
    }))

    return res.status(500).json({
      ok: true,
      source: "api_football",
      fetchedAt: new Date().toISOString(),
      fixture: {
        id: raw.fixture.id,
        league: { id: raw.league.id, name: raw.league.name, logo: raw.league.logo, country: raw.league.country },
        status: { long: raw.fixture.status.long, short: raw.fixture.status.short, elapsed: raw.fixture.status.elapsed },
        homeTeam: { id: raw.teams.home.id, name: raw.teams.home.name, logo: raw.teams.home.logo },
        awayTeam: { id: raw.teams.away.id, name: raw.teams.away.name, logo: raw.teams.away.logo },
        score: { home: raw.goals.home, away: raw.goals.away },
        venue: raw.fixture.venue?.name || null,
        referee: raw.fixture.referee || null,
        date: raw.fixture.date,
      },
      statistics,
      events,
      unavailable: {
        statistics: statistics.length === 0,
        events: events.length === 0,
        lineups: true,
      },
    })
  } catch (err: any) {
    return res.status(200).json({ ok: false, code: "FETCH_ERROR", message: err.message })
  }
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
