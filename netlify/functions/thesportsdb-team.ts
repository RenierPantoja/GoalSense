/**
 * TheSportsDB Team Lookup — free, no key needed for basic access.
 * Returns team badge, banner, jersey, and metadata.
 */
export default async (req: Request) => {
  const url = new URL(req.url)
  const name = url.searchParams.get('name')
  const id = url.searchParams.get('id')

  if (!name && !id) {
    return Response.json({ ok: false, code: 'MISSING_PARAMS' }, { status: 400 })
  }

  try {
    let apiUrl: string
    if (id) {
      apiUrl = `https://www.thesportsdb.com/api/v1/json/3/lookupteam.php?id=${id}`
    } else {
      apiUrl = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name!)}`
    }

    const res = await fetch(apiUrl)
    if (!res.ok) {
      return Response.json({ ok: false, code: 'THESPORTSDB_ERROR' }, { status: 502 })
    }

    const data = await res.json()
    const team = data.teams?.[0]

    if (!team) {
      return Response.json({ ok: true, team: null, reason: 'Time não encontrado.' })
    }

    return Response.json({
      ok: true,
      source: 'thesportsdb',
      team: {
        id: team.idTeam,
        name: team.strTeam,
        badge: team.strBadge || null,
        banner: team.strBanner || null,
        jersey: team.strJersey || null,
        stadium: team.strStadium || null,
        country: team.strCountry || null,
        league: team.strLeague || null,
        description: team.strDescriptionEN?.slice(0, 200) || null,
      },
    }, { headers: { 'Cache-Control': 'public, max-age=86400' } })
  } catch (err: any) {
    return Response.json({ ok: false, message: err.message }, { status: 500 })
  }
}
