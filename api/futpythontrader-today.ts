import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * FutPythonTrader — fetches today's matches with stats from footystats source.
 * Provides odds, stats, and match data for Brazilian leagues.
 * Token-based auth.
 */


export default async function handler(req: VercelRequest, res: VercelResponse) {
  const TOKEN = process.env.FUTPYTHONTRADER_TOKEN
  const BASE = process.env.FUTPYTHONTRADER_BASE_URL || "https://api.futpythontrader.com/api"

  if (!TOKEN) {
    return res.status(500).json({ ok: false, code: "FPT_TOKEN_MISSING" })
  }

  const source = (req.query.source as string || '') || "footystats"
  const date = (req.query.date as string || '') || new Date().toISOString().split("T")[0]
  const league = (req.query.league as string || '') || ""

  try {
    const endpoint = league
      ? `${BASE}/dados/jogos-do-dia/${source}/${date}/?league=${encodeURIComponent(league)}`
      : `${BASE}/dados/jogos-do-dia/${source}/${date}/`

    const resp = await fetch(endpoint, {
      headers: {
        "Authorization": `Token ${TOKEN}`,
        "Content-Type": "application/json",
      },
    })

    if (!resp.ok) {
      const text = await res.text()
      return res.status(200).json({ ok: false, code: "FPT_ERROR", status: res.status, message: text }, { status: res.status })
    }

    const data = await res.json()

    return res.status(200).json({
      ok: true,
      source: "futpythontrader",
      dataSource: source,
      date,
      matches: Array.isArray(data) ? data : data.results || data.matches || [],
      count: Array.isArray(data) ? data.length : (data.results || data.matches || []).length,
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, code: "FPT_FETCH_ERROR", message: err.message })
  }
}
