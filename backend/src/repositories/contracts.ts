/**
 * Repository Contracts (Phase E1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence-agnostic interfaces. Services should depend on these, not on
 * Prisma directly. Implementations live in repositories/prisma/ and
 * repositories/firebase/.
 *
 * These mirror the operations currently used by the services. They use
 * loosely-typed records (Record<string, any>) to avoid coupling to Prisma's
 * generated types during the migration foundation phase.
 */

export type Json = Record<string, any>

// ─── Pattern ─────────────────────────────────────────────────────────────────

export interface PatternRepository {
  listActive(userId: string): Promise<Json[]>
  listAll(userId: string): Promise<Json[]>
  findById(id: string, userId: string): Promise<Json | null>
  create(input: Json, userId: string): Promise<Json>
  update(id: string, patch: Json, userId: string): Promise<{ count: number }>
  archive(id: string, userId: string): Promise<{ count: number }>
}

// ─── Alert ───────────────────────────────────────────────────────────────────

export interface AlertRepository {
  list(filters: { userId: string; status?: string; patternId?: string; limit?: number }): Promise<Json[]>
  listForApprovalQueue(filters: { userId: string; minConfidence?: number; status?: string; sinceMs?: number; limit?: number }): Promise<Json[]>
  findById(id: string, userId: string): Promise<Json | null>
  findByFixtureIds(fixtureId: string): Promise<Json[]>
  findByDuplicateSignature(signature: string, sinceMs: number, userId: string): Promise<Json | null>
  findRecentByPatternFixture(patternId: string, fixtureId: string, sinceMs: number, userId: string): Promise<Json | null>
  create(input: Json, userId: string): Promise<Json>
  updateStatus(id: string, status: string): Promise<Json>
  listPending(userId: string, limit: number): Promise<Json[]>
  /** All alerts for a pattern, newest first. Unbounded in Prisma; capped in Firebase (see limit). Used by performance analytics. */
  listByPatternId(patternId: string, userId: string, limit?: number): Promise<Json[]>
  /** All alerts for a user, newest first. Unbounded in Prisma; capped in Firebase (see limit). Used by performance analytics. */
  listAllForUser(userId: string, limit?: number): Promise<Json[]>
}

// ─── Alert Resolution ──────────────────────────────────────────────────────

export interface AlertResolutionRepository {
  findByAlertId(alertId: string): Promise<Json | null>
  findByAlertIds(alertIds: string[]): Promise<Json[]>
  create(input: Json): Promise<Json>
  /** Atomic: update alert status + create resolution */
  resolveAlert(alertId: string, status: string, resolution: Json): Promise<Json>
}

// ─── Fixture ─────────────────────────────────────────────────────────────────

export interface FixtureRepository {
  findById(id: string): Promise<Json | null>
  findByProviderId(provider: string, providerFixtureId: string): Promise<Json | null>
  findByCanonicalKey(canonicalKey: string): Promise<Json | null>
  listLive(statuses: string[], limit?: number): Promise<Json[]>
  create(input: Json): Promise<Json>
  update(id: string, patch: Json): Promise<Json>
}

// ─── Live Snapshot ─────────────────────────────────────────────────────────

export interface LiveSnapshotRepository {
  findLatestByFixture(fixtureId: string): Promise<Json | null>
  findAfter(fixtureId: string, afterDate: Date, limit?: number): Promise<Json[]>
  listRecent(filters: { fixtureId?: string; limit?: number }): Promise<Json[]>
  create(input: Json): Promise<Json>
}

// ─── Provider Health ─────────────────────────────────────────────────────────

export interface ProviderHealthRepository {
  create(input: Json): Promise<Json>
  listRecent(filters: { provider?: string; limit?: number }): Promise<Json[]>
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export interface TelegramRepository {
  listChannels(userId: string): Promise<Json[]>
  findChannel(id: string, userId: string): Promise<Json | null>
  createChannel(input: Json, userId: string): Promise<Json>
  deleteChannel(id: string): Promise<void>
  updateChannelRules(id: string, rulesJson: string): Promise<Json>
  // Deliveries
  findDelivery(alertId: string, channelId: string, status?: string): Promise<Json | null>
  listDeliveries(filters: { userId: string; alertId?: string; limit?: number }): Promise<Json[]>
  createDelivery(input: Json): Promise<Json>
  updateDelivery(id: string, patch: Json): Promise<Json>
  findRecentDeliveryByChannel(channelId: string, sinceDate: Date): Promise<Json | null>
  countSentDeliveries(channelId: string, alertIds: string[]): Promise<number>
}

// ─── Odds ────────────────────────────────────────────────────────────────────

export interface OddsRepository {
  createSnapshot(input: Json): Promise<Json>
  listRecentSnapshots(fixtureId: string, limit?: number): Promise<Json[]>
  findAlertOddsContext(alertId: string, marketType: string): Promise<Json | null>
  createAlertOddsContext(input: Json): Promise<Json>
}

// ─── Performance Counters (E6.2) ──────────────────────────────────────────
export interface PerformanceRepository {
  /** Read one pattern's incremental counter, or null if none exists yet. */
  getPatternCounter(patternId: string, userId: string): Promise<Json | null>
  /** Read all pattern counters for a user. */
  listPatternCounters(userId: string): Promise<Json[]>
  /** Whether a given phase ('created' | 'resolved') was already applied for an alert. */
  hasProcessedAlert(alertId: string, phase: 'created' | 'resolved'): Promise<boolean>
  /** Idempotent: apply an alert creation to the counter (totalAlerts, per-alert breakdowns, sumConfidence). */
  onAlertCreated(input: { alertId: string; patternId: string; userId: string; confidence: number; momentumSource: string; dataQuality: string; provider: string }): Promise<{ applied: boolean; reason?: string }>
  /** Idempotent: apply a resolution to the counter (terminal bucket, useful, byResolutionType, rates). */
  applyResolutionToCounters(input: { alertId: string; patternId: string; userId: string; resolutionStatus: string; resolutionType: string | null }): Promise<{ applied: boolean; reason?: string }>
  /** Recompute a pattern's counter from raw alerts/resolutions (drift reconciliation). */
  rebuildPatternCounters(patternId: string, userId: string): Promise<Json | null>
}

// ─── Intelligence Memory (B12) ──────────────────────────────────────────────

import type {
  SignalLedgerEntry, AlertOutcomeRecord, SignalFailureAnalysis,
  MissedOpportunityRecord, LearningEvent, IntelligenceOverview,
} from '../modules/intelligence/contracts/intelligence.types.js'
import type {
  LearningAggregationRun, PatternLearningProfile, CompetitionLearningProfile,
  TeamLearningProfile, SignalContextStats, LearningRecommendation,
} from '../modules/intelligence/contracts/learning.types.js'
import type {
  BacktestRun, ReplayRun, PersistedBacktestSignalResult,
} from '../modules/intelligence/backtest/backtest.types.js'
import type {
  AutoEngineRun, AutoOpportunity, AutoOpportunityAction, AutoOpportunityUserState,
  AutoOpportunityPromotionPlan, ManualPromotedAlertLink,
  PromotedAlertOutcomeLink, AutoOpportunityOutcomeSummary,
} from '../modules/intelligence/autoEngine/autoEngine.types.js'

export interface IntelligenceRepository {
  // Signal Ledger
  createSignalLedgerEntry(entry: SignalLedgerEntry): Promise<SignalLedgerEntry>
  updateSignalLedgerEntry(id: string, patch: Partial<SignalLedgerEntry>): Promise<{ count: number }>
  getSignalLedgerEntryByAlertId(alertId: string): Promise<SignalLedgerEntry | null>
  listSignalLedgerEntries(filters: { patternId?: string; fixtureId?: string; limit?: number }): Promise<SignalLedgerEntry[]>
  // Alert Outcome
  createAlertOutcome(record: AlertOutcomeRecord): Promise<AlertOutcomeRecord>
  updateAlertOutcome(alertId: string, patch: Partial<AlertOutcomeRecord>): Promise<{ count: number }>
  getAlertOutcomeByAlertId(alertId: string): Promise<AlertOutcomeRecord | null>
  listAlertOutcomesByPattern(patternId: string, limit?: number): Promise<AlertOutcomeRecord[]>
  // Failure Analysis
  createFailureAnalysis(analysis: SignalFailureAnalysis): Promise<SignalFailureAnalysis>
  getFailureAnalysisByAlertId(alertId: string): Promise<SignalFailureAnalysis | null>
  listFailureAnalysesByPattern(patternId: string, limit?: number): Promise<SignalFailureAnalysis[]>
  // Missed Opportunity
  createMissedOpportunity(record: MissedOpportunityRecord): Promise<MissedOpportunityRecord>
  // Learning Events
  createLearningEvent(event: LearningEvent): Promise<LearningEvent>
  listLearningEventsByPattern(patternId: string, limit?: number): Promise<LearningEvent[]>
  getLearningEventById(id: string): Promise<LearningEvent | null>
  // Aggregate
  getOverview(): Promise<IntelligenceOverview>

  // ── B13: bulk reads for aggregation ────────────────────────────────────────
  listAllSignalLedgerEntries(limit?: number): Promise<SignalLedgerEntry[]>
  listAllAlertOutcomes(limit?: number): Promise<AlertOutcomeRecord[]>
  listAllFailureAnalyses(limit?: number): Promise<SignalFailureAnalysis[]>
  listRecentLearningEvents(limit?: number): Promise<LearningEvent[]>

  // ── B13: learning persistence ──────────────────────────────────────────────
  createLearningAggregationRun(run: LearningAggregationRun): Promise<LearningAggregationRun>
  updateLearningAggregationRun(id: string, patch: Partial<LearningAggregationRun>): Promise<{ count: number }>
  getLatestLearningAggregationRun(): Promise<LearningAggregationRun | null>

  upsertPatternLearningProfile(profile: PatternLearningProfile): Promise<PatternLearningProfile>
  getPatternLearningProfile(patternId: string): Promise<PatternLearningProfile | null>
  listPatternLearningProfiles(limit?: number): Promise<PatternLearningProfile[]>

  upsertCompetitionLearningProfile(profile: CompetitionLearningProfile): Promise<CompetitionLearningProfile>
  getCompetitionLearningProfile(key: string): Promise<CompetitionLearningProfile | null>
  listCompetitionLearningProfiles(limit?: number): Promise<CompetitionLearningProfile[]>

  upsertTeamLearningProfile(profile: TeamLearningProfile): Promise<TeamLearningProfile>
  getTeamLearningProfile(key: string): Promise<TeamLearningProfile | null>
  listTeamLearningProfiles(limit?: number): Promise<TeamLearningProfile[]>

  upsertSignalContextStats(stats: SignalContextStats): Promise<SignalContextStats>
  listSignalContextStats(limit?: number): Promise<SignalContextStats[]>

  createLearningRecommendation(rec: LearningRecommendation): Promise<LearningRecommendation>
  listLearningRecommendations(limit?: number): Promise<LearningRecommendation[]>

  // ── B14: backtest & replay (read-only simulation; no alerts) ────────────────
  createBacktestRun(run: BacktestRun): Promise<BacktestRun>
  updateBacktestRun(id: string, patch: Partial<BacktestRun>): Promise<{ count: number }>
  getBacktestRun(id: string): Promise<BacktestRun | null>
  listBacktestRuns(filters: { patternId?: string; limit?: number }): Promise<BacktestRun[]>
  createBacktestSignalResult(result: PersistedBacktestSignalResult): Promise<PersistedBacktestSignalResult>
  listBacktestSignalResults(runId: string, limit?: number): Promise<PersistedBacktestSignalResult[]>
  createReplayRun(run: ReplayRun): Promise<ReplayRun>
  getReplayRun(id: string): Promise<ReplayRun | null>
  listReplayRuns(filters: { patternId?: string; limit?: number }): Promise<ReplayRun[]>

  // ── B19: Automatic Engine (opportunities, not alerts) ───────────────────────
  createAutoEngineRun(run: AutoEngineRun): Promise<AutoEngineRun>
  updateAutoEngineRun(id: string, patch: Partial<AutoEngineRun>): Promise<{ count: number }>
  getAutoEngineRun(id: string): Promise<AutoEngineRun | null>
  getLatestAutoEngineRun(): Promise<AutoEngineRun | null>
  listAutoEngineRuns(limit?: number): Promise<AutoEngineRun[]>
  upsertAutoOpportunity(opp: AutoOpportunity): Promise<AutoOpportunity>
  getAutoOpportunity(id: string): Promise<AutoOpportunity | null>
  listAutoOpportunities(filters: { status?: string; type?: string; limit?: number }): Promise<AutoOpportunity[]>
  listAutoOpportunitiesByFixture(fixtureId: string, limit?: number): Promise<AutoOpportunity[]>

  // ── B21: opportunity actions / feedback / notes / user-state / promotion ────
  createAutoOpportunityAction(action: AutoOpportunityAction): Promise<AutoOpportunityAction>
  listAutoOpportunityActions(limit?: number): Promise<AutoOpportunityAction[]>
  listAutoOpportunityActionsByOpportunity(opportunityId: string, limit?: number): Promise<AutoOpportunityAction[]>
  upsertAutoOpportunityUserState(state: AutoOpportunityUserState): Promise<AutoOpportunityUserState>
  getAutoOpportunityUserState(opportunityId: string): Promise<AutoOpportunityUserState | null>
  listAutoOpportunityUserStates(limit?: number): Promise<AutoOpportunityUserState[]>
  createAutoOpportunityPromotionPlan(plan: AutoOpportunityPromotionPlan): Promise<AutoOpportunityPromotionPlan>
  getAutoOpportunityPromotionPlan(opportunityId: string): Promise<AutoOpportunityPromotionPlan | null>
  listAutoOpportunityPromotionPlans(limit?: number): Promise<AutoOpportunityPromotionPlan[]>

  // ── B22: manual opportunity → alert promotion links ─────────────────────────
  createManualPromotedAlertLink(link: ManualPromotedAlertLink): Promise<ManualPromotedAlertLink>
  getManualPromotedAlertLink(opportunityId: string): Promise<ManualPromotedAlertLink | null>
  listManualPromotedAlertLinks(limit?: number): Promise<ManualPromotedAlertLink[]>

  // ── B23: promoted alert resolution outcome links + opportunity outcome summaries ──
  createPromotedAlertOutcomeLink(link: PromotedAlertOutcomeLink): Promise<PromotedAlertOutcomeLink>
  getPromotedAlertOutcomeLinkByAlertId(alertId: string): Promise<PromotedAlertOutcomeLink | null>
  getPromotedAlertOutcomeLinkByOpportunityId(opportunityId: string): Promise<PromotedAlertOutcomeLink | null>
  updatePromotedAlertOutcomeLink(alertId: string, patch: Partial<PromotedAlertOutcomeLink>): Promise<{ count: number }>
  upsertAutoOpportunityOutcomeSummary(summary: AutoOpportunityOutcomeSummary): Promise<AutoOpportunityOutcomeSummary>
  getAutoOpportunityOutcomeSummary(opportunityId: string): Promise<AutoOpportunityOutcomeSummary | null>
  listAutoOpportunityOutcomeSummaries(limit?: number): Promise<AutoOpportunityOutcomeSummary[]>
}

// ─── Aggregate ─────────────────────────────────────────────────────────────

export interface Repositories {
  patterns: PatternRepository
  alerts: AlertRepository
  alertResolutions: AlertResolutionRepository
  fixtures: FixtureRepository
  liveSnapshots: LiveSnapshotRepository
  providerHealth: ProviderHealthRepository
  telegram: TelegramRepository
  odds: OddsRepository
  performance: PerformanceRepository
  intelligence: IntelligenceRepository
}
