import { normalizeTeamName } from '@/features/providers/teamNameNormalizer'

export interface MatchHighlight {
  title: string
  competition: string
  thumbnail: string | null
  embed: string | null
  url: string | null
  date: string
}

export interface HighlightDebug {
  feedCount: number
  candidates: number
  reason: string
  normalizedHome: string
  normalizedAway: string
  firstTitles: string[]
  topSimilarities: { title: string; s1: string; s2: string; hScore: number; aScore: number; total: number }[]
}

export interface ResolveResult {
  highlights: MatchHighlight[]
  debug: HighlightDebug
}

export async function resolveHighlights(homeName: string, awayName: string): Promise<ResolveResult> {
  const homeNorm = normalizeTeamName(homeName)
  const awayNorm = normalizeTeamName(awayName)
  const emptyDebug: HighlightDebug = { feedCount: 0, candidates: 0, reason: '', normalizedHome: homeNorm, normalizedAway: awayNorm, firstTitles: [], topSimilarities: [] }

  try {
    if (import.meta.env.DEV) console.info('[highlights] start', { home: homeName, away: awayName, homeNorm, awayNorm })

    const res = await fetch('/api/scorebat-videos')
    if (!res.ok) return { highlights: [], debug: { ...emptyDebug, reason: `fetch failed: ${res.status}` } }

    const data = await res.json()
    const videos: any[] = Array.isArray(data) ? data : (data.videos || data.response || [])

    if (import.meta.env.DEV) console.info('[highlights] feed_count', videos.length)
    if (videos.length === 0) return { highlights: [], debug: { ...emptyDebug, reason: 'empty feed' } }

    const firstTitles = videos.slice(0, 10).map((v: any) => v.title || '')
    const allScores: HighlightDebug['topSimilarities'] = []
    const candidates: { video: any; score: number }[] = []

    for (const v of videos) {
      const title = (v.title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      const s1 = normalizeTeamName(v.side1?.name || '')
      const s2 = normalizeTeamName(v.side2?.name || '')

      let hScore = 0, aScore = 0

      // Home matching
      if (s1 && (s1 === homeNorm || s1.includes(homeNorm) || homeNorm.includes(s1))) hScore = 3
      else if (s2 && (s2 === homeNorm || s2.includes(homeNorm) || homeNorm.includes(s2))) hScore = 3
      else if (title.includes(homeNorm)) hScore = 2
      else if (homeNorm.length > 3 && title.includes(homeNorm.slice(0, 4))) hScore = 1

      // Away matching
      if (s2 && (s2 === awayNorm || s2.includes(awayNorm) || awayNorm.includes(s2))) aScore = 3
      else if (s1 && (s1 === awayNorm || s1.includes(awayNorm) || awayNorm.includes(s1))) aScore = 3
      else if (title.includes(awayNorm)) aScore = 2
      else if (awayNorm.length > 3 && title.includes(awayNorm.slice(0, 4))) aScore = 1

      const total = hScore + aScore
      allScores.push({ title: v.title || '', s1: v.side1?.name || '', s2: v.side2?.name || '', hScore, aScore, total })

      if (total >= 4) candidates.push({ video: v, score: total })
    }

    allScores.sort((a, b) => b.total - a.total)
    const topSims = allScores.slice(0, 5)

    if (import.meta.env.DEV) console.info('[highlights] top_similarities', topSims)

    if (candidates.length === 0) {
      return { highlights: [], debug: { feedCount: videos.length, candidates: 0, reason: 'no match (score < 4)', normalizedHome: homeNorm, normalizedAway: awayNorm, firstTitles, topSimilarities: topSims } }
    }

    candidates.sort((a, b) => b.score - a.score)
    const selected = candidates.slice(0, 3).map(c => ({
      title: c.video.title || '',
      competition: c.video.competition?.name || '',
      thumbnail: c.video.thumbnail || null,
      embed: c.video.videos?.[0]?.embed || null,
      url: c.video.url || c.video.matchviewUrl || null,
      date: c.video.date || '',
    }))

    if (import.meta.env.DEV) console.info('[highlights] selected', selected.length, selected[0]?.title)
    return { highlights: selected, debug: { feedCount: videos.length, candidates: candidates.length, reason: 'matched', normalizedHome: homeNorm, normalizedAway: awayNorm, firstTitles, topSimilarities: topSims } }
  } catch (err) {
    if (import.meta.env.DEV) console.info('[highlights] error', err)
    return { highlights: [], debug: { ...emptyDebug, reason: 'exception' } }
  }
}
