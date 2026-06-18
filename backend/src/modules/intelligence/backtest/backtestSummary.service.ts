/**
 * Backtest Summary (Phase B14) — honest aggregation of simulated signals.
 * ─────────────────────────────────────────────────────────────────────────────
 * usefulRate = confirmed + confirmed_partial. failedRate excludes
 * unknown/not_evaluable. Rates computed over DECISIVE outcomes only. Best/worst
 * lists carry sampleQuality and are not "ranked" when the sample is tiny.
 */
import type { BacktestSignalResult, BacktestSummary, BacktestDataCoverage } from './backtest.types.js'
import type { ContextBreakdownSample } from '../contracts/learning.types.js'
import { sampleQualityOf } from '../learning/learningStats.util.js'
import { minuteWindowOf, minuteWindowLabel } from '../learning/minuteWindow.util.js'
import { contextKey } from '../learning/contextKey.util.js'

interface Bucket { key: string; label: string; useful: number; failed: number; unknown: number; decisive: number }

function ensure(map: Map<string, Bucket>, key: string, label: string): Bucket {
  let b = map.get(key)
  if (!b) { b = { key, label, useful: 0, failed: 0, unknown: 0, decisive: 0 }; map.set(key, b) }
  return b
}
function addOutcome(b: Bucket, outcome: BacktestSignalResult['estimatedOutcome']): void {
  if (outcome === 'not_evaluable') return
  b.decisive++
  if (outcome === 'confirmed' || outcome === 'confirmed_partial') b.useful++
  else if (outcome === 'failed') b.failed++
  else b.unknown++
}
function rate(n: number, d: number): number | null { return d <= 0 ? null : Math.round((n / d) * 1000) / 1000 }
function toSample(b: Bucket): ContextBreakdownSample {
  return {
    contextKey: b.key, label: b.label, sampleSize: b.decisive,
    usefulRate: rate(b.useful, b.decisive), failedRate: rate(b.failed, b.decisive), unknownRate: rate(b.unknown, b.decisive),
    sampleQuality: sampleQualityOf(b.decisive),
  }
}
function topBy(map: Map<string, Bucket>, metric: 'useful' | 'failed', n = 3): ContextBreakdownSample[] {
  return [...map.values()].filter(b => b.decisive >= 1).map(toSample).sort((a, b) => {
    const av = (metric === 'useful' ? a.usefulRate : a.failedRate) ?? -1
    const bv = (metric === 'useful' ? b.usefulRate : b.failedRate) ?? -1
    if (bv !== av) return bv - av
    return b.sampleSize - a.sampleSize
  }).slice(0, n)
}

export function buildBacktestSummary(results: BacktestSignalResult[], coverage: BacktestDataCoverage): BacktestSummary {
  let confirmed = 0, confirmedPartial = 0, failed = 0, unknown = 0, notEvaluable = 0
  let triggered = 0, confSum = 0, confN = 0, minSum = 0, minN = 0
  const byMinute = new Map<string, Bucket>()
  const byCompetition = new Map<string, Bucket>()
  const missing = new Map<string, number>()
  const blocked = new Map<string, number>()

  for (const r of results) {
    if (r.wouldTrigger) {
      triggered++
      if (r.confidenceAtTrigger != null) { confSum += r.confidenceAtTrigger; confN++ }
      if (r.minute != null) { minSum += r.minute; minN++ }
      switch (r.estimatedOutcome) {
        case 'confirmed': confirmed++; break
        case 'confirmed_partial': confirmedPartial++; break
        case 'failed': failed++; break
        case 'unknown': unknown++; break
        case 'not_evaluable': notEvaluable++; break
      }
      const w = minuteWindowOf(r.minute, null)
      addOutcome(ensure(byMinute, contextKey.minuteWindow(w), minuteWindowLabel(w)), r.estimatedOutcome)
      addOutcome(ensure(byCompetition, contextKey.competition(r.leagueName), r.leagueName), r.estimatedOutcome)
    } else {
      for (const m of r.missingConditions) missing.set(m, (missing.get(m) || 0) + 1)
      for (const b of r.blockedReasons) blocked.set(b, (blocked.get(b) || 0) + 1)
    }
  }

  const decisive = confirmed + confirmedPartial + failed + unknown
  return {
    fixturesAnalyzed: results.length,
    signalsTriggered: triggered,
    confirmed, confirmedPartial, failed, unknown, notEvaluable,
    usefulRate: rate(confirmed + confirmedPartial, decisive),
    failedRate: rate(failed, decisive),
    unknownRate: rate(unknown, decisive),
    avgConfidence: confN > 0 ? Math.round((confSum / confN) * 10) / 10 : null,
    avgTriggerMinute: minN > 0 ? Math.round((minSum / minN) * 10) / 10 : null,
    bestMinuteWindows: topBy(byMinute, 'useful'),
    worstMinuteWindows: topBy(byMinute, 'failed'),
    bestCompetitions: topBy(byCompetition, 'useful'),
    weakContexts: topBy(byCompetition, 'failed'),
    commonMissingConditions: [...missing.entries()].map(([condition, count]) => ({ condition, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    commonBlockedReasons: [...blocked.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    sampleQuality: sampleQualityOf(decisive),
    dataCoverage: coverage,
  }
}
