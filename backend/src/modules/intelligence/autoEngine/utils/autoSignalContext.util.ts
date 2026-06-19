/**
 * Auto Engine context helpers (Phase B19) — pure, no side effects.
 */
import type { DataQuality, SampleQuality } from '../../contracts/learning.types.js'
import type { ConfidenceBand } from '../autoEngine.types.js'

const QUALITY_RANK: Record<SampleQuality, number> = { insufficient: 0, low: 1, moderate: 2, strong: 3 }
export function sampleQualityRank(q: SampleQuality): number { return QUALITY_RANK[q] ?? 0 }
export function meetsSampleQuality(q: SampleQuality, min: SampleQuality): boolean {
  return sampleQualityRank(q) >= sampleQualityRank(min)
}

/** Flatten a LiveMatchStats-like object to a numeric map (drops undefined/null). */
export function flattenStats(stats: Record<string, unknown> | null | undefined): Record<string, number> | null {
  if (!stats) return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

const OFFENSIVE = new Set(['goal', 'own_goal', 'penalty_scored', 'shot_on_target', 'shot_off_target', 'corner', 'dangerous_attack'])
/** Count offensive events within the last `window` minutes (real events only). */
export function recentOffensiveCount(events: any[] | null | undefined, minute: number | null, window = 10): number {
  if (!Array.isArray(events) || events.length === 0 || minute == null) return 0
  const start = minute - window
  return events.filter(e => typeof e?.minute === 'number' && e.minute >= start && e.minute <= minute && OFFENSIVE.has(e.type)).length
}

/** Band derives from final score, but is CAPPED by sample quality (honest). */
export function confidenceBandFor(score: number, sampleQuality: SampleQuality, dataQuality: DataQuality): ConfidenceBand {
  if (dataQuality === 'poor' || dataQuality === 'unknown') return 'insufficient_data'
  if (sampleQuality === 'insufficient') return score >= 70 ? 'medium' : 'low'
  let band: ConfidenceBand = score >= 75 ? 'high' : score >= 60 ? 'medium' : 'low'
  // Cap: never claim "high" on a low/moderate sample.
  if (band === 'high' && (sampleQuality === 'low' || sampleQuality === 'moderate')) band = 'medium'
  return band
}

export function statusFromScore(score: number, minScore: number, sampleQuality: SampleQuality): 'candidate' | 'watch' | 'strong' {
  if (score >= Math.max(75, minScore + 15) && (sampleQuality === 'moderate' || sampleQuality === 'strong')) return 'strong'
  if (score >= minScore) return 'watch'
  return 'candidate'
}
