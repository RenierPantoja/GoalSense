import type { VercelRequest, VercelResponse } from '@vercel/node';
import originalHandler from '../netlify/functions/api-football-leagues';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Build a Request-like object for the original Netlify handler
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.query) {
      Object.entries(req.query).forEach(([k, v]) => {
        if (v) url.searchParams.set(k, Array.isArray(v) ? v[0] : v);
      });
    }
    const request = new Request(url.toString(), { method: req.method || 'GET' });
    
    // Call original handler
    const response = await originalHandler(request);
    
    // Convert Response to Vercel res
    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
