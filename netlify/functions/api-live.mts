import type { Context } from "@netlify/functions"

export default async (req: Request, context: Context) => {
  const API_KEY = process.env.API_FOOTBALL_KEY
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: "API_FOOTBALL_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const res = await fetch("https://v3.football.api-sports.io/fixtures?live=all", {
      headers: { "x-apisports-key": API_KEY },
    })

    if (!res.ok) {
      const text = await res.text()
      return new Response(JSON.stringify({ error: `API-Football: ${res.status}`, details: text }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    }

    const data = await res.json()
    const fixtures = (data.response || []).map((fx: any) => ({
      id: String(fx.fixture.id),
      league: fx.league.name,
      homeTeam: fx.teams.home.name,
      awayTeam: fx.teams.away.name,
      homeScore: fx.goals.home ?? 0,
      awayScore: fx.goals.away ?? 0,
      minute: fx.fixture.status.elapsed ?? 0,
      status: fx.fixture.status.short,
    }))

    return new Response(JSON.stringify({ fixtures, count: fixtures.length }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=25" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export const config = {
  path: "/api/live",
}
