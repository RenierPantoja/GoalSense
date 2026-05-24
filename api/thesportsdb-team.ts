import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * TheSportsDB Team Lookup — free, no key needed for basic access.
 * Returns team badge, banner, jersey, and metadata.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url)
  const name = (req.query.name as string || '')
  const id = (req.query.id as string || '')

  if (!name && !id) {
    return res.status(400).json({ ok: false, code: 'MISSING_PARAMS' })
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
      return res.status(502).json({ ok: false, code: 'THESPORTSDB_ERROR' })
    }

    const data = await res.json()
    const team = data.teams?.[0]

    if (!team) {
      return res.status(200).json({ ok: true, team: null, reason: 'Time não encontrado.' })
    }

    return res.status(200).json({
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
    return res.status(500).json({ ok: false, message: err.message })
  }
}
