import type { Context } from "@netlify/functions"

export default async (req: Request, _context: Context) => {
  const API_KEY = process.env.FOOTBALL_DATA_API_KEY
  const BASE = process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4"

  if (!API_KEY) {
    return Response.json({ ok: false, code: "FOOTBALL_DATA_KEY_MISSING" }, { status: 500 })
  }

  const url = new URL(req.url)
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0]

  try {
    const res = await fetch(`${BASE}/matches?date=${date}`, {
      headers: { "X-Auth-Token": API_KEY },
    })
    const data = await res.json()

    return Response.json({
      ok: true,
      source: "football_data",
      fetchedAt: new Date().toISOString(),
      matches: data.matches || [],
    })
  } catch (err: any) {
    return Response.json({ ok: false, message: err.message }, { status: 500 })
  }
}
