/**
 * ESPN Scoreboard — free, no API key, real-time soccer data.
 * Endpoint: https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard
 * Accepts ?date=YYYYMMDD to fetch specific day (includes finished matches)
 */
export default async (req: Request) => {
  try {
    const url = new URL(req.url)
    const dateParam = url.searchParams.get('date') // YYYYMMDD format
    const espnUrl = dateParam
      ? `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${dateParam}`
      : "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard"

    const res = await fetch(espnUrl)

    if (!res.ok) {
      return Response.json(
        { ok: false, code: "ESPN_ERROR", message: `ESPN retornou ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()
    const events = data.events || []

    const fixtures = events.map((event: any) => {
      const comp = event.competitions?.[0]
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home")
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away")

      const homeStats = parseStats(home?.statistics || [])
      const awayStats = parseStats(away?.statistics || [])

      // Detect league from season slug or event name
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
          state: event.status?.type?.state, // pre, in, post
        },
        homeTeam: {
          id: home?.team?.id || home?.id,
          name: home?.team?.displayName || home?.team?.name || "Home",
          logo: home?.team?.logo || null,
        },
        awayTeam: {
          id: away?.team?.id || away?.id,
          name: away?.team?.displayName || away?.team?.name || "Away",
          logo: away?.team?.logo || null,
        },
        score: {
          home: parseInt(home?.score) || 0,
          away: parseInt(away?.score) || 0,
        },
        // V14: Extract penalty shootout score if available
        penaltyScore: extractShootoutScore(home, away, event.status?.type?.name),
        statistics: {
          home: homeStats,
          away: awayStats,
        },
        venue: comp?.venue?.fullName || event.venue?.displayName || null,
        date: event.date,
      }
    })

    // Split into live and scheduled
    const live = fixtures.filter((f: any) => f.status.state === "in")
    const all = fixtures

    return Response.json({
      ok: true,
      source: "espn",
      fetchedAt: new Date().toISOString(),
      count: all.length,
      liveCount: live.length,
      fixtures: all,
      live,
    }, { headers: { "Cache-Control": "public, max-age=5" } })
  } catch (err: any) {
    return Response.json(
      { ok: false, code: "FETCH_ERROR", message: err.message },
      { status: 500 }
    )
  }
}

function parseStats(stats: any[]) {
  const map: Record<string, string | number> = {}
  for (const s of stats) {
    map[s.name] = s.displayValue
  }
  return {
    possession: parseFloat(String(map.possessionPct || "0")) || null,
    shots: parseInt(String(map.totalShots || "0")) || 0,
    shotsOnTarget: parseInt(String(map.shotsOnTarget || "0")) || 0,
    corners: parseInt(String(map.wonCorners || "0")) || 0,
    fouls: parseInt(String(map.foulsCommitted || "0")) || 0,
    goals: parseInt(String(map.totalGoals || "0")) || 0,
  }
}

function extractLeague(event: any) {
  const slug = event.season?.slug || ""
  const name = slug
    .replace(/^\d{4}-\d{2}-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase())

  return {
    id: event.season?.type || 0,
    name: name || "Liga",
    logo: null,
    country: "",
    season: event.season?.year || new Date().getFullYear(),
  }
}

function mapEspnStatus(name: string): string {
  if (!name) return "NS"
  // Live statuses
  if (name === "STATUS_IN_PROGRESS") return "LIVE"
  if (name === "STATUS_FIRST_HALF") return "1H"
  if (name === "STATUS_SECOND_HALF") return "2H"
  if (name === "STATUS_HALFTIME") return "HT"
  // Extra time & penalties (live)
  if (name === "STATUS_EXTRA_TIME" || name === "STATUS_OVERTIME") return "ET"
  if (name === "STATUS_EXTRA_TIME_HALF_TIME" || name === "STATUS_END_PERIOD") return "BT"
  if (name === "STATUS_SHOOTOUT" || name === "STATUS_PENALTY_SHOOTOUT") return "P"
  // Finished statuses
  if (name === "STATUS_FULL_TIME") return "FT"
  if (name === "STATUS_FINAL") return "FT"
  if (name === "STATUS_FINAL_AET" || name === "STATUS_FINAL_EXTRA_TIME") return "AET"
  if (name === "STATUS_FINAL_PEN" || name === "STATUS_FINAL_SHOOTOUT") return "PEN"
  // Scheduled/other
  if (name === "STATUS_SCHEDULED" || name === "STATUS_PRE_EVENT") return "NS"
  if (name === "STATUS_POSTPONED") return "PST"
  if (name === "STATUS_CANCELED" || name === "STATUS_CANCELLED") return "CANC"
  if (name === "STATUS_SUSPENDED" || name === "STATUS_DELAYED") return "SUSP"
  // Fallback heuristics
  if (name.includes("SHOOTOUT") || name.includes("PENALTY")) return "P"
  if (name.includes("EXTRA") || name.includes("OVERTIME")) return "ET"
  if (name.includes("PROGRESS") || name.includes("HALF")) return "LIVE"
  if (name.includes("FINAL")) return "FT"
  return name.replace("STATUS_", "")
}

function parseElapsed(displayClock: string | undefined): number | null {
  if (!displayClock) return null
  const match = displayClock.match(/(\d+)/)
  return match ? parseInt(match[1]) : null
}

// V14: Extract penalty shootout score from ESPN competitor data
function extractShootoutScore(home: any, away: any, statusName: string | undefined): { home: number; away: number } | undefined {
  // Only extract if status indicates penalties
  const s = (statusName || '').toUpperCase()
  const isPenalty = s.includes('SHOOTOUT') || s.includes('PENALTY') || s.includes('FINAL_PEN')
  if (!isPenalty) return undefined

  // Try shootoutScore field
  if (home?.shootoutScore !== undefined && away?.shootoutScore !== undefined) {
    const h = parseInt(home.shootoutScore)
    const a = parseInt(away.shootoutScore)
    if (!isNaN(h) && !isNaN(a)) return { home: h, away: a }
  }

  // Try linescores (penalty round is typically the last linescore after ET)
  const homeLS = home?.linescores || []
  const awayLS = away?.linescores || []
  if (homeLS.length >= 4 && awayLS.length >= 4) {
    const lastH = homeLS[homeLS.length - 1]
    const lastA = awayLS[awayLS.length - 1]
    if (lastH?.value !== undefined && lastA?.value !== undefined) {
      const h = parseInt(lastH.value)
      const a = parseInt(lastA.value)
      if (!isNaN(h) && !isNaN(a) && (h + a) <= 15) return { home: h, away: a }
    }
  }

  return undefined
}
