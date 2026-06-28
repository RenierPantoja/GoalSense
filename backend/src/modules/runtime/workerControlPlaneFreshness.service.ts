export type ControlPlaneFreshnessStatus = 'fresh' | 'slightly_stale' | 'stale' | 'empty' | 'unknown'

export interface ControlPlaneFreshnessInput {
  now?: Date
  workerRuns?: Array<{ heartbeatAt?: string | null; updatedAt?: string | null; status?: string | null }>
  sessions?: Array<{ updatedAt?: string | null; startedAt?: string | null; status?: string | null }>
  fixtureStates?: Array<{ lastSnapshotAt?: string | null; updatedAt?: string | null }>
  dailyReports?: Array<{ generatedAt?: string | null; date?: string | null }>
  causalCases?: Array<{ createdAt?: string | null }>
  expectedUpdateSeconds?: number
}

export interface ControlPlaneFreshnessReport {
  latestWorkerHeartbeatAt: string | null
  latestSessionUpdatedAt: string | null
  latestSnapshotAt: string | null
  latestDailyReportAt: string | null
  latestCausalCaseAt: string | null
  freshnessStatus: ControlPlaneFreshnessStatus
  staleReasons: string[]
  nextExpectedUpdate: string | null
  lagMs: number | null
  limitations: string[]
}

function latestIso(values: Array<string | null | undefined>): string | null {
  return values
    .filter((value): value is string => !!value && !Number.isNaN(new Date(value).getTime()))
    .sort()
    .at(-1) ?? null
}

function ageMs(value: string | null, now: Date): number | null {
  if (!value) return null
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return null
  return Math.max(0, now.getTime() - ts)
}

export function buildWorkerControlPlaneFreshness(input: ControlPlaneFreshnessInput): ControlPlaneFreshnessReport {
  const now = input.now ?? new Date()
  const expectedUpdateSeconds = Math.max(30, input.expectedUpdateSeconds ?? 90)
  const latestWorkerHeartbeatAt = latestIso((input.workerRuns ?? []).map(run => run.heartbeatAt ?? run.updatedAt))
  const latestSessionUpdatedAt = latestIso((input.sessions ?? []).map(session => session.updatedAt ?? session.startedAt))
  const latestSnapshotAt = latestIso((input.fixtureStates ?? []).map(state => state.lastSnapshotAt ?? state.updatedAt))
  const latestDailyReportAt = latestIso((input.dailyReports ?? []).map(report => report.generatedAt ?? report.date))
  const latestCausalCaseAt = latestIso((input.causalCases ?? []).map(item => item.createdAt))
  const operationalLatest = latestIso([latestWorkerHeartbeatAt, latestSessionUpdatedAt, latestSnapshotAt])
  const anyData = !!latestIso([operationalLatest, latestDailyReportAt, latestCausalCaseAt])
  const operationalAgeMs = ageMs(operationalLatest, now)
  const staleReasons: string[] = []

  let freshnessStatus: ControlPlaneFreshnessStatus = 'unknown'
  if (!anyData) {
    freshnessStatus = 'empty'
    staleReasons.push('No persisted worker/session/report data is visible to the control plane.')
  } else if (operationalAgeMs === null) {
    freshnessStatus = 'stale'
    staleReasons.push('No recent worker heartbeat, session update, or snapshot is visible.')
  } else if (operationalAgeMs <= expectedUpdateSeconds * 1000 * 2) {
    freshnessStatus = 'fresh'
  } else if (operationalAgeMs <= expectedUpdateSeconds * 1000 * 6) {
    freshnessStatus = 'slightly_stale'
    staleReasons.push('Latest operational update is delayed beyond the expected polling window.')
  } else {
    freshnessStatus = 'stale'
    staleReasons.push('Latest operational update is old; treat active worker state as stale until refreshed.')
  }

  return {
    latestWorkerHeartbeatAt,
    latestSessionUpdatedAt,
    latestSnapshotAt,
    latestDailyReportAt,
    latestCausalCaseAt,
    freshnessStatus,
    staleReasons,
    nextExpectedUpdate: operationalLatest ? new Date(new Date(operationalLatest).getTime() + expectedUpdateSeconds * 1000).toISOString() : null,
    lagMs: operationalAgeMs,
    limitations: [
      'Freshness describes control-plane visibility only; it is not a prediction or accuracy signal.',
      'No active worker is not a failure by itself.',
      'Vercel observes persisted state and does not run worker loops.',
    ],
  }
}
