import type { VercelRequest, VercelResponse } from '@vercel/node';



export default async function handler(req: VercelRequest, res: VercelResponse) {
  const API_KEY = process.env.API_FOOTBALL_KEY
  const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"

  if (!API_KEY) {
    return res.status(500).json({ ok: false, code: "API_FOOTBALL_KEY_MISSING" })
  }

  const date = (req.query.date as string || '')
  const league = (req.query.league as string || '')
  const season = (req.query.season as string || '')

  let endpoint = `${BASE}/fixtures?`
  if (date) endpoint += `date=${date}&`
  if (league) endpoint += `league=${league}&`
  if (season) endpoint += `season=${season}&`

  try {
    const resp = await fetch(endpoint, { headers: { "x-apisports-key": API_KEY } })
    const data = await resp.json()

    return res.status(200).json({
      ok: true,
      source: "api_football",
      fetchedAt: new Date().toISOString(),
      response: data.response || [],
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message })
  }
}
