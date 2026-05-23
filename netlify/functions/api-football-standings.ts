import type { Context } from "@netlify/functions"

export default async (req: Request, _context: Context) => {
  const API_KEY = process.env.API_FOOTBALL_KEY
  const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"

  if (!API_KEY) {
    return Response.json({ ok: false, code: "API_FOOTBALL_KEY_MISSING" }, { status: 500 })
  }

  const url = new URL(req.url)
  const league = url.searchParams.get("league")
  const season = url.searchParams.get("season") || new Date().getFullYear().toString()

  if (!league) {
    return Response.json({ ok: false, code: "MISSING_LEAGUE" }, { status: 400 })
  }

  try {
    const res = await fetch(`${BASE}/standings?league=${league}&season=${season}`, {
      headers: { "x-apisports-key": API_KEY },
    })
    const data = await res.json()

    return Response.json({
      ok: true,
      source: "api_football",
      fetchedAt: new Date().toISOString(),
      response: data.response || [],
    }, { headers: { "Cache-Control": "public, max-age=600" } })
  } catch (err: any) {
    return Response.json({ ok: false, message: err.message }, { status: 500 })
  }
}
