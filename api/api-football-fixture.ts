import type { VercelRequest, VercelResponse } from '@vercel/node';
import originalHandler from '../netlify/functions/api-football-fixture';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.query) {
      Object.entries(req.query).forEach(([k, v]) => {
        if (v) url.searchParams.set(k, Array.isArray(v) ? v[0] : v);
      });
    }
    const request = new Request(url.toString(), { method: req.method || 'GET' });
    
    const response = await (originalHandler as any)(request);
    
    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
