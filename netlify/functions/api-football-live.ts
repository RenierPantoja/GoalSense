import type { Context } from "@netlify/functions"

export default async (req: Request, _context: Context) => {
  const API_KEY = process.env.API_FOOTBALL_KEY
  const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"

  if (!API_KEY) {
    return Response.json(
      { ok: false, code: "API_FOOTBALL_KEY_MISSING", message: "Provider real não configurado." },
      { status: 500 }
    )
  }

  try {
    const res = await fetch(`${BASE}/fixtures?live=all`, {
      headers: { "x-apisports-key": API_KEY },
    })

    if (!res.ok) {
      return Response.json(
        { ok: false, code: "PROVIDER_ERROR", message: `API-Football retornou ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()
    const fixtures = (data.response || []).map(normalizeFixture)

    return Response.json(
      {
        ok: true,
        source: "api_football",
        fetchedAt: new Date().toISOString(),
        count: fixtures.length,
        fixtures,
        ...(fixtures.length === 0 && { message: "Nenhum jogo ao vivo encontrado agora." }),
      },
      { headers: { "Cache-Control": "public, max-age=25" } }
    )
  } catch (err: any) {
    return Response.json(
      { ok: false, code: "FETCH_ERROR", message: err.message },
      { status: 500 }
    )
  }
}

function normalizeFixture(raw: any) {
  return {
    id: raw.fixture.id,
    provider: "api_football",
    externalId: raw.fixture.id,
    league: {
      id: raw.league.id,
      name: raw.league.name,
      logo: raw.league.logo || null,
      country: raw.league.country || "",
      season: raw.league.season,
    },
    status: {
      long: raw.fixture.status.long,
      short: raw.fixture.status.short,
      elapsed: raw.fixture.status.elapsed,
    },
    homeTeam: {
      id: raw.teams.home.id,
      name: raw.teams.home.name,
      logo: raw.teams.home.logo || null,
    },
    awayTeam: {
      id: raw.teams.away.id,
      name: raw.teams.away.name,
      logo: raw.teams.away.logo || null,
    },
    score: {
      home: raw.goals.home,
      away: raw.goals.away,
    },
    venue: raw.fixture.venue?.name || null,
    referee: raw.fixture.referee || null,
    date: raw.fixture.date,
    raw: raw.fixture.status.short,
  }
}
