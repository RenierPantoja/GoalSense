import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const getQuery = (key: string): string => {
    const v = req.query[key];
    return Array.isArray(v) ? v[0] || '' : v || '';
  };
  try {
    const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"
  const apiKey = getActiveKey()

  if (!apiKey) {
    return res.status(500).json({ ok: false, code: "API_FOOTBALL_KEY_MISSING", message: "API-Football não configurada no servidor." })
  }

  console.info("[api-football-live] Using key:", `...${apiKey.slice(-6)}`)

  try {
    const resp = await fetch(`${BASE}/fixtures?live=all`, {
      headers: { "x-apisports-key": apiKey },
    })

    // Update rotation state from response headers
    updateKeyState(apiKey, res.headers)

    if (!res.ok) {
      return res.status(502).json({ ok: false, code: "API_FOOTBALL_ERROR", status: res.status, message: `API-Football retornou ${res.status}` })
    }

    const data = await res.json()

    // Detect rate limit error in response body
    if (data.errors && Object.keys(data.errors).length > 0) {
      const errorMsg = Object.values(data.errors).join('. ')
      const isRateLimit = String(errorMsg).toLowerCase().includes('limit')

      if (isRateLimit) {
        markKeyExhausted(apiKey)

        // Try next key immediately
        const nextKey = getActiveKey()
        if (nextKey && nextKey !== apiKey) {
          console.info("[api-football-live] Retrying with key:", `...${nextKey.slice(-6)}`)
          const retryRes = await fetch(`${BASE}/fixtures?live=all`, {
            headers: { "x-apisports-key": nextKey },
          })
          updateKeyState(nextKey, retryRes.headers)
          const retryData = await retryRes.json()

          if (retryData.errors && Object.keys(retryData.errors).length > 0) {
            return res.status(429).json({
              ok: false,
              code: "ALL_KEYS_EXHAUSTED",
              message: "Todas as chaves atingiram o limite diário. Reseta à meia-noite UTC.",
            })
          }

          const fixtures = (retryData.response || []).map(normalizeFixture)
          return res.status(429).json({
            ok: true,
            source: "api_football",
            fetchedAt: new Date().toISOString(),
            count: fixtures.length,
            fixtures,
            keyUsed: `...${nextKey.slice(-6)}`,
          }, { headers: { "Cache-Control": "public, max-age=12" } })
        }

        return res.status(200).json({
          ok: false,
          code: "RATE_LIMIT",
          message: String(errorMsg),
        })
      }

      return res.status(502).json({
        ok: false,
        code: "API_FOOTBALL_ERROR",
        message: String(errorMsg),
      })
    }

    const fixtures = (data.response || []).map(normalizeFixture)

    return res.status(500).json({
      ok: true,
      source: "api_football",
      fetchedAt: new Date().toISOString(),
      count: fixtures.length,
      fixtures,
      keyUsed: `...${apiKey.slice(-6)}`,
      ...(fixtures.length === 0 && { message: "A API-Football retornou zero partidas ao vivo neste momento." }),
    }, { headers: { "Cache-Control": "public, max-age=12" } })
  } catch (err: any) {
    return res.status(200).json(
      { ok: false, code: "FETCH_ERROR", message: err.message })
  }
}

function normalizeFixture(raw: any) {
  return {
    id: raw.fixture.id,
    provider: "api_football",
    externalId: raw.fixture.id,
    league: {
      id: raw.league.id,
      name: raw.league.name,
      logo: raw.league.logo || null,
      country: raw.league.country || "",
      season: raw.league.season,
    },
    status: {
      long: raw.fixture.status.long,
      short: raw.fixture.status.short,
      elapsed: raw.fixture.status.elapsed,
    },
    homeTeam: {
      id: raw.teams.home.id,
      name: raw.teams.home.name,
      logo: raw.teams.home.logo || null,
    },
    awayTeam: {
      id: raw.teams.away.id,
      name: raw.teams.away.name,
      logo: raw.teams.away.logo || null,
    },
    score: {
      home: raw.goals.home,
      away: raw.goals.away,
    },
    venue: raw.fixture.venue?.name || null,
    referee: raw.fixture.referee || null,
    date: raw.fixture.date,
    raw: raw.fixture.status.short,
  }
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
