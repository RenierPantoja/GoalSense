export type ControlPlaneComparisonStatus =
  | 'in_sync'
  | 'slightly_delayed'
  | 'stale'
  | 'missing_from_control_plane'
  | 'local_worker_inactive'
  | 'firebase_unavailable'
  | 'unknown'

export interface ControlPlaneComparison {
  status: ControlPlaneComparisonStatus
  localWorkerRunId: string | null
  controlPlaneWorkerRunId: string | null
  localHeartbeatAt: string | null
  controlPlaneHeartbeatAt: string | null
  lagMs: number | null
  reasons: string[]
  limitations: string[]
}

function latestRun(status: any): any | null {
  return status?.runs?.[0] ?? status?.workerRuns?.[0] ?? null
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

export function detectControlPlaneLag(localHeartbeatAt: string | null, controlPlaneHeartbeatAt: string | null): number | null {
  const local = timestamp(localHeartbeatAt)
  const control = timestamp(controlPlaneHeartbeatAt)
  if (local === null || control === null) return null
  return Math.max(0, local - control)
}

export function compareLocalWorkerStatusWithControlPlane(localStatus: any, controlPlaneStatus: any): ControlPlaneComparison {
  const localRun = latestRun(localStatus)
  const controlRun = latestRun(controlPlaneStatus)
  const localWorkerRunId = localRun?.id ?? null
  const controlPlaneWorkerRunId = controlRun?.id ?? null
  const localHeartbeatAt = localRun?.heartbeatAt ?? null
  const controlPlaneHeartbeatAt = controlRun?.heartbeatAt ?? null
  const lagMs = detectControlPlaneLag(localHeartbeatAt, controlPlaneHeartbeatAt)
  const reasons: string[] = []

  let status: ControlPlaneComparisonStatus = 'unknown'
  if (!localRun && !controlRun) {
    status = 'local_worker_inactive'
    reasons.push('No local or control-plane worker run is visible.')
  } else if (localRun && !controlRun) {
    status = 'missing_from_control_plane'
    reasons.push('Local worker run is not visible from the control plane yet.')
  } else if (!localRun && controlRun) {
    status = 'in_sync'
    reasons.push('Control plane has persisted historical state and no active local worker was provided.')
  } else if (localWorkerRunId !== controlPlaneWorkerRunId) {
    status = 'stale'
    reasons.push('Latest worker run id differs between local status and control plane.')
  } else if (lagMs !== null && lagMs > 180000) {
    status = 'stale'
    reasons.push('Control-plane heartbeat lags local worker by more than 3 minutes.')
  } else if (lagMs !== null && lagMs > 60000) {
    status = 'slightly_delayed'
    reasons.push('Control-plane heartbeat is visible but slightly delayed.')
  } else {
    status = 'in_sync'
    reasons.push('Latest worker run and heartbeat are visible from the control plane.')
  }

  return {
    status,
    localWorkerRunId,
    controlPlaneWorkerRunId,
    localHeartbeatAt,
    controlPlaneHeartbeatAt,
    lagMs,
    reasons,
    limitations: ['Comparison is diagnostic only and does not start, stop, or mutate worker state.'],
  }
}

export function compareLatestDailyReportVisibility(controlPlaneStatus: any): boolean {
  return !!(controlPlaneStatus?.latestDailyReport || controlPlaneStatus?.data?.latestDailyReport)
}

export function compareLatestCausalCasesVisibility(controlPlaneStatus: any): boolean {
  const cases = controlPlaneStatus?.latestCausalCases ?? controlPlaneStatus?.data?.latestCausalCases ?? []
  return Array.isArray(cases) && cases.length > 0
}

export function explainControlPlaneMismatch(comparison: ControlPlaneComparison): string[] {
  if (comparison.status === 'in_sync') return comparison.reasons
  return [
    ...comparison.reasons,
    'Check Firebase persistence, public read configuration, and control-plane freshness before treating UI state as live.',
  ]
}
