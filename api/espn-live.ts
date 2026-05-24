import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const dateParam = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date || '';
    const espnUrl = dateParam
      ? `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${dateParam}`
      : "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard"

    const resp = await fetch(espnUrl)
    if (!resp.ok) {
      return res.status(502).json({ ok: false, code: "ESPN_ERROR", message: `ESPN retornou ${resp.status}` })
    }

    const data = await resp.json()
    const events = data.events || []

    const fixtures = events.map((event: any) => {
      const comp = event.competitions?.[0]
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home")
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away")
      const league = extractLeague(event)

      return {
        id: event.id,
        provider: "espn",
        externalId: event.id,
        league,
        status: {
          long: event.status?.type?.description || "",
          short: mapEspnStatus(event.status?.type?.name),
          elapsed: parseElapsed(event.status?.displayClock),
          state: event.status?.type?.state,
        },
        homeTeam: { id: home?.team?.id || home?.id, name: home?.team?.displayName || "Home", logo: home?.team?.logo || null },
        awayTeam: { id: away?.team?.id || away?.id, name: away?.team?.displayName || "Away", logo: away?.team?.logo || null },
        score: { home: parseInt(home?.score) || 0, away: parseInt(away?.score) || 0 },
        statistics: { home: parseStats(home?.statistics || []), away: parseStats(away?.statistics || []) },
        venue: comp?.venue?.fullName || null,
        date: event.date,
      }
    })

    const live = fixtures.filter((f: any) => f.status.state === "in")

    return res.status(200).json({
      ok: true, source: "espn", fetchedAt: new Date().toISOString(),
      count: fixtures.length, liveCount: live.length, fixtures, live,
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, code: "FETCH_ERROR", message: err.message })
  }
}

function parseStats(stats: any[]) {
  const map: Record<string, string | number> = {}
  for (const s of stats) { map[s.name] = s.displayValue }
  return { possession: parseFloat(String(map.possessionPct || "0")) || null, shots: parseInt(String(map.totalShots || "0")) || 0, shotsOnTarget: parseInt(String(map.shotsOnTarget || "0")) || 0, corners: parseInt(String(map.wonCorners || "0")) || 0, fouls: parseInt(String(map.foulsCommitted || "0")) || 0 }
}

function extractLeague(event: any) {
  const slug = event.season?.slug || ""
  const name = slug.replace(/^\d{4}-\d{2}-/, "").replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
  return { id: event.season?.type || 0, name: name || "Liga", logo: null, country: "", season: event.season?.year || new Date().getFullYear() }
}

function mapEspnStatus(name: string): string {
  if (!name) return "NS"
  if (name === "STATUS_IN_PROGRESS" || name === "STATUS_FIRST_HALF" || name === "STATUS_SECOND_HALF") return "LIVE"
  if (name === "STATUS_HALFTIME" || name === "STATUS_END_PERIOD") return "HT"
  if (name === "STATUS_FULL_TIME") return "FT"
  if (name === "STATUS_SCHEDULED") return "NS"
  if (name.includes("PROGRESS") || name.includes("HALF")) return "LIVE"
  return name.replace("STATUS_", "")
}

function parseElapsed(displayClock: string | undefined): number | null {
  if (!displayClock) return null
  const match = displayClock.match(/(\d+)/)
  return match ? parseInt(match[1]) : null
}
