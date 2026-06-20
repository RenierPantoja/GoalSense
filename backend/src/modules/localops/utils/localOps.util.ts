/**
 * Local Operations pure helpers (Phase B30) — env-free, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Profile recommendations, provider-usage limit evaluation, snapshot-write
 * decisions, and a volume/risk estimator. No I/O, no env, no mutation of inputs.
 */
export type LocalRuntimeProfile = 'safe_local' | 'live_validation' | 'intensive_debug' | 'disabled'

export interface ProfileRecommendation {
  profile: LocalRuntimeProfile
  description: string
  /** Recommended state of dangerous/cost flags (true = should be ON). */
  recommendedFlags: Record<string, boolean>
}

export const DANGEROUS_FLAGS = [
  'ENABLE_AUTO_ALERT_CREATE', 'ENABLE_AUTO_ENGINE_TO_ALERTS', 'ENABLE_AUTO_ENGINE_WRITE',
  'TELEGRAM_ENABLED', 'ODDS_ENABLED',
] as const

export function profileRecommendation(profile: LocalRuntimeProfile): ProfileRecommendation {
  const allOff = { LIVE_WORKER_ENABLED: false, PATTERN_WORKER_ENABLED: false, RESOLUTION_WORKER_ENABLED: false, ENABLE_AUTO_ENGINE_WRITE: false, ENABLE_AUTO_ALERT_CREATE: false, ENABLE_AUTO_ENGINE_TO_ALERTS: false, TELEGRAM_ENABLED: false, ODDS_ENABLED: false, ENABLE_ALERT_EXPORT: false }
  switch (profile) {
    case 'safe_local':
      return { profile, description: 'Workers críticos off, leitura/snapshot limitados, auto engine read-only, sem auto-create/export.', recommendedFlags: { ...allOff } }
    case 'live_validation':
      return { profile, description: 'Coleta ao vivo limitada (max ligas/jogos, snapshot throttled). Workers com limites; auto-create off.', recommendedFlags: { ...allOff, LIVE_WORKER_ENABLED: true } }
    case 'intensive_debug':
      return { profile, description: 'Apenas manual, logs detalhados. Nunca default. Workers off; ligar manualmente.', recommendedFlags: { ...allOff } }
    case 'disabled':
    default:
      return { profile: 'disabled', description: 'Sem workers.', recommendedFlags: { ...allOff } }
  }
}

/** Dangerous flags that are ON but the profile recommends OFF (precedence: explicit env wins). */
export function flagMismatches(profile: LocalRuntimeProfile, actual: Record<string, boolean>): string[] {
  const rec = profileRecommendation(profile).recommendedFlags
  const out: string[] = []
  for (const f of DANGEROUS_FLAGS) {
    if (actual[f] === true && rec[f] === false) out.push(f)
  }
  return out
}

// ── Provider usage limit evaluation ──────────────────────────────────────────

export interface UsageLimitInput {
  minuteCount: number
  hourCount: number
  maxPerMinute: number
  maxPerHour: number
}
export interface UsageLimitResult { allowed: boolean; reason: string | null }

export function evaluateUsageLimit(i: UsageLimitInput): UsageLimitResult {
  if (i.minuteCount >= i.maxPerMinute) return { allowed: false, reason: 'minute_limit' }
  if (i.hourCount >= i.maxPerHour) return { allowed: false, reason: 'hour_limit' }
  return { allowed: true, reason: null }
}

// ── Snapshot write decision ──────────────────────────────────────────────────

export interface SnapshotState {
  minute: number | null
  status: string
  scoreHome: number
  scoreAway: number
  /** Aggregate signal of meaningful stats (shots/corners/cards sum, or null). */
  eventsCount?: number | null
  statsFingerprint?: string | null
}

export interface SnapshotDecisionInput {
  current: SnapshotState
  last: { state: SnapshotState; atMs: number } | null
  nowMs: number
  minIntervalSeconds: number
  countThisMatch: number
  maxPerMatch: number
}
export interface SnapshotDecision {
  shouldWrite: boolean
  reason: string | null
  skippedReason: string | null
  relevantChange: boolean
}

/** Deterministic fingerprint of the meaningful parts of a snapshot. */
export function snapshotHash(s: SnapshotState): string {
  const win = s.minute == null ? 'na' : String(Math.floor(s.minute / 5)) // 5-min window
  return [s.status, s.scoreHome, s.scoreAway, win, s.eventsCount ?? 'na', s.statsFingerprint ?? 'na'].join('|')
}

/** Is the change between two states relevant enough to persist a new snapshot? */
export function isRelevantChange(cur: SnapshotState, last: SnapshotState | null): boolean {
  if (!last) return true
  if (cur.status !== last.status) return true
  if (cur.scoreHome !== last.scoreHome || cur.scoreAway !== last.scoreAway) return true
  if ((cur.eventsCount ?? 0) !== (last.eventsCount ?? 0)) return true
  if ((cur.statsFingerprint ?? null) !== (last.statsFingerprint ?? null)) return true
  // Minute-window advance (every 5') is relevant for replay granularity.
  const cw = cur.minute == null ? -1 : Math.floor(cur.minute / 5)
  const lw = last.minute == null ? -1 : Math.floor(last.minute / 5)
  if (cw !== lw) return true
  return false
}

export function decideSnapshotWrite(i: SnapshotDecisionInput): SnapshotDecision {
  if (i.countThisMatch >= i.maxPerMatch) {
    return { shouldWrite: false, reason: null, skippedReason: 'max_per_match_reached', relevantChange: false }
  }
  const relevant = isRelevantChange(i.current, i.last?.state ?? null)
  if (!relevant) {
    return { shouldWrite: false, reason: null, skippedReason: 'no_relevant_change', relevantChange: false }
  }
  if (i.last) {
    const elapsed = (i.nowMs - i.last.atMs) / 1000
    // A score/status change always passes; minute/stats-only changes respect the min interval.
    const hardChange = i.current.status !== i.last.state.status
      || i.current.scoreHome !== i.last.state.scoreHome || i.current.scoreAway !== i.last.state.scoreAway
    if (!hardChange && elapsed < i.minIntervalSeconds) {
      return { shouldWrite: false, reason: null, skippedReason: 'min_interval_not_elapsed', relevantChange: true }
    }
  }
  return { shouldWrite: true, reason: 'relevant_change', skippedReason: null, relevantChange: true }
}

// ── Cost / volume estimator (operational, not monetary) ──────────────────────

export type RiskLevel = 'low' | 'moderate' | 'high' | 'unsafe'

export interface VolumeEstimateInput {
  liveFixtures: number
  intervalSeconds: number
  snapshotsPerFixturePerMatch: number
  providerCallsPerRun: number
  writeBudgetPerHour: number
  readBudgetPerHour: number
}
export interface VolumeEstimate {
  providerCallsPerHour: number
  snapshotsPerHourCap: number
  projectedWritesPerHour: number
  projectedDailyWrites: number
  projectedReadsPerHour: number
  projectedDailyReads: number
  riskLevel: RiskLevel
  notes: string[]
}

export function estimateVolume(i: VolumeEstimateInput): VolumeEstimate {
  const runsPerHour = i.intervalSeconds > 0 ? Math.floor(3600 / i.intervalSeconds) : 0
  const providerCallsPerHour = runsPerHour * Math.max(0, i.providerCallsPerRun)
  // Snapshot writes are bounded by the per-match cap (guard) — use the lesser of cap vs naive runs.
  const naiveSnapshots = runsPerHour * Math.max(0, i.liveFixtures)
  const cappedSnapshots = i.liveFixtures * Math.max(0, i.snapshotsPerFixturePerMatch)
  const projectedWritesPerHour = Math.min(naiveSnapshots, cappedSnapshots || naiveSnapshots)
  const projectedReadsPerHour = providerCallsPerHour + projectedWritesPerHour // coarse proxy
  const notes: string[] = []
  let risk: RiskLevel = 'low'
  const writeRatio = i.writeBudgetPerHour > 0 ? projectedWritesPerHour / i.writeBudgetPerHour : 1
  const readRatio = i.readBudgetPerHour > 0 ? projectedReadsPerHour / i.readBudgetPerHour : 1
  const worst = Math.max(writeRatio, readRatio)
  if (worst >= 1) { risk = 'unsafe'; notes.push('Volume projetado excede o orçamento por hora.') }
  else if (worst >= 0.75) { risk = 'high'; notes.push('Volume projetado próximo do orçamento.') }
  else if (worst >= 0.4) { risk = 'moderate' }
  if (i.liveFixtures === 0) notes.push('Sem jogos ao vivo — volume zero.')
  return {
    providerCallsPerHour,
    snapshotsPerHourCap: cappedSnapshots,
    projectedWritesPerHour,
    projectedDailyWrites: projectedWritesPerHour * 24,
    projectedReadsPerHour,
    projectedDailyReads: projectedReadsPerHour * 24,
    riskLevel: risk,
    notes,
  }
}

// ── Guard mode resolution (Phase B31) ───────────────────────────────────────

export type GuardMode = 'observe' | 'enforce'

/**
 * Effective guard mode. Explicit env mode ALWAYS wins; the profile only suggests.
 * (See LIVE_PIPELINE_GUARD_INTEGRATION.md for the precedence rationale.)
 */
export function resolveGuardMode(_profile: LocalRuntimeProfile, envMode: GuardMode): GuardMode {
  return envMode === 'enforce' ? 'enforce' : 'observe'
}

/** Recommended (not enforced) guard mode for a runtime profile. */
export function recommendedGuardMode(profile: LocalRuntimeProfile): GuardMode {
  switch (profile) {
    case 'live_validation': return 'enforce'
    case 'safe_local':
    case 'intensive_debug':
    case 'disabled':
    default: return 'observe'
  }
}

// ── Snapshot retention classification (Phase B31) ────────────────────────────

export type RetentionCategory =
  | 'raw'
  | 'important_for_alert'
  | 'important_for_backtest'
  | 'important_for_replay'
  | 'promoted_alert_related'
  | 'learning_related'

export interface RetentionLinkage {
  linkedToPromotedAlert?: boolean
  linkedToAlert?: boolean
  linkedToOutcome?: boolean
  linkedToBacktest?: boolean
  linkedToReplay?: boolean
  linkedToLearning?: boolean
}

export interface RetentionDecisionInput {
  ageDays: number
  linkage: RetentionLinkage
  retentionDaysRaw: number
  retentionDaysImportant: number
}
export interface RetentionDecision {
  category: RetentionCategory
  protectedRecord: boolean
  wouldDelete: boolean
  reason: string
}

/**
 * Classify a snapshot for retention. ANY linkage to alert/outcome/backtest/replay/
 * learning/promoted-alert protects the record (never a delete candidate in this
 * foundation). Only old, unlinked `raw` snapshots beyond the raw window are
 * delete candidates — and even then, deletion is dry-run unless a safe delete
 * backend exists. When in doubt, protect.
 */
export function classifySnapshotRetention(i: RetentionDecisionInput): RetentionDecision {
  const l = i.linkage || {}
  if (l.linkedToPromotedAlert) return { category: 'promoted_alert_related', protectedRecord: true, wouldDelete: false, reason: 'linked_to_promoted_alert' }
  if (l.linkedToAlert || l.linkedToOutcome) return { category: 'important_for_alert', protectedRecord: true, wouldDelete: false, reason: 'linked_to_alert_or_outcome' }
  if (l.linkedToBacktest) return { category: 'important_for_backtest', protectedRecord: true, wouldDelete: false, reason: 'linked_to_backtest' }
  if (l.linkedToReplay) return { category: 'important_for_replay', protectedRecord: true, wouldDelete: false, reason: 'linked_to_replay' }
  if (l.linkedToLearning) return { category: 'learning_related', protectedRecord: true, wouldDelete: false, reason: 'linked_to_learning' }
  // raw, unlinked
  if (i.ageDays > i.retentionDaysRaw) return { category: 'raw', protectedRecord: false, wouldDelete: true, reason: `raw_older_than_${i.retentionDaysRaw}d` }
  return { category: 'raw', protectedRecord: false, wouldDelete: false, reason: 'raw_within_window' }
}

// ── Snapshot lifecycle helpers (Phase B32) — pure, protect-first ─────────────

import type {
  SnapshotLifecycleState, SnapshotProtectionReason, SnapshotRetentionMode,
} from '../snapshotLifecycle.types.js'

export interface ProtectionInput {
  ageDays: number
  rawRetentionDays: number
  linkedToAlert?: boolean
  linkedToOutcome?: boolean
  linkedToBacktest?: boolean
  linkedToReplay?: boolean
  linkedToLearning?: boolean
  linkedToPromotedAlert?: boolean
  hasImportantEvent?: boolean
  manualProtected?: boolean
  /** When false, the dependency could not be resolved → protect (unknown_dependency). */
  dependencyResolvable: boolean
}

export interface ProtectionResult {
  reasons: SnapshotProtectionReason[]
  protectedRecord: boolean
}

/**
 * Derive protection reasons for a snapshot. PROTECT-FIRST: any linkage, recent
 * age, evidence, manual flag, or an unresolvable dependency protects the record.
 * Never invents a link — only reports what was provided.
 */
export function deriveProtectionReasons(i: ProtectionInput): ProtectionResult {
  const reasons: SnapshotProtectionReason[] = []
  if (i.ageDays <= i.rawRetentionDays) reasons.push('recent_snapshot')
  if (i.linkedToPromotedAlert) reasons.push('linked_to_promoted_alert')
  if (i.linkedToAlert) reasons.push('linked_to_alert')
  if (i.linkedToOutcome) reasons.push('linked_to_outcome')
  if (i.linkedToBacktest) reasons.push('linked_to_backtest')
  if (i.linkedToReplay) reasons.push('linked_to_replay')
  if (i.linkedToLearning) reasons.push('linked_to_learning')
  if (i.hasImportantEvent) { reasons.push('important_event'); reasons.push('evidence_snapshot') }
  if (i.manualProtected) reasons.push('manual_protection')
  if (!i.dependencyResolvable) reasons.push('unknown_dependency')
  return { reasons, protectedRecord: reasons.length > 0 }
}

export interface LifecycleEligibilityInput {
  currentState: SnapshotLifecycleState
  protectedRecord: boolean
  ageDays: number
  rawRetentionDays: number
}
export interface LifecycleEligibility {
  eligibleForSoftDelete: boolean
  eligibleForHardDelete: boolean
  blocked: boolean
  blockedReason: string | null
}

/**
 * Compute what transitions a snapshot is eligible for. Protected snapshots and
 * unknown dependencies are never deletable. Hard-delete only from soft_deleted or
 * marked_for_deletion (and never on active/protected).
 */
export function evaluateLifecycleEligibility(i: LifecycleEligibilityInput): LifecycleEligibility {
  if (i.protectedRecord) return { eligibleForSoftDelete: false, eligibleForHardDelete: false, blocked: true, blockedReason: 'protected' }
  if (i.currentState === 'hard_deleted' || i.currentState === 'deletion_blocked') {
    return { eligibleForSoftDelete: false, eligibleForHardDelete: false, blocked: true, blockedReason: i.currentState }
  }
  const oldEnough = i.ageDays > i.rawRetentionDays
  const eligibleForSoftDelete = oldEnough && (i.currentState === 'active' || i.currentState === 'marked_for_deletion')
  const eligibleForHardDelete = i.currentState === 'soft_deleted' || i.currentState === 'marked_for_deletion'
  return { eligibleForSoftDelete, eligibleForHardDelete, blocked: false, blockedReason: null }
}

export interface RetentionModeFlags {
  retentionEnabled: boolean
  markEnabled: boolean
  softEnabled: boolean
  hardEnabled: boolean
}
export interface RetentionModeResolution {
  effectiveMode: SnapshotRetentionMode
  requestedMode: SnapshotRetentionMode
  downgraded: boolean
  reason: string | null
}

/**
 * Gate a requested retention mode by env flags. Always downgrades toward the
 * safest mode (dry_run). hard_delete requires its own explicit flag.
 */
export function resolveRetentionMode(requested: SnapshotRetentionMode, f: RetentionModeFlags): RetentionModeResolution {
  const safe = (mode: SnapshotRetentionMode, reason: string): RetentionModeResolution =>
    ({ effectiveMode: mode, requestedMode: requested, downgraded: mode !== requested, reason: mode !== requested ? reason : null })
  if (!f.retentionEnabled) return safe('dry_run', 'retention_disabled')
  if (requested === 'dry_run') return safe('dry_run', '')
  if (requested === 'mark_only') return f.markEnabled ? safe('mark_only', '') : safe('dry_run', 'mark_disabled')
  if (requested === 'soft_delete') return f.softEnabled ? safe('soft_delete', '') : safe('dry_run', 'soft_delete_disabled')
  if (requested === 'hard_delete') return f.hardEnabled ? safe('hard_delete', '') : safe('dry_run', 'hard_delete_disabled')
  return safe('dry_run', 'unknown_mode')
}

/** A doc without a lifecycle field is implicitly active. */
export function normalizeLifecycleState(v: unknown): SnapshotLifecycleState {
  const s = String(v || 'active')
  const valid: SnapshotLifecycleState[] = ['active', 'protected', 'marked_for_deletion', 'soft_deleted', 'hard_deleted', 'deletion_blocked']
  return (valid as string[]).includes(s) ? (s as SnapshotLifecycleState) : 'active'
}
