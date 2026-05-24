/**
 * Provider Capabilities — real-time check of what each provider can deliver.
 */
export default async () => {
  const results = await Promise.allSettled([
    checkEspn(),
    checkFootballData(),
    checkApiFootball(),
    checkTheSportsDb(),
    checkScoreBat(),
  ])

  const providers = [
    { name: 'espn', ...(results[0].status === 'fulfilled' ? results[0].value : { status: 'error' }) },
    { name: 'football_data', ...(results[1].status === 'fulfilled' ? results[1].value : { status: 'error' }) },
    { name: 'api_football', ...(results[2].status === 'fulfilled' ? results[2].value : { status: 'error' }) },
    { name: 'thesportsdb', ...(results[3].status === 'fulfilled' ? results[3].value : { status: 'error' }) },
    { name: 'scorebat', ...(results[4].status === 'fulfilled' ? results[4].value : { status: 'error' }) },
  ]

  return Response.json({ ok: true, checkedAt: new Date().toISOString(), providers })
}

async function checkEspn() {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard')
  const ok = res.ok
  const data = ok ? await res.json() : null
  return {
    status: ok ? 'available' : 'unavailable',
    live_score: ok,
    live_statistics: ok && (data?.events?.length || 0) > 0,
    events_count: data?.events?.length || 0,
  }
}

async function checkFootballData() {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) return { status: 'unavailable', reason: 'Key not configured' }
  const res = await fetch('https://api.football-data.org/v4/matches', { headers: { 'X-Auth-Token': key } })
  return { status: res.ok ? 'available' : 'unavailable', matches: res.ok ? ((await res.json()).matches?.length || 0) : 0 }
}

async function checkApiFootball() {
  const keys = (process.env.API_FOOTBALL_KEYS || process.env.API_FOOTBALL_KEY || '').split(',').filter(Boolean)
  if (keys.length === 0) return { status: 'unavailable', reason: 'Key not configured' }
  for (const key of keys) {
    const res = await fetch('https://v3.football.api-sports.io/status', { headers: { 'x-apisports-key': key.trim() } })
    if (res.ok) {
      const data = await res.json()
      const account = data.response?.account
      const requests = data.response?.requests
      return {
        status: 'available',
        plan: account?.plan || 'unknown',
        requestsToday: requests?.current || 0,
        requestsLimit: requests?.limit_day || 100,
        remaining: (requests?.limit_day || 100) - (requests?.current || 0),
        odds: 'quota_limited',
        predictions: 'quota_limited',
      }
    }
  }
  return { status: 'quota_limited', reason: 'All keys exhausted' }
}

async function checkTheSportsDb() {
  const res = await fetch('https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Barcelona')
  return { status: res.ok ? 'available' : 'unavailable' }
}

async function checkScoreBat() {
  const res = await fetch('https://www.scorebat.com/video-api/v1/')
  return { status: res.ok ? 'available' : 'unavailable', videos: res.ok ? ((await res.json()).length || 0) : 0 }
}
