import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Team Logo Resolver — tries multiple providers to find a real team badge.
 * Priority: TheSportsDB > API-Football > ESPN
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url)
  const name = (req.query.name as string || '')
  if (!name) {
    return res.status(400).json({ ok: false, code: 'MISSING_NAME' })
  }

  // TheSportsDB (free, key=3 for testing)
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`)
    if (res.ok) {
      const data = await res.json()
      const team = data.teams?.[0]
      if (team?.strBadge) {
        return res.status(200).json({ ok: true, logo: team.strBadge, source: 'thesportsdb', teamName: team.strTeam })
      }
    }
  } catch {}

  // API-Football search
  const AF_KEY = (process.env.API_FOOTBALL_KEYS || process.env.API_FOOTBALL_KEY || '').split(',')[0]
  if (AF_KEY) {
    try {
      const res = await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(name)}`, {
        headers: { 'x-apisports-key': AF_KEY.trim() },
      })
      if (res.ok) {
        const data = await res.json()
        const team = data.response?.[0]?.team
        if (team?.logo) {
          return res.status(200).json({ ok: true, logo: team.logo, source: 'api_football', teamName: team.name })
        }
      }
    } catch {}
  }

  return res.status(200).json({ ok: true, logo: null, reason: 'Logo não encontrado nos providers.' })
}
