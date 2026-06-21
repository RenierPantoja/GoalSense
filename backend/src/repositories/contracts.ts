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
  // ── B32: snapshot lifecycle (safe, append-only-friendly) ──────────────────
  /** List snapshots for retention. `includeSoftDeleted` only for admin/retention. */
  listLiveSnapshotsForRetention(params: { limit?: number; includeSoftDeleted?: boolean }): Promise<Json[]>
  getLiveSnapshotLifecycle(snapshotId: string): Promise<Json | null>
  updateLiveSnapshotLifecycle(snapshotId: string, lifecycle: Json): Promise<{ count: number }>
  markLiveSnapshotForDeletion(snapshotId: string, metadata: Json): Promise<{ count: number; supported: boolean }>
  softDeleteLiveSnapshot(snapshotId: string, metadata: Json): Promise<{ count: number; supported: boolean }>
  restoreSoftDeletedLiveSnapshot(snapshotId: string): Promise<{ count: number; supported: boolean }>
  hardDeleteLiveSnapshot(snapshotId: string): Promise<{ count: number; supported: boolean }>
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
  BacktestRun, ReplayRun, PersistedBacktestSignalResult, BacktestReplayEvidenceReprocessRun,
} from '../modules/intelligence/backtest/backtest.types.js'
import type {
  AutoEngineRun, AutoOpportunity, AutoOpportunityAction, AutoOpportunityUserState,
  AutoOpportunityPromotionPlan, ManualPromotedAlertLink,
  PromotedAlertOutcomeLink, AutoOpportunityOutcomeSummary,
} from '../modules/intelligence/autoEngine/autoEngine.types.js'
import type {
  AutoEngineLearningRun, AutoEngineLearningProfile, AutoOpportunityTypeProfile,
  AutoEngineLearningRecommendation,
} from '../modules/intelligence/autoEngine/autoEngineLearning.types.js'
import type {
  AutoAlertPolicy, AutoAlertPolicyEvaluation,
} from '../modules/intelligence/autoEngine/autoAlertPolicy.types.js'
import type { AdminAuditEntry } from '../modules/audit/adminAudit.types.js'
import type { SnapshotRetentionRun, LocalOpsMetricsSnapshot } from '../modules/localops/snapshotLifecycle.types.js'
import type { EvidenceSnapshotReference } from '../modules/intelligence/evidence/evidenceLineage.types.js'
import type {
  LiveValidationSession, LiveValidationSessionFixture, LiveValidationSessionEvent, LiveValidationSessionReport,
} from '../modules/validation/liveValidation.types.js'
import type {
  LiveValidationRecordLink, LiveValidationSessionMetricCounter, DynamicFixtureAttachRun,
} from '../modules/validation/liveValidationIndex.types.js'
import type {
  PreMatchDomainSnapshot, PreMatchAcquisitionRun,
} from '../modules/footballIntelligence/preMatchAcquisition.types.js'
import type { ManualIntelligenceRecord } from '../modules/footballIntelligence/manualIntelligence.types.js'
import type {
  ProviderEntityMapping, TeamAlias, CompetitionAlias, FixtureIdentityResolutionRun, ProviderEntityMappingStatus,
  ProviderTeamMapping, ProviderCompetitionMapping, ProviderSeasonMapping, EntityMappingDerivationRun, EntityMappingStatus,
} from '../modules/footballIntelligence/identity/providerIdentity.types.js'
import type {
  TeamFundamentalMemoryProfile, MatchupFundamentalMemoryProfile, CompetitionMemoryProfile,
  HistoricalPatternContextProfile, TabooCandidate, MemoryBuildRun,
} from '../modules/footballIntelligence/memory/fundamentalMemory.types.js'
import type {
  InfluenceLedgerEntry, InfluenceBuildRun,
} from '../modules/footballIntelligence/influence/variableInfluence.types.js'
import type {
  AlertDecisionGovernanceResult, AlertGovernanceHold, AlertGovernanceRun, AssumptionInvalidation,
} from '../modules/footballIntelligence/governance/alertDecisionGovernance.types.js'
import type {
  CausalLearningCase, DecisionOutcomeLink, CausalLearningInsight,
  GovernanceCalibrationSuggestion, VariableInfluenceCalibrationSuggestion, CausalLearningRun,
} from '../modules/footballIntelligence/causal/causalLearning.types.js'
import type {
  LocalValidationRun, LocalValidationFixtureSummary, LocalValidationReliabilityMetrics,
  LocalValidationCoverageMetrics, LocalValidationCostMetrics, LocalValidationGoNoGoReport, BackendHealthReport,
} from '../modules/footballIntelligence/validation/localValidation.types.js'

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
  /** B36: patch evidence fields on a persisted backtest result (never the outcome). */
  updateBacktestSignalResult(id: string, patch: Json): Promise<{ count: number }>
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

  // ── B24: Auto Engine learning & calibration (separate from manual-pattern learning) ──
  createAutoEngineLearningRun(run: AutoEngineLearningRun): Promise<AutoEngineLearningRun>
  getAutoEngineLearningRun(id: string): Promise<AutoEngineLearningRun | null>
  listAutoEngineLearningRuns(limit?: number): Promise<AutoEngineLearningRun[]>
  upsertAutoEngineLearningProfile(profile: AutoEngineLearningProfile): Promise<AutoEngineLearningProfile>
  getLatestAutoEngineLearningProfile(): Promise<AutoEngineLearningProfile | null>
  getAutoOpportunityTypeProfile(type: string): Promise<AutoOpportunityTypeProfile | null>
  listAutoEngineLearningRecommendations(limit?: number): Promise<AutoEngineLearningRecommendation[]>

  // ── B25: Auto Alert Policy Engine (shadow-first; auto-create gated) ──────────
  createAutoAlertPolicy(policy: AutoAlertPolicy): Promise<AutoAlertPolicy>
  updateAutoAlertPolicy(id: string, patch: Partial<AutoAlertPolicy>): Promise<{ count: number }>
  getAutoAlertPolicy(id: string): Promise<AutoAlertPolicy | null>
  listAutoAlertPolicies(limit?: number): Promise<AutoAlertPolicy[]>
  createAutoAlertPolicyEvaluation(evaluation: AutoAlertPolicyEvaluation): Promise<AutoAlertPolicyEvaluation>
  getAutoAlertPolicyEvaluation(id: string): Promise<AutoAlertPolicyEvaluation | null>
  listAutoAlertPolicyEvaluations(limit?: number): Promise<AutoAlertPolicyEvaluation[]>
  listAutoAlertPolicyEvaluationsByOpportunity(opportunityId: string, limit?: number): Promise<AutoAlertPolicyEvaluation[]>
  listAutoAlertPolicyEvaluationsByPolicy(policyId: string, limit?: number): Promise<AutoAlertPolicyEvaluation[]>

  // ── B26: admin audit trail (never stores tokens/secrets) ────────────────────
  createAdminAuditEntry(entry: AdminAuditEntry): Promise<AdminAuditEntry>
  listAdminAuditEntries(limit?: number): Promise<AdminAuditEntry[]>

  // ── B32: snapshot retention run audit + local-ops metrics persistence ───────
  createSnapshotRetentionRun(run: SnapshotRetentionRun): Promise<SnapshotRetentionRun>
  updateSnapshotRetentionRun(id: string, patch: Partial<SnapshotRetentionRun>): Promise<{ count: number }>
  getSnapshotRetentionRun(id: string): Promise<SnapshotRetentionRun | null>
  listSnapshotRetentionRuns(limit?: number): Promise<SnapshotRetentionRun[]>
  createLocalOpsMetricsSnapshot(snapshot: LocalOpsMetricsSnapshot): Promise<LocalOpsMetricsSnapshot>
  listLocalOpsMetricsSnapshots(limit?: number): Promise<LocalOpsMetricsSnapshot[]>

  // ── B33: evidence lineage (snapshot reference index) ────────────────────────
  createEvidenceSnapshotReference(ref: EvidenceSnapshotReference): Promise<EvidenceSnapshotReference>
  createEvidenceSnapshotReferencesBatch(refs: EvidenceSnapshotReference[]): Promise<{ created: number }>
  getEvidenceSnapshotReference(id: string): Promise<EvidenceSnapshotReference | null>
  listEvidenceSnapshotReferences(limit?: number): Promise<EvidenceSnapshotReference[]>
  listEvidenceSnapshotReferencesBySnapshot(snapshotId: string, limit?: number): Promise<EvidenceSnapshotReference[]>
  listEvidenceSnapshotReferencesByFixture(fixtureId: string, limit?: number): Promise<EvidenceSnapshotReference[]>
  listEvidenceSnapshotReferencesBySource(source: string, sourceId: string, limit?: number): Promise<EvidenceSnapshotReference[]>
  listEvidenceSnapshotReferencesByAlert(alertId: string, limit?: number): Promise<EvidenceSnapshotReference[]>
  listEvidenceSnapshotReferencesByOpportunity(opportunityId: string, limit?: number): Promise<EvidenceSnapshotReference[]>

  // ── B36: backtest/replay evidence reprocess run audit ───────────────────────
  createBacktestReplayEvidenceReprocessRun(run: BacktestReplayEvidenceReprocessRun): Promise<BacktestReplayEvidenceReprocessRun>
  updateBacktestReplayEvidenceReprocessRun(id: string, patch: Partial<BacktestReplayEvidenceReprocessRun>): Promise<{ count: number }>
  getBacktestReplayEvidenceReprocessRun(id: string): Promise<BacktestReplayEvidenceReprocessRun | null>
  listBacktestReplayEvidenceReprocessRuns(limit?: number): Promise<BacktestReplayEvidenceReprocessRun[]>

  // ── B37: live validation sessions ───────────────────────────────────────────
  createLiveValidationSession(session: LiveValidationSession): Promise<LiveValidationSession>
  updateLiveValidationSession(id: string, patch: Partial<LiveValidationSession>): Promise<{ count: number }>
  getLiveValidationSession(id: string): Promise<LiveValidationSession | null>
  listLiveValidationSessions(limit?: number): Promise<LiveValidationSession[]>
  addLiveValidationSessionFixture(fixture: LiveValidationSessionFixture): Promise<LiveValidationSessionFixture>
  updateLiveValidationSessionFixture(id: string, patch: Partial<LiveValidationSessionFixture>): Promise<{ count: number }>
  listLiveValidationSessionFixtures(sessionId: string, limit?: number): Promise<LiveValidationSessionFixture[]>
  createLiveValidationSessionEvent(event: LiveValidationSessionEvent): Promise<LiveValidationSessionEvent>
  listLiveValidationSessionEvents(sessionId: string, limit?: number): Promise<LiveValidationSessionEvent[]>
  createLiveValidationSessionReport(report: LiveValidationSessionReport): Promise<LiveValidationSessionReport>
  getLiveValidationSessionReport(sessionId: string): Promise<LiveValidationSessionReport | null>
  listLiveValidationSessionReports(limit?: number): Promise<LiveValidationSessionReport[]>

  // ── B39: session record index + scoped metrics + dynamic attach ─────────────
  createLiveValidationRecordLink(link: LiveValidationRecordLink): Promise<LiveValidationRecordLink>
  createLiveValidationRecordLinksBatch(links: LiveValidationRecordLink[]): Promise<{ created: number }>
  listLiveValidationRecordLinks(limit?: number): Promise<LiveValidationRecordLink[]>
  listLiveValidationRecordLinksBySession(validationSessionId: string, limit?: number): Promise<LiveValidationRecordLink[]>
  listLiveValidationRecordLinksByRecord(recordId: string, limit?: number): Promise<LiveValidationRecordLink[]>
  listLiveValidationRecordLinksByFixture(fixtureId: string, limit?: number): Promise<LiveValidationRecordLink[]>
  upsertLiveValidationSessionMetricCounter(counter: LiveValidationSessionMetricCounter): Promise<LiveValidationSessionMetricCounter>
  getLiveValidationSessionMetricCounter(validationSessionId: string, bucketKey: string): Promise<LiveValidationSessionMetricCounter | null>
  listLiveValidationSessionMetricCounters(validationSessionId: string, limit?: number): Promise<LiveValidationSessionMetricCounter[]>
  createDynamicFixtureAttachRun(run: DynamicFixtureAttachRun): Promise<DynamicFixtureAttachRun>
  updateDynamicFixtureAttachRun(id: string, patch: Partial<DynamicFixtureAttachRun>): Promise<{ count: number }>
  listDynamicFixtureAttachRuns(validationSessionId: string, limit?: number): Promise<DynamicFixtureAttachRun[]>
  getDynamicFixtureAttachRun(id: string): Promise<DynamicFixtureAttachRun | null>

  // ── B40: pre-match acquisition store (domain snapshots + runs) ──────────────
  savePreMatchDomainSnapshot(snapshot: PreMatchDomainSnapshot): Promise<PreMatchDomainSnapshot>
  getPreMatchDomainSnapshot(fixtureId: string, domain: string): Promise<PreMatchDomainSnapshot | null>
  listPreMatchDomainSnapshots(fixtureId: string, limit?: number): Promise<PreMatchDomainSnapshot[]>
  createPreMatchAcquisitionRun(run: PreMatchAcquisitionRun): Promise<PreMatchAcquisitionRun>
  updatePreMatchAcquisitionRun(id: string, patch: Partial<PreMatchAcquisitionRun>): Promise<{ count: number }>
  getPreMatchAcquisitionRun(id: string): Promise<PreMatchAcquisitionRun | null>
  listPreMatchAcquisitionRuns(filters: { fixtureId?: string; limit?: number }): Promise<PreMatchAcquisitionRun[]>

  // ── B41: manual intelligence intake ─────────────────────────────────────────
  saveManualIntelligenceRecord(record: ManualIntelligenceRecord): Promise<ManualIntelligenceRecord>
  getManualIntelligenceRecord(id: string): Promise<ManualIntelligenceRecord | null>
  listManualIntelligenceRecords(filters: { fixtureId?: string; teamId?: string; limit?: number }): Promise<ManualIntelligenceRecord[]>
  updateManualIntelligenceRecord(id: string, patch: Partial<ManualIntelligenceRecord>): Promise<{ count: number }>
  deleteManualIntelligenceRecord(id: string): Promise<{ count: number }>

  // ── B42: cross-provider identity resolution ─────────────────────────────────
  saveProviderEntityMapping(mapping: ProviderEntityMapping): Promise<ProviderEntityMapping>
  getProviderEntityMapping(id: string): Promise<ProviderEntityMapping | null>
  listProviderEntityMappings(limit?: number): Promise<ProviderEntityMapping[]>
  listProviderMappingsForEntity(identityType: string, primaryProviderEntityId: string, limit?: number): Promise<ProviderEntityMapping[]>
  listProviderMappingsByStatus(status: ProviderEntityMappingStatus, limit?: number): Promise<ProviderEntityMapping[]>
  updateProviderEntityMappingStatus(id: string, patch: Partial<ProviderEntityMapping>): Promise<{ count: number }>
  saveTeamAlias(alias: TeamAlias): Promise<TeamAlias>
  listTeamAliases(limit?: number): Promise<TeamAlias[]>
  saveCompetitionAlias(alias: CompetitionAlias): Promise<CompetitionAlias>
  listCompetitionAliases(limit?: number): Promise<CompetitionAlias[]>
  createFixtureIdentityResolutionRun(run: FixtureIdentityResolutionRun): Promise<FixtureIdentityResolutionRun>
  updateFixtureIdentityResolutionRun(id: string, patch: Partial<FixtureIdentityResolutionRun>): Promise<{ count: number }>
  getFixtureIdentityResolutionRun(id: string): Promise<FixtureIdentityResolutionRun | null>
  listFixtureIdentityResolutionRuns(limit?: number): Promise<FixtureIdentityResolutionRun[]>

  // ── B43: entity (team/competition/season) mappings ──────────────────────────
  saveProviderTeamMapping(mapping: ProviderTeamMapping): Promise<ProviderTeamMapping>
  getProviderTeamMapping(id: string): Promise<ProviderTeamMapping | null>
  listProviderTeamMappings(limit?: number): Promise<ProviderTeamMapping[]>
  listProviderTeamMappingsByStatus(status: EntityMappingStatus, limit?: number): Promise<ProviderTeamMapping[]>
  updateProviderTeamMappingStatus(id: string, patch: Partial<ProviderTeamMapping>): Promise<{ count: number }>
  saveProviderCompetitionMapping(mapping: ProviderCompetitionMapping): Promise<ProviderCompetitionMapping>
  getProviderCompetitionMapping(id: string): Promise<ProviderCompetitionMapping | null>
  listProviderCompetitionMappings(limit?: number): Promise<ProviderCompetitionMapping[]>
  listProviderCompetitionMappingsByStatus(status: EntityMappingStatus, limit?: number): Promise<ProviderCompetitionMapping[]>
  updateProviderCompetitionMappingStatus(id: string, patch: Partial<ProviderCompetitionMapping>): Promise<{ count: number }>
  saveProviderSeasonMapping(mapping: ProviderSeasonMapping): Promise<ProviderSeasonMapping>
  getProviderSeasonMapping(id: string): Promise<ProviderSeasonMapping | null>
  listProviderSeasonMappings(limit?: number): Promise<ProviderSeasonMapping[]>
  createEntityMappingDerivationRun(run: EntityMappingDerivationRun): Promise<EntityMappingDerivationRun>
  updateEntityMappingDerivationRun(id: string, patch: Partial<EntityMappingDerivationRun>): Promise<{ count: number }>
  getEntityMappingDerivationRun(id: string): Promise<EntityMappingDerivationRun | null>
  listEntityMappingDerivationRuns(limit?: number): Promise<EntityMappingDerivationRun[]>

  // ── B45: historical club / matchup / context memory + taboos + build runs ───
  saveTeamFundamentalMemory(profile: TeamFundamentalMemoryProfile): Promise<TeamFundamentalMemoryProfile>
  getTeamFundamentalMemory(teamId: string): Promise<TeamFundamentalMemoryProfile | null>
  listTeamFundamentalMemories(limit?: number): Promise<TeamFundamentalMemoryProfile[]>
  saveMatchupFundamentalMemory(profile: MatchupFundamentalMemoryProfile): Promise<MatchupFundamentalMemoryProfile>
  getMatchupFundamentalMemory(id: string): Promise<MatchupFundamentalMemoryProfile | null>
  listMatchupFundamentalMemories(limit?: number): Promise<MatchupFundamentalMemoryProfile[]>
  saveCompetitionMemory(profile: CompetitionMemoryProfile): Promise<CompetitionMemoryProfile>
  getCompetitionMemory(competitionKey: string): Promise<CompetitionMemoryProfile | null>
  listCompetitionMemories(limit?: number): Promise<CompetitionMemoryProfile[]>
  saveHistoricalPatternContextProfile(profile: HistoricalPatternContextProfile): Promise<HistoricalPatternContextProfile>
  getHistoricalPatternContextProfile(id: string): Promise<HistoricalPatternContextProfile | null>
  listHistoricalPatternContextProfiles(limit?: number): Promise<HistoricalPatternContextProfile[]>
  saveTabooCandidate(candidate: TabooCandidate): Promise<TabooCandidate>
  getTabooCandidate(id: string): Promise<TabooCandidate | null>
  listTabooCandidates(filters: { scopeKey?: string; status?: string; limit?: number }): Promise<TabooCandidate[]>
  createMemoryBuildRun(run: MemoryBuildRun): Promise<MemoryBuildRun>
  updateMemoryBuildRun(id: string, patch: Partial<MemoryBuildRun>): Promise<{ count: number }>
  getMemoryBuildRun(id: string): Promise<MemoryBuildRun | null>
  listMemoryBuildRuns(limit?: number): Promise<MemoryBuildRun[]>

  // ── B46: variable influence ledger + build runs ─────────────────────────────
  saveInfluenceLedgerEntry(entry: InfluenceLedgerEntry): Promise<InfluenceLedgerEntry>
  getInfluenceLedgerEntry(id: string): Promise<InfluenceLedgerEntry | null>
  listInfluenceLedgerEntries(limit?: number): Promise<InfluenceLedgerEntry[]>
  listInfluenceLedgerEntriesByFixture(fixtureId: string, limit?: number): Promise<InfluenceLedgerEntry[]>
  listInfluenceLedgerEntriesByPattern(patternId: string, limit?: number): Promise<InfluenceLedgerEntry[]>
  createInfluenceBuildRun(run: InfluenceBuildRun): Promise<InfluenceBuildRun>
  updateInfluenceBuildRun(id: string, patch: Partial<InfluenceBuildRun>): Promise<{ count: number }>
  getInfluenceBuildRun(id: string): Promise<InfluenceBuildRun | null>
  listInfluenceBuildRuns(limit?: number): Promise<InfluenceBuildRun[]>

  // ── B47: alert decision governance (results + holds + runs + invalidations) ──
  saveAlertDecisionGovernanceResult(result: AlertDecisionGovernanceResult): Promise<AlertDecisionGovernanceResult>
  getAlertDecisionGovernanceResult(id: string): Promise<AlertDecisionGovernanceResult | null>
  listAlertDecisionGovernanceResults(limit?: number): Promise<AlertDecisionGovernanceResult[]>
  listGovernanceResultsByFixture(fixtureId: string, limit?: number): Promise<AlertDecisionGovernanceResult[]>
  listGovernanceResultsByPattern(patternId: string, limit?: number): Promise<AlertDecisionGovernanceResult[]>
  listGovernanceResultsByCandidate(candidateAlertId: string, limit?: number): Promise<AlertDecisionGovernanceResult[]>
  saveAlertGovernanceHold(hold: AlertGovernanceHold): Promise<AlertGovernanceHold>
  getAlertGovernanceHold(id: string): Promise<AlertGovernanceHold | null>
  listAlertGovernanceHolds(filters: { fixtureId?: string; status?: string; limit?: number }): Promise<AlertGovernanceHold[]>
  updateAlertGovernanceHold(id: string, patch: Partial<AlertGovernanceHold>): Promise<{ count: number }>
  createAlertGovernanceRun(run: AlertGovernanceRun): Promise<AlertGovernanceRun>
  updateAlertGovernanceRun(id: string, patch: Partial<AlertGovernanceRun>): Promise<{ count: number }>
  listAlertGovernanceRuns(limit?: number): Promise<AlertGovernanceRun[]>
  saveAssumptionInvalidation(inv: AssumptionInvalidation): Promise<AssumptionInvalidation>
  listAssumptionInvalidationsByFixture(fixtureId: string, limit?: number): Promise<AssumptionInvalidation[]>

  // ── B48: post-match causal learning ─────────────────────────────────────────
  saveCausalLearningCase(c: CausalLearningCase): Promise<CausalLearningCase>
  getCausalLearningCase(id: string): Promise<CausalLearningCase | null>
  listCausalLearningCases(limit?: number): Promise<CausalLearningCase[]>
  listCausalLearningCasesByFixture(fixtureId: string, limit?: number): Promise<CausalLearningCase[]>
  listCausalLearningCasesByPattern(patternId: string, limit?: number): Promise<CausalLearningCase[]>
  saveDecisionOutcomeLink(link: DecisionOutcomeLink): Promise<DecisionOutcomeLink>
  getDecisionOutcomeLink(id: string): Promise<DecisionOutcomeLink | null>
  listDecisionOutcomeLinks(filters: { fixtureId?: string; alertId?: string; limit?: number }): Promise<DecisionOutcomeLink[]>
  saveCausalLearningInsight(insight: CausalLearningInsight): Promise<CausalLearningInsight>
  listCausalLearningInsights(limit?: number): Promise<CausalLearningInsight[]>
  listCausalLearningInsightsByFixture(fixtureId: string, limit?: number): Promise<CausalLearningInsight[]>
  saveGovernanceCalibrationSuggestion(s: GovernanceCalibrationSuggestion): Promise<GovernanceCalibrationSuggestion>
  getGovernanceCalibrationSuggestion(id: string): Promise<GovernanceCalibrationSuggestion | null>
  listGovernanceCalibrationSuggestions(limit?: number): Promise<GovernanceCalibrationSuggestion[]>
  updateGovernanceCalibrationSuggestion(id: string, patch: Partial<GovernanceCalibrationSuggestion>): Promise<{ count: number }>
  saveVariableInfluenceCalibrationSuggestion(s: VariableInfluenceCalibrationSuggestion): Promise<VariableInfluenceCalibrationSuggestion>
  getVariableInfluenceCalibrationSuggestion(id: string): Promise<VariableInfluenceCalibrationSuggestion | null>
  listVariableInfluenceCalibrationSuggestions(limit?: number): Promise<VariableInfluenceCalibrationSuggestion[]>
  updateVariableInfluenceCalibrationSuggestion(id: string, patch: Partial<VariableInfluenceCalibrationSuggestion>): Promise<{ count: number }>
  createCausalLearningRun(run: CausalLearningRun): Promise<CausalLearningRun>
  updateCausalLearningRun(id: string, patch: Partial<CausalLearningRun>): Promise<{ count: number }>
  listCausalLearningRuns(limit?: number): Promise<CausalLearningRun[]>

  // ── B49: local long-run validation ──────────────────────────────────────────
  saveLocalValidationRun(run: LocalValidationRun): Promise<LocalValidationRun>
  getLocalValidationRun(id: string): Promise<LocalValidationRun | null>
  listLocalValidationRuns(limit?: number): Promise<LocalValidationRun[]>
  updateLocalValidationRun(id: string, patch: Partial<LocalValidationRun>): Promise<{ count: number }>
  saveLocalValidationFixtureSummary(s: LocalValidationFixtureSummary): Promise<LocalValidationFixtureSummary>
  listLocalValidationFixtureSummaries(runId: string, limit?: number): Promise<LocalValidationFixtureSummary[]>
  saveLocalValidationReliabilityMetrics(m: LocalValidationReliabilityMetrics): Promise<LocalValidationReliabilityMetrics>
  getLocalValidationReliabilityMetrics(runId: string): Promise<LocalValidationReliabilityMetrics | null>
  saveLocalValidationCoverageMetrics(m: LocalValidationCoverageMetrics): Promise<LocalValidationCoverageMetrics>
  getLocalValidationCoverageMetrics(runId: string): Promise<LocalValidationCoverageMetrics | null>
  saveLocalValidationCostMetrics(m: LocalValidationCostMetrics): Promise<LocalValidationCostMetrics>
  getLocalValidationCostMetrics(runId: string): Promise<LocalValidationCostMetrics | null>
  saveLocalValidationGoNoGoReport(r: LocalValidationGoNoGoReport): Promise<LocalValidationGoNoGoReport>
  getLocalValidationGoNoGoReport(runId: string): Promise<LocalValidationGoNoGoReport | null>
  saveBackendHealthReport(r: BackendHealthReport): Promise<BackendHealthReport>
  getBackendHealthReport(id: string): Promise<BackendHealthReport | null>
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
