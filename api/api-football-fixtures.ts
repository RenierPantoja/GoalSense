import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const API_KEY = process.env.API_FOOTBALL_KEY
    const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"

    if (!API_KEY) {
      return res.status(500).json({ ok: false, code: "API_FOOTBALL_KEY_MISSING" })
    }

    const getQ = (key: string) => { const v = req.query[key]; return Array.isArray(v) ? v[0] || '' : v || ''; }

    const date = getQ('date')
    const league = getQ('league')
    const season = getQ('season')
    const team = getQ('team')
    const last = getQ('last')
    const searchTeam = getQ('search_team')

    // Team search mode (for team ID resolution)
    if (searchTeam) {
      const resp = await fetch(`${BASE}/teams?search=${encodeURIComponent(searchTeam)}`, { headers: { "x-apisports-key": API_KEY } })
      if (!resp.ok) return res.status(502).json({ ok: false, code: "API_FOOTBALL_ERROR" })
      const data = await resp.json()
      return res.status(200).json({ ok: true, response: data.response || [] })
    }

    // Fixtures mode
    const params = new URLSearchParams()
    if (date) params.set('date', date)
    if (league) params.set('league', league)
    if (season) params.set('season', season)
    if (team) params.set('team', team)
    if (last) params.set('last', last)

    const resp = await fetch(`${BASE}/fixtures?${params.toString()}`, { headers: { "x-apisports-key": API_KEY } })
    if (!resp.ok) return res.status(502).json({ ok: false, code: "API_FOOTBALL_ERROR" })
    const data = await resp.json()

    return res.status(200).json({ ok: true, source: "api_football", fetchedAt: new Date().toISOString(), response: data.response || [] })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message })
  }
}
