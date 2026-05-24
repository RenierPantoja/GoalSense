import type { VercelRequest, VercelResponse } from '@vercel/node';



export default async function handler(req: VercelRequest, res: VercelResponse) {
  const API_KEY = process.env.FOOTBALL_DATA_API_KEY
  const BASE = process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4"

  if (!API_KEY) {
    return res.status(500).json({ ok: false, code: "FOOTBALL_DATA_KEY_MISSING" })
  }

  const url = new URL(req.url)
  const matchId = (req.query.matchId as string || '')
  const date = (req.query.date as string || '') || new Date().toISOString().split("T")[0]

  try {
    // Single match detail
    if (matchId) {
      const res = await fetch(`${BASE}/matches/${matchId}`, {
        headers: { "X-Auth-Token": API_KEY },
      })
      const data = await res.json()
      return res.status(200).json({ ok: true, source: "football_data", match: data })
    }

    // List matches by date
    const res = await fetch(`${BASE}/matches?date=${date}`, {
      headers: { "X-Auth-Token": API_KEY },
    })
    const data = await res.json()

    return res.status(200).json({
      ok: true,
      source: "football_data",
      fetchedAt: new Date().toISOString(),
      matches: data.matches || [],
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message })
  }
}
