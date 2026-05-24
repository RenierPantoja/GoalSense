import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Consolidated handler for less-critical endpoints.
 * /api/misc?fn=provider-capabilities
 * /api/misc?fn=team-logo-resolver&name=X
 * /api/misc?fn=thesportsdb-team&name=X
 * /api/misc?fn=futpythontrader-today&date=X
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fn = (Array.isArray(req.query.fn) ? req.query.fn[0] : req.query.fn) || '';
  const getQuery = (key: string): string => { const v = req.query[key]; return Array.isArray(v) ? v[0] || '' : v || ''; };

  try {
    switch (fn) {
      case 'provider-capabilities':
        return res.status(200).json({ ok: true, providers: ['espn', 'football-data', 'api-football'] });

      case 'team-logo-resolver': {
        const name = getQuery('name');
        if (!name) return res.status(400).json({ ok: false, code: 'MISSING_NAME' });
        try {
          const resp = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`);
          if (resp.ok) {
            const data = await resp.json();
            const team = data.teams?.[0];
            if (team?.strBadge) return res.status(200).json({ ok: true, logo: team.strBadge, source: 'thesportsdb' });
          }
        } catch {}
        return res.status(200).json({ ok: true, logo: null });
      }

      case 'thesportsdb-team': {
        const name = getQuery('name');
        const id = getQuery('id');
        if (!name && !id) return res.status(400).json({ ok: false, code: 'MISSING_PARAMS' });
        const apiUrl = id ? `https://www.thesportsdb.com/api/v1/json/3/lookupteam.php?id=${id}` : `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`;
        const resp = await fetch(apiUrl);
        if (!resp.ok) return res.status(502).json({ ok: false });
        const data = await resp.json();
        const team = data.teams?.[0];
        return res.status(200).json({ ok: true, team: team ? { id: team.idTeam, name: team.strTeam, badge: team.strBadge } : null });
      }

      case 'futpythontrader-today': {
        const date = getQuery('date');
        const source = getQuery('source') || 'footystats';
        const TOKEN = process.env.FUTPYTHONTRADER_TOKEN;
        const BASE = process.env.FUTPYTHONTRADER_BASE_URL || 'https://api.futpythontrader.com/api';
        if (!TOKEN) return res.status(200).json({ ok: true, matches: [] });
        const endpoint = `${BASE}/matches?date=${date || new Date().toISOString().split('T')[0]}&source=${source}`;
        const resp = await fetch(endpoint, { headers: { 'Authorization': `Token ${TOKEN}` } });
        if (!resp.ok) return res.status(200).json({ ok: true, matches: [] });
        const data = await resp.json();
        return res.status(200).json({ ok: true, matches: data.results || data.matches || [] });
      }

      default:
        return res.status(400).json({ ok: false, error: `Unknown function: ${fn}` });
    }
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
