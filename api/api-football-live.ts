import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"
    const keys = (process.env.API_FOOTBALL_KEYS || process.env.API_FOOTBALL_KEY || '').split(',').filter(Boolean)
    const apiKey = keys[0]?.trim()

    if (!apiKey) {
      return res.status(500).json({ ok: false, code: "API_FOOTBALL_KEY_MISSING", message: "API-Football não configurada." })
    }

    const resp = await fetch(`${BASE}/fixtures?live=all`, {
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
