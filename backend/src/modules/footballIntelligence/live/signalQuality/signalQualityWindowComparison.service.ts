/**
 * Signal Quality Window Comparison — B72
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a cross-window comparison from persisted window reports. Observe only;
 * deltas are observational, never a probability and never used for decisions.
 */
import { createRepositories } from '../../../../repositories/index.js'
import type { SignalQualityWindowReport } from './signalQualityWindowReport.types.js'
import type {
  SignalQualityWindowComparison,
  WindowComparisonEntry,
} from './signalQualityWindowComparison.types.js'

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function buildSignalQualityWindowComparison(
  campaignId: string,
  reports: SignalQualityWindowReport[],
  maxWindows = 5,
): SignalQualityWindowComparison {
  // reports come newest-first; compare chronological order (oldest → newest).
  const recent = reports.slice(0, maxWindows).slice().reverse()
  const windows: WindowComparisonEntry[] = recent.map(r => ({
    windowId: r.windowId,
    generatedAt: r.generatedAt,
    durationMinutes: r.durationMinutes,
    fixtures: r.fixtures,
    snapshots: r.snapshots,
    casesCreated: r.casesCreated,
    missingStatsRatio: r.missingStatsRatio,
    missingTimelineRatio: r.missingTimelineRatio,
    pendingOutcomeRatio: r.pendingOutcomeRatio,
    dataQualityScoreObservational: r.dataQualityScoreObservational,
  }))

  const latest = windows[windows.length - 1] ?? null
  const previous = windows.length >= 2 ? windows[windows.length - 2] : null

  const usefulCount = new Map<string, number>()
  const noisyCount = new Map<string, number>()
  for (const r of recent) {
    for (const u of r.usefulSignals || []) usefulCount.set(u.signalKind, (usefulCount.get(u.signalKind) || 0) + 1)
    for (const n of r.noisySignals || []) noisyCount.set(n.signalKind, (noisyCount.get(n.signalKind) || 0) + 1)
  }
  const recurring = (m: Map<string, number>) =>
    Array.from(m.entries()).map(([signalKind, windows]) => ({ signalKind: signalKind as any, windows })).sort((a, b) => b.windows - a.windows).slice(0, 5)

  const deltaDataQualityScore = latest && previous ? round(latest.dataQualityScoreObservational - previous.dataQualityScoreObservational) : null
  const deltaPendingOutcomeRatio = latest && previous ? round(latest.pendingOutcomeRatio - previous.pendingOutcomeRatio) : null
  const deltaMissingStatsRatio = latest && previous ? round(latest.missingStatsRatio - previous.missingStatsRatio) : null

  let trendNote = 'Single window so far; no cross-window trend yet (observational).'
  if (latest && previous) {
    const dir = deltaDataQualityScore === null || deltaDataQualityScore === 0 ? 'stable' : deltaDataQualityScore > 0 ? 'higher' : 'lower'
    trendNote = `Observational only: latest window data-quality is ${dir} vs previous (delta ${deltaDataQualityScore}). Not a probability or accuracy claim.`
  }

  return {
    id: `sqwc_${campaignId}_${Date.now()}`,
    campaignId,
    generatedAt: new Date().toISOString(),
    windowsCompared: windows.length,
    windows,
    deltaDataQualityScore,
    deltaPendingOutcomeRatio,
    deltaMissingStatsRatio,
    cumulativeCases: windows.reduce((s, w) => s + (w.casesCreated || 0), 0),
    recurringUsefulSignals: recurring(usefulCount),
    recurringNoisySignals: recurring(noisyCount),
    trendNote,
    limitations: [
      'Observe only; window comparison never drives automated decisions.',
      'Deltas are observational, NOT probability or accuracy.',
    ],
  }
}

export async function buildAndSaveWindowComparison(campaignId: string): Promise<SignalQualityWindowComparison | null> {
  const repos = createRepositories()
  const reports = await repos.intelligence.listSignalQualityWindowReports(50).catch(() => [])
  const scoped = reports.filter((r: SignalQualityWindowReport) => r.campaignId === campaignId)
  const comparison = buildSignalQualityWindowComparison(campaignId, scoped.length ? scoped : reports)
  await repos.intelligence.saveSignalQualityWindowComparison(comparison).catch(() => {})
  return comparison
}
