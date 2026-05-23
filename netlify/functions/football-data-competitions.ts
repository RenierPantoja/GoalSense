import type { Context } from "@netlify/functions"

export default async (req: Request, _context: Context) => {
  const API_KEY = process.env.FOOTBALL_DATA_API_KEY
  const BASE = process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4"

  if (!API_KEY) {
    return Response.json({ ok: false, code: "FOOTBALL_DATA_KEY_MISSING" }, { status: 500 })
  }

  try {
    const res = await fetch(`${BASE}/competitions`, {
      headers: { "X-Auth-Token": API_KEY },
    })
    const data = await res.json()

    return Response.json({
      ok: true,
      source: "football_data",
      fetchedAt: new Date().toISOString(),
      competitions: data.competitions || [],
    }, { headers: { "Cache-Control": "public, max-age=3600" } })
  } catch (err: any) {
    return Response.json({ ok: false, message: err.message }, { status: 500 })
  }
}
