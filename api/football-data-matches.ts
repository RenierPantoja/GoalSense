import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const API_KEY = process.env.FOOTBALL_DATA_API_KEY
    const BASE = process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4"

    if (!API_KEY) {
      return res.status(500).json({ ok: false, code: "FOOTBALL_DATA_KEY_MISSING" })
    }

    const matchId = Array.isArray(req.query.matchId) ? req.query.matchId[0] : req.query.matchId || '';
    const date = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date || new Date().toISOString().split('T')[0];

    let resp: Response;
    if (matchId) {
      resp = await fetch(`${BASE}/matches/${matchId}`, { headers: { "X-Auth-Token": API_KEY } })
    } else {
      resp = await fetch(`${BASE}/matches?date=${date}`, { headers: { "X-Auth-Token": API_KEY } })
    }

    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, code: "FOOTBALL_DATA_ERROR", status: resp.status })
    }

    const data = await resp.json()
    return res.status(200).json({ ok: true, source: "football_data", fetchedAt: new Date().toISOString(), matches: data.matches || [data], match: matchId ? data : undefined })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message })
  }
}
