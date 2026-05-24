import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"
    const keys = (process.env.API_FOOTBALL_KEYS || process.env.API_FOOTBALL_KEY || '').split(',').filter(Boolean)
    const apiKey = keys[0]?.trim()

    if (!apiKey) {
      return res.status(500).json({ ok: false, code: "API_FOOTBALL_KEY_MISSING" })
    }

    // Build query params from request
    const params = new URLSearchParams()
    const { date, team, last, season, league, h2h, search_team } = req.query

    // Team search endpoint
    if (search_team) {
      const term = String(search_team)
      // Try search first, then name exact match
      let searchResp = await fetch(`${BASE}/teams?search=${encodeURIComponent(term)}`, {
        headers: { "x-apisports-key": apiKey },
      })
      let searchData = searchResp.ok ? await searchResp.json() : { response: [] }
      
      // If search returned nothing, try with name parameter
      if ((!searchData.response || searchData.response.length === 0) && term.length >= 3) {
        searchResp = await fetch(`${BASE}/teams?name=${encodeURIComponent(term)}`, {
          headers: { "x-apisports-key": apiKey },
        })
        searchData = searchResp.ok ? await searchResp.json() : { response: [] }
      }
      
      return res.status(200).json({ ok: true, response: searchData.response || [] })
    }

    if (h2h) params.set('h2h', String(h2h))
    else {
      if (date) params.set('date', String(date))
      if (team) params.set('team', String(team))
      if (last) params.set('last', String(last))
      if (season) params.set('season', String(season))
      if (league) params.set('league', String(league))
    }

    const endpoint = h2h ? 'fixtures/headtohead' : 'fixtures'
    const resp = await fetch(`${BASE}/${endpoint}?${params.toString()}`, {
      headers: { "x-apisports-key": apiKey },
    })

    if (!resp.ok) {
      return res.status(502).json({ ok: false, code: "API_FOOTBALL_ERROR", message: `API-Football retornou ${resp.status}` })
    }

    const data = await resp.json()
    if (data.errors && typeof data.errors === 'object' && Object.keys(data.errors).length > 0) {
      return res.status(200).json({ ok: true, response: [], errors: data.errors })
    }

    return res.status(200).json({ ok: true, response: data.response || [] })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message })
  }
}
