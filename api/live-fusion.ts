import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const getQuery = (key: string): string => {
    const v = req.query[key];
    return Array.isArray(v) ? v[0] || '' : v || '';
  };
  try {
    const API_FOOTBALL_KEYS = (process.env.API_FOOTBALL_KEYS || process.env.API_FOOTBALL_KEY || '').split(',').filter(Boolean)
  const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
  const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard'
  const AF_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io'
  const FD_BASE = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4'

  const results = await Promise.allSettled([
    fetchEspn(ESPN_BASE),
    FD_KEY ? fetchFootballData(FD_BASE, FD_KEY) : Promise.resolve([]),
    API_FOOTBALL_KEYS.length > 0 ? fetchApiFootball(AF_BASE, API_FOOTBALL_KEYS) : Promise.resolve([]),
  ])

  const espnFixtures = results[0].status === 'fulfilled' ? results[0].value : []
  const fdFixtures = results[1].status === 'fulfilled' ? results[1].value : []
  const afFixtures = results[2].status === 'fulfilled' ? results[2].value : []

  // Merge: API-Football first (best stats), ESPN second (best logos), football-data third
  const seen = new Set<string>()
  const merged: any[] = []

  for (const fx of afFixtures) {
    const key = dedup(fx.homeTeam.name, fx.awayTeam.name)
    if (!seen.has(key)) { seen.add(key); merged.push(fx) }
  }
  for (const fx of espnFixtures) {
    const key = dedup(fx.homeTeam.name, fx.awayTeam.name)
    if (!seen.has(key)) { seen.add(key); merged.push(fx) }
  }
  for (const fx of fdFixtures) {
    const key = dedup(fx.homeTeam.name, fx.awayTeam.name)
    if (!seen.has(key)) { seen.add(key); merged.push(fx) }
  }

  return res.status(200).json({
    ok: true,
    source: 'fusion',
    fetchedAt: new Date().toISOString(),
    count: merged.length,
    fixtures: merged,
    sources: {
      espn: espnFixtures.length,
      footballData: fdFixtures.length,
      apiFootball: afFixtures.length,
    },
  }, { headers: { 'Cache-Control': 'public, max-age=12' } })
}

function dedup(home: string, away: string): string {
  return `${home.toLowerCase().replace(/\s+/g, '')}:${away.toLowerCase().replace(/\s+/g, '')}`
}

async function fetchEspn(base: string) {
  const resp = await fetch(base)
  if (!resp.ok) return []
  const data = await res.json()
  return (data.events || [])
    .filter((e: any) => e.status?.type?.state === 'in')
    .map((event: any) => {
      const comp = event.competitions?.[0]
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away')
      const elapsed = event.status?.displayClock?.match(/(\d+)/)?.[1]
      return {
        id: event.id,
        provider: 'espn',
        league: { name: extractLeague(event), logo: null, country: '' },
        status: { short: 'LIVE', elapsed: elapsed ? parseInt(elapsed) : null },
        homeTeam: { id: home?.team?.id, name: home?.team?.displayName || '', logo: home?.team?.logo || null },
        awayTeam: { id: away?.team?.id, name: away?.team?.displayName || '', logo: away?.team?.logo || null },
        score: { home: parseInt(home?.score) || 0, away: parseInt(away?.score) || 0 },
        date: event.date,
      }
    })
}

async function fetchFootballData(base: string, key: string) {
  const resp = await fetch(`${base}/matches`, { headers: { 'X-Auth-Token': key } })
  if (!resp.ok) return []
  const data = await res.json()
  return (data.matches || [])
    .filter((m: any) => m.status === 'IN_PLAY' || m.status === 'PAUSED')
    .map((m: any) => ({
      id: m.id,
      provider: 'football_data',
      league: { name: m.competition?.name || '', logo: m.competition?.emblem || null, country: m.area?.name || '' },
      status: { short: m.status === 'IN_PLAY' ? 'LIVE' : 'HT', elapsed: null },
      homeTeam: { id: m.homeTeam?.id, name: m.homeTeam?.shortName || m.homeTeam?.name || '', logo: m.homeTeam?.crest || null },
      awayTeam: { id: m.awayTeam?.id, name: m.awayTeam?.shortName || m.awayTeam?.name || '', logo: m.awayTeam?.crest || null },
      score: { home: m.score?.fullTime?.home ?? 0, away: m.score?.fullTime?.away ?? 0 },
      date: m.utcDate || '',
    }))
}

async function fetchApiFootball(base: string, keys: string[]) {
  for (const key of keys) {
    try {
      const resp = await fetch(`${base}/fixtures?live=all`, { headers: { 'x-apisports-key': key.trim() } })
      if (!resp.ok) continue
      const data = await resp.json()
      if (data.errors && Object.keys(data.errors).length > 0) continue
      return (data.response || []).map((raw: any) => ({
        id: raw.fixture.id,
        provider: 'api_football',
        league: { name: raw.league.name, logo: raw.league.logo || null, country: raw.league.country || '' },
        status: { short: raw.fixture.status.short, elapsed: raw.fixture.status.elapsed },
        homeTeam: { id: raw.teams.home.id, name: raw.teams.home.name, logo: raw.teams.home.logo || null },
        awayTeam: { id: raw.teams.away.id, name: raw.teams.away.name, logo: raw.teams.away.logo || null },
        score: { home: raw.goals.home ?? 0, away: raw.goals.away ?? 0 },
        date: raw.fixture.date,
      }))
    } catch { continue }
  }
  return []
}

function extractLeague(event: any): string {
  return (event.season?.slug || '').replace(/^\d{4}-\d{2}-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Liga'
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
