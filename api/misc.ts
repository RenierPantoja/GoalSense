import type { VercelRequest, VercelResponse } from '@vercel/node';
import providerCapabilities from '../netlify/functions/provider-capabilities';
import teamLogoResolver from '../netlify/functions/team-logo-resolver';
import thesportsdbTeam from '../netlify/functions/thesportsdb-team';
import futpythontraderToday from '../netlify/functions/futpythontrader-today';

/**
 * Consolidated handler for less-critical endpoints.
 * Routes via ?fn= query parameter.
 * /api/misc?fn=provider-capabilities
 * /api/misc?fn=team-logo-resolver&name=Flamengo
 * /api/misc?fn=thesportsdb-team&name=Flamengo
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const fn = (Array.isArray(req.query.fn) ? req.query.fn[0] : req.query.fn) || '';
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.query) {
      Object.entries(req.query).forEach(([k, v]) => {
        if (v && k !== 'fn') url.searchParams.set(k, Array.isArray(v) ? v[0] : v);
      });
    }
    const request = new Request(url.toString(), { method: req.method || 'GET' });

    let response: Response;
    switch (fn) {
      case 'provider-capabilities':
        response = await (providerCapabilities as any)();
        break;
      case 'team-logo-resolver':
        response = await (teamLogoResolver as any)(request);
        break;
      case 'thesportsdb-team':
        response = await (thesportsdbTeam as any)(request);
        break;
      case 'futpythontrader-today':
        response = await (futpythontraderToday as any)(request);
        break;
      default:
        return res.status(400).json({ ok: false, error: `Unknown function: ${fn}` });
    }

    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
