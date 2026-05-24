import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const getQuery = (key: string): string => {
    const v = req.query[key];
    return Array.isArray(v) ? v[0] || '' : v || '';
  };
  try {
    const API_KEY = process.env.FOOTBALL_DATA_API_KEY
  const BASE = process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4"

  if (!API_KEY) {
    return res.status(500).json({ ok: false, code: "FOOTBALL_DATA_KEY_MISSING" })
  }

  try {
    const resp = await fetch(`${BASE}/competitions`, {
      headers: { "X-Auth-Token": API_KEY },
    })
    const data = await resp.json()

    return res.status(500).json({
      ok: true,
      source: "football_data",
      fetchedAt: new Date().toISOString(),
      competitions: data.competitions || [],
    }, { headers: { "Cache-Control": "public, max-age=3600" } })
  } catch (err: any) {
    return res.status(200).json({ ok: false, message: err.message })
  }
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
