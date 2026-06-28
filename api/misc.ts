import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  detectRuntimeEnvironment,
  explainRuntimeGuardDecision,
  isPersistentWorkerAllowed,
  isReadOnlyControlPlane,
} from './_runtimeGuard.js';
import {
  getControlPlaneReadinessModel,
  getControlPlaneStatusReadModel,
} from './_workerControlPlaneReadModel.js';

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

      case 'runtime': {
        const environment = detectRuntimeEnvironment();
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.status(200).json({
          ok: true,
          environment,
          isPersistentWorkerAllowed: isPersistentWorkerAllowed(),
          isReadOnlyControlPlane: isReadOnlyControlPlane(),
          decisions: {
            startWorker: explainRuntimeGuardDecision('start_worker'),
            resumeWorker: explainRuntimeGuardDecision('resume_worker'),
            recoverySweep: explainRuntimeGuardDecision('recovery_sweep'),
            postMatchSweeper: explainRuntimeGuardDecision('post_match_sweeper'),
            readStatus: explainRuntimeGuardDecision('read_status'),
          },
          limitations: isReadOnlyControlPlane()
            ? ['Vercel is a read-only control plane; persistent ESPN Live-First workers run locally or in a dedicated runtime.']
            : ['Worker commands require an explicit local_worker runtime and safety flags.'],
          timestamp: new Date().toISOString(),
        });
      }

      case 'worker-control-plane-status':
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.status(200).json({ ok: true, data: await getControlPlaneStatusReadModel() });

      case 'worker-control-plane-readiness':
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.status(200).json({ ok: true, data: await getControlPlaneReadinessModel() });

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

      case 'api-football-injuries': {
        const team = getQuery('team'); const season = getQuery('season');
        if (!team) return res.status(400).json({ ok: false, code: 'MISSING_TEAM' });
        const AF_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
        const keys = (process.env.API_FOOTBALL_KEYS || process.env.API_FOOTBALL_KEY || '').split(',').filter(Boolean);
        const apiKey = keys[0]?.trim();
        if (!apiKey) return res.status(200).json({ ok: true, response: [] });
        try {
          const url = `${AF_BASE}/injuries?team=${team}&season=${season || new Date().getFullYear()}`;
          const resp = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
          if (!resp.ok) return res.status(200).json({ ok: true, response: [], error: `API returned ${resp.status}` });
          const data = await resp.json();
          return res.status(200).json({ ok: true, response: data.response || [] });
        } catch (e: any) { return res.status(200).json({ ok: true, response: [], error: e.message }); }
      }

      case 'api-football-topscorers': {
        const league = getQuery('league'); const season = getQuery('season');
        if (!league) return res.status(400).json({ ok: false, code: 'MISSING_LEAGUE' });
        const AF_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
        const keys = (process.env.API_FOOTBALL_KEYS || process.env.API_FOOTBALL_KEY || '').split(',').filter(Boolean);
        const apiKey = keys[0]?.trim();
        if (!apiKey) return res.status(200).json({ ok: true, response: [] });
        try {
          const url = `${AF_BASE}/players/topscorers?league=${league}&season=${season || new Date().getFullYear()}`;
          const resp = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
          if (!resp.ok) return res.status(200).json({ ok: true, response: [], error: `API returned ${resp.status}` });
          const data = await resp.json();
          return res.status(200).json({ ok: true, response: data.response || [] });
        } catch (e: any) { return res.status(200).json({ ok: true, response: [], error: e.message }); }
      }

      default:
        return res.status(400).json({ ok: false, error: `Unknown function: ${fn}` });
    }
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
