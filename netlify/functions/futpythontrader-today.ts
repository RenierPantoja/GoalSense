/**
 * FutPythonTrader — fetches today's matches with stats from footystats source.
 * Provides odds, stats, and match data for Brazilian leagues.
 * Token-based auth.
 */
import type { Context } from "@netlify/functions"

export default async (req: Request, _context: Context) => {
  const TOKEN = process.env.FUTPYTHONTRADER_TOKEN
  const BASE = process.env.FUTPYTHONTRADER_BASE_URL || "https://api.futpythontrader.com/api"

  if (!TOKEN) {
    return Response.json({ ok: false, code: "FPT_TOKEN_MISSING" }, { status: 500 })
  }

  const url = new URL(req.url)
  const source = url.searchParams.get("source") || "footystats"
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0]
  const league = url.searchParams.get("league") || ""

  try {
    const endpoint = league
      ? `${BASE}/dados/jogos-do-dia/${source}/${date}/?league=${encodeURIComponent(league)}`
      : `${BASE}/dados/jogos-do-dia/${source}/${date}/`

    const res = await fetch(endpoint, {
      headers: {
        "Authorization": `Token ${TOKEN}`,
        "Content-Type": "application/json",
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return Response.json({ ok: false, code: "FPT_ERROR", status: res.status, message: text }, { status: res.status })
    }

    const data = await res.json()

    return Response.json({
      ok: true,
      source: "futpythontrader",
      dataSource: source,
      date,
      matches: Array.isArray(data) ? data : data.results || data.matches || [],
      count: Array.isArray(data) ? data.length : (data.results || data.matches || []).length,
    })
  } catch (err: any) {
    return Response.json({ ok: false, code: "FPT_FETCH_ERROR", message: err.message }, { status: 500 })
  }
}
