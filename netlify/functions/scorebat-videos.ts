/**
 * ScoreBat Videos — free highlight videos for football matches.
 * Uses the public v1 API (no token required).
 */
export default async (req: Request) => {
  const url = new URL(req.url)
  const team = url.searchParams.get('team') || ''

  try {
    const res = await fetch('https://www.scorebat.com/video-api/v1/')
    if (!res.ok) {
      return Response.json({ ok: false, code: 'SCOREBAT_ERROR' }, { status: 502 })
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

    return Response.json({
      ok: true,
      source: 'scorebat',
      count: normalized.length,
      videos: normalized,
    }, { headers: { 'Cache-Control': 'public, max-age=1800' } })
  } catch (err: any) {
    return Response.json({ ok: false, message: err.message }, { status: 500 })
  }
}
