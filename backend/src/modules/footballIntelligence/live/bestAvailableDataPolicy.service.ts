import type { BestAvailableDataMode, EspnLiveFirstContext } from './espnLiveFirst.types.js'

export function classifyBestAvailableDataMode(
  hasPreMatchData: boolean,
  hasManualIntake: boolean,
  isLive: boolean,
  hasLiveEspnData: boolean,
  isPostMatch: boolean
): BestAvailableDataMode {
  if (isPostMatch) return 'post_match_only'
  if (isLive) {
    if (hasPreMatchData && hasLiveEspnData) return 'live_mixed'
    if (hasManualIntake && hasLiveEspnData) return 'manual_plus_live'
    if (hasLiveEspnData) return 'live_espn_only'
  }
  if (hasPreMatchData) return 'pre_match_full'
  return 'pre_match_limited'
}

export function shouldUseLiveFirstMode(matchStatus: string, hasEspnLiveData: boolean): boolean {
  const liveStatuses = ['in_progress', 'half_time', 'live']
  return liveStatuses.includes(matchStatus) && hasEspnLiveData
}

export function convertMissingDomainsToLimitations(missingDomains: string[], isLiveFirst: boolean): string[] {
  if (!isLiveFirst) return []
  return missingDomains.map(d => `Missing pre-match domain converted to limitation in live-first mode: ${d}`)
}

export function shouldBlockDueToMissingData(mode: BestAvailableDataMode, missingCriticalDomains: number): boolean {
  if (mode === 'live_espn_only' || mode === 'live_mixed' || mode === 'manual_plus_live') {
    return false // Live modes do not hard block on missing pre-match data
  }
  return missingCriticalDomains > 0
}

export function shouldContinueBestEffort(mode: BestAvailableDataMode): boolean {
  return mode === 'live_espn_only' || mode === 'live_mixed' || mode === 'manual_plus_live'
}

export function explainBestAvailableDataDecision(mode: BestAvailableDataMode, missingCount: number): string {
  if (mode === 'live_espn_only') {
    return 'Operating in live_espn_only mode. Pre-match data is missing, analysis is best-effort based on live events.'
  }
  if (mode === 'live_mixed') {
    return 'Operating in live_mixed mode. Pre-match and live data are both available.'
  }
  if (missingCount > 0) {
    return `Pre-match analysis is limited due to ${missingCount} missing critical domains.`
  }
  return 'Full data available.'
}
