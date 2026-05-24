import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const team = Array.isArray(req.query.team) ? req.query.team[0] : req.query.team || '';

    const resp = await fetch('https://www.scorebat.com/video-api/v1/')
    if (!resp.ok) {
      return res.status(200).json({ ok: true, videos: [] })
    }

    const videos = await resp.json()
    let filtered = Array.isArray(videos) ? videos : []

    if (team) {
      const q = team.toLowerCase()
      filtered = filtered.filter((v: any) => (v.title || '').toLowerCase().includes(q))
    }

    return res.status(200).json({ ok: true, videos: filtered.slice(0, 20) })
  } catch (err: any) {
    return res.status(200).json({ ok: true, videos: [] })
  }
}
