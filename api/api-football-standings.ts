import type { VercelRequest, VercelResponse } from '@vercel/node';



export default async function handler(req: VercelRequest, res: VercelResponse) {
  const API_KEY = process.env.API_FOOTBALL_KEY
  const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"

  if (!API_KEY) {
    return res.status(500).json({ ok: false, code: "API_FOOTBALL_KEY_MISSING" })
  }

  const url = new URL(req.url)
  const league = (req.query.league as string || '')
  const season = (req.query.season as string || '') || new Date().getFullYear().toString()

  if (!league) {
    return res.status(400).json({ ok: false, code: "MISSING_LEAGUE" })
  }

  try {
    const res = await fetch(`${BASE}/standings?league=${league}&season=${season}`, {
      headers: { "x-apisports-key": API_KEY },
    })
    const data = await res.json()

    return res.status(200).json({
      ok: true,
      source: "api_football",
      fetchedAt: new Date().toISOString(),
      response: data.response || [],
    }, { headers: { "Cache-Control": "public, max-age=600" } })
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message })
  }
}
