/**
 * Local Operations — frontend types (Phase B30).
 */
export type LocalRuntimeProfile = 'safe_local' | 'live_validation' | 'intensive_debug' | 'disabled'
export type RiskLevel = 'low' | 'moderate' | 'high' | 'unsafe'

export interface OperationalWarningDto { code: string; severity: 'info' | 'warning' | 'critical'; message: string }

export interface VolumeEstimateDto {
  providerCallsPerHour: number
  snapshotsPerHourCap: number
  projectedWritesPerHour: number
  projectedDailyWrites: number
  projectedReadsPerHour: number
  projectedDailyReads: number
  riskLevel: RiskLevel
  notes: string[]
}

export interface LocalOperationsStatusDto {
  profile: LocalRuntimeProfile
  profileRecommendation: { profile: LocalRuntimeProfile; description: string; recommendedFlags: Record<string, boolean> }
  flags: Record<string, boolean>
  flagMismatches: string[]
  estimate: VolumeEstimateDto
  riskLevel: RiskLevel
  warnings: OperationalWarningDto[]
  panelEnabled: boolean
  generatedAt: string
}

export interface ProviderUsageDto {
  limits: { perMinute: number; perHour: number }
  records: { provider: string; operation: string; minuteCount: number; hourCount: number; count: number; blockedCount: number; lastCallAt: string | null; lastBlockedAt: string | null }[]
  nearLimit: boolean
  generatedAt: string
}

export interface SnapshotGuardDto {
  limits: { minIntervalSeconds: number; maxPerFixturePerMatch: number }
  trackedFixtures: number
  totalWrites: number
  totalSkips: number
  skipReasons: Record<string, number>
  generatedAt: string
}

export interface CoverageDto {
  fixturesLive: number
  fixturesWithSnapshot: number
  fixturesWithoutSnapshot: number
  quality: { rich: number; partial: number; poor: number; unknown: number }
  staleSnapshots: number
  lowCoverageLeagues: { league: string; live: number; withSnapshot: number }[]
  guardMetrics?: GuardMetricsDto
  limitations: string[]
  generatedAt: string
}

export type GuardMode = 'observe' | 'enforce'

export interface GuardMetricsDto {
  guardMode: GuardMode
  recommendedGuardMode: GuardMode
  providerGuardEnabled: boolean
  snapshotGuardEnabled: boolean
  fixtureCapEnabled: boolean
  retentionEnabled: boolean
  retentionDryRun: boolean
  providerCallsAllowed: number
  providerCallsBlocked: number
  fixturesObserved: number
  fixturesSkippedByCap: number
  snapshotsWritten: number
  snapshotsSkippedDuplicate: number
  snapshotsSkippedInterval: number
  snapshotsSkippedMaxPerFixture: number
  snapshotsSkippedNoRelevantChange: number
  snapshotsProtectedForReplay: number
  retentionCandidates: number
  retentionProtected: number
  lastProviderBlockAt: string | null
  lastSnapshotSkipAt: string | null
  lastGuardBlockAt: string | null
  recommendedAction: string | null
  generatedAt: string
}

export interface SnapshotRetentionPlanDto {
  enabled: boolean
  dryRun: boolean
  scanned: number
  byCategory: Record<string, number>
  candidates: number
  protectedRecords: number
  wouldDelete: number
  oldestCandidateAgeDays: number | null
  thresholds: { rawDays: number; importantDays: number }
  limitations: string[]
  generatedAt: string
}

export interface SnapshotRetentionRunResultDto {
  enabled: boolean
  dryRun: boolean
  candidates: number
  protectedRecords: number
  wouldDelete: number
  deleted: number
  limitations: string[]
  generatedAt: string
}

// ── B32: snapshot lifecycle + persistent metrics ─────────────────────────────

export type SnapshotLifecycleStateDto =
  | 'active' | 'protected' | 'marked_for_deletion' | 'soft_deleted' | 'hard_deleted' | 'deletion_blocked'

export type SnapshotRetentionModeDto = 'dry_run' | 'mark_only' | 'soft_delete' | 'hard_delete'

export interface SnapshotRetentionCandidateDto {
  snapshotId: string
  fixtureId: string
  capturedAt: string | null
  category: string
  lifecycleState: SnapshotLifecycleStateDto
  protectionReasons: string[]
  eligibleForSoftDelete: boolean
  eligibleForHardDelete: boolean
  ageDays: number
  dataQuality: string
  limitations: string[]
}

export interface SnapshotRetentionPlanV2Dto {
  enabled: boolean
  dryRun: boolean
  requestedMode: SnapshotRetentionModeDto
  effectiveMode: SnapshotRetentionModeDto
  downgraded: boolean
  downgradeReason: string | null
  scanned: number
  protectedRecords: number
  candidates: number
  byLifecycleState: Record<string, number>
  topCandidates: SnapshotRetentionCandidateDto[]
  thresholds: { rawDays: number; importantDays: number }
  requireMarkBeforeDelete: boolean
  limitations: string[]
  generatedAt: string
}

export interface SnapshotRetentionRunDto {
  id: string
  mode: SnapshotRetentionModeDto
  requestedBy: string | null
  startedAt: string
  completedAt: string | null
  scanned: number
  protectedRecords: number
  candidates: number
  marked: number
  softDeleted: number
  hardDeleted: number
  blocked: number
  errors: string[]
  limitations: string[]
}

export interface LocalOpsMetricsSnapshotDto {
  id: string
  capturedAt: string
  profile: string
  guardMode: string
  providerCallsAllowed: number
  providerCallsBlocked: number
  snapshotsWritten: number
  snapshotsSkippedDuplicate: number
  snapshotsSkippedInterval: number
  snapshotsSkippedMax: number
  fixturesSkippedByCap: number
  readBudgetUsed: number
  writeBudgetUsed: number
  riskLevel: string
  warnings: number
}

export interface LocalOpsMetricsHistoryDto {
  enabled: boolean
  items: LocalOpsMetricsSnapshotDto[]
  limitations: string[]
  generatedAt: string
}

export interface WorkerDto {
  name: string
  enabledByEnv: boolean
  running: boolean
  paused: boolean
  pausable: boolean
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastErrorSafeMessage: string | null
  writesEnabled: boolean
  dangerous: boolean
  recommendedLocalState: 'off' | 'limited' | 'on'
}

export const RISK_LABEL: Record<RiskLevel, string> = { low: 'Baixo', moderate: 'Moderado', high: 'Alto', unsafe: 'Inseguro' }
export const RISK_TONE: Record<RiskLevel, string> = {
  low: 'bg-[#13B8A6]/12 border-[#2DD4BF]/25 text-[#7FE9DC]',
  moderate: 'bg-sky-500/10 border-sky-400/20 text-sky-200/85',
  high: 'bg-amber-500/8 border-amber-400/15 text-amber-100/75',
  unsafe: 'bg-rose-500/10 border-rose-400/25 text-rose-200/85',
}
