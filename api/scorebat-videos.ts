import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * ScoreBat Videos — free highlight videos for football matches.
 * Uses the public v1 API (no token required).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url)
  const team = (req.query.team as string || '') || ''

  try {
    const res = await fetch('https://www.scorebat.com/video-api/v1/')
    if (!res.ok) {
      return res.status(502).json({ ok: false, code: 'SCOREBAT_ERROR' })
    }

    const videos = await res.json()
    let filtered = videos

    if (team) {
      const q = team.toLowerCase()
      filtered = videos.filter((v: any) =>
        v.title?.toLowerCase().includes(q) ||
        v.side1?.name?.toLowerCase().includes(q) ||
        v.side2?.name?.toLowerCase().includes(q)
      )
    }

    const normalized = filtered.slice(0, 10).map((v: any) => ({
      title: v.title,
      competition: v.competition?.name || '',
      thumbnail: v.thumbnail,
      url: v.url,
      embed: v.videos?.[0]?.embed,
      date: v.date,
      side1: v.side1?.name,
      side2: v.side2?.name,
    }))

    return res.status(200).json({
      ok: true,
      source: 'scorebat',
      count: normalized.length,
      videos: normalized,
    }, { headers: { 'Cache-Control': 'public, max-age=1800' } })
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err.message })
  }
}
