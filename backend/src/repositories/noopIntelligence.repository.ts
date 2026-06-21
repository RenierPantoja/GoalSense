/**
 * Noop Intelligence Repository (Phase B12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Used under PERSISTENCE_PROVIDER=prisma, where no Prisma models exist yet for
 * the intelligence memory. It implements the full contract WITHOUT persistence:
 *   - writes are accepted (return the record) so the alert/resolution hooks never
 *     break and never throw;
 *   - reads return empty/null honestly.
 * This keeps Prisma mode fully working; the memory simply isn't stored there.
 * Firebase mode (the primary/staging provider) persists everything.
 */
import type { IntelligenceRepository } from './contracts.js'
import type {
  SignalLedgerEntry, AlertOutcomeRecord, SignalFailureAnalysis,
  MissedOpportunityRecord, LearningEvent, IntelligenceOverview, AlertResult,
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
  ProviderEntityMapping, TeamAlias, CompetitionAlias, FixtureIdentityResolutionRun,
  ProviderTeamMapping, ProviderCompetitionMapping, ProviderSeasonMapping, EntityMappingDerivationRun,
} from '../modules/footballIntelligence/identity/providerIdentity.types.js'
import type {
  AutoAlertPolicy, AutoAlertPolicyEvaluation,
} from '../modules/intelligence/autoEngine/autoAlertPolicy.types.js'
import type { AdminAuditEntry } from '../modules/audit/adminAudit.types.js'
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
let warned = false
function warnOnce(): void {
  if (warned) return
  warned = true
  console.warn('[Intelligence] PERSISTENCE_PROVIDER=prisma → intelligence memory is NOT persisted (Noop adapter). Use Firebase mode to retain Signal Ledger / outcomes / learning events.')
}

export class NoopIntelligenceRepository implements IntelligenceRepository {
  async createSignalLedgerEntry(entry: SignalLedgerEntry): Promise<SignalLedgerEntry> { warnOnce(); return entry }
  async updateSignalLedgerEntry(): Promise<{ count: number }> { return { count: 0 } }
  async getSignalLedgerEntryByAlertId(): Promise<SignalLedgerEntry | null> { return null }
  async listSignalLedgerEntries(): Promise<SignalLedgerEntry[]> { return [] }

  async createAlertOutcome(record: AlertOutcomeRecord): Promise<AlertOutcomeRecord> { warnOnce(); return record }
  async updateAlertOutcome(): Promise<{ count: number }> { return { count: 0 } }
  async getAlertOutcomeByAlertId(): Promise<AlertOutcomeRecord | null> { return null }
  async listAlertOutcomesByPattern(): Promise<AlertOutcomeRecord[]> { return [] }

  async createFailureAnalysis(analysis: SignalFailureAnalysis): Promise<SignalFailureAnalysis> { warnOnce(); return analysis }
  async getFailureAnalysisByAlertId(): Promise<SignalFailureAnalysis | null> { return null }
  async listFailureAnalysesByPattern(): Promise<SignalFailureAnalysis[]> { return [] }
  async createMissedOpportunity(record: MissedOpportunityRecord): Promise<MissedOpportunityRecord> { warnOnce(); return record }

  async createLearningEvent(event: LearningEvent): Promise<LearningEvent> { warnOnce(); return event }
  async listLearningEventsByPattern(): Promise<LearningEvent[]> { return [] }
  async getLearningEventById(): Promise<LearningEvent | null> { return null }

  async getOverview(): Promise<IntelligenceOverview> {
    const outcomeBreakdown: Record<AlertResult, number> = { pending: 0, confirmed: 0, confirmed_partial: 0, failed: 0, unknown: 0, expired: 0 }
    return { ledgerEntries: 0, outcomes: 0, outcomeBreakdown, failureAnalyses: 0, learningEvents: 0, missedOpportunities: 0, generatedAt: new Date().toISOString() }
  }

  // ── B13 (Noop): reads return empty honestly; writes accepted without persistence ──
  async listAllSignalLedgerEntries(): Promise<SignalLedgerEntry[]> { return [] }
  async listAllAlertOutcomes(): Promise<AlertOutcomeRecord[]> { return [] }
  async listAllFailureAnalyses(): Promise<SignalFailureAnalysis[]> { return [] }
  async listRecentLearningEvents(): Promise<LearningEvent[]> { return [] }

  async createLearningAggregationRun(run: LearningAggregationRun): Promise<LearningAggregationRun> { warnOnce(); return run }
  async updateLearningAggregationRun(): Promise<{ count: number }> { return { count: 0 } }
  async getLatestLearningAggregationRun(): Promise<LearningAggregationRun | null> { return null }

  async upsertPatternLearningProfile(p: PatternLearningProfile): Promise<PatternLearningProfile> { warnOnce(); return p }
  async getPatternLearningProfile(): Promise<PatternLearningProfile | null> { return null }
  async listPatternLearningProfiles(): Promise<PatternLearningProfile[]> { return [] }

  async upsertCompetitionLearningProfile(p: CompetitionLearningProfile): Promise<CompetitionLearningProfile> { warnOnce(); return p }
  async getCompetitionLearningProfile(): Promise<CompetitionLearningProfile | null> { return null }
  async listCompetitionLearningProfiles(): Promise<CompetitionLearningProfile[]> { return [] }

  async upsertTeamLearningProfile(p: TeamLearningProfile): Promise<TeamLearningProfile> { warnOnce(); return p }
  async getTeamLearningProfile(): Promise<TeamLearningProfile | null> { return null }
  async listTeamLearningProfiles(): Promise<TeamLearningProfile[]> { return [] }

  async upsertSignalContextStats(s: SignalContextStats): Promise<SignalContextStats> { warnOnce(); return s }
  async listSignalContextStats(): Promise<SignalContextStats[]> { return [] }

  async createLearningRecommendation(r: LearningRecommendation): Promise<LearningRecommendation> { warnOnce(); return r }
  async listLearningRecommendations(): Promise<LearningRecommendation[]> { return [] }

  // ── B14 (Noop): reads empty; writes accepted without persistence ──
  async createBacktestRun(run: BacktestRun): Promise<BacktestRun> { warnOnce(); return run }
  async updateBacktestRun(): Promise<{ count: number }> { return { count: 0 } }
  async getBacktestRun(): Promise<BacktestRun | null> { return null }
  async listBacktestRuns(): Promise<BacktestRun[]> { return [] }
  async createBacktestSignalResult(result: PersistedBacktestSignalResult): Promise<PersistedBacktestSignalResult> { warnOnce(); return result }
  async listBacktestSignalResults(): Promise<PersistedBacktestSignalResult[]> { return [] }
  async updateBacktestSignalResult(): Promise<{ count: number }> { return { count: 0 } }
  async createReplayRun(run: ReplayRun): Promise<ReplayRun> { warnOnce(); return run }
  async getReplayRun(): Promise<ReplayRun | null> { return null }
  async listReplayRuns(): Promise<ReplayRun[]> { return [] }

  // ── B19 (Noop): reads empty; writes accepted without persistence ──
  async createAutoEngineRun(run: AutoEngineRun): Promise<AutoEngineRun> { warnOnce(); return run }
  async updateAutoEngineRun(): Promise<{ count: number }> { return { count: 0 } }
  async getAutoEngineRun(): Promise<AutoEngineRun | null> { return null }
  async getLatestAutoEngineRun(): Promise<AutoEngineRun | null> { return null }
  async listAutoEngineRuns(): Promise<AutoEngineRun[]> { return [] }
  async upsertAutoOpportunity(opp: AutoOpportunity): Promise<AutoOpportunity> { warnOnce(); return opp }
  async getAutoOpportunity(): Promise<AutoOpportunity | null> { return null }
  async listAutoOpportunities(): Promise<AutoOpportunity[]> { return [] }
  async listAutoOpportunitiesByFixture(): Promise<AutoOpportunity[]> { return [] }

  // ── B21 (Noop): reads empty; writes accepted without persistence ──
  async createAutoOpportunityAction(action: AutoOpportunityAction): Promise<AutoOpportunityAction> { warnOnce(); return action }
  async listAutoOpportunityActions(): Promise<AutoOpportunityAction[]> { return [] }
  async listAutoOpportunityActionsByOpportunity(): Promise<AutoOpportunityAction[]> { return [] }
  async upsertAutoOpportunityUserState(state: AutoOpportunityUserState): Promise<AutoOpportunityUserState> { warnOnce(); return state }
  async getAutoOpportunityUserState(): Promise<AutoOpportunityUserState | null> { return null }
  async listAutoOpportunityUserStates(): Promise<AutoOpportunityUserState[]> { return [] }
  async createAutoOpportunityPromotionPlan(plan: AutoOpportunityPromotionPlan): Promise<AutoOpportunityPromotionPlan> { warnOnce(); return plan }
  async getAutoOpportunityPromotionPlan(): Promise<AutoOpportunityPromotionPlan | null> { return null }
  async listAutoOpportunityPromotionPlans(): Promise<AutoOpportunityPromotionPlan[]> { return [] }

  // ── B22 (Noop): reads empty; writes accepted without persistence ──
  async createManualPromotedAlertLink(link: ManualPromotedAlertLink): Promise<ManualPromotedAlertLink> { warnOnce(); return link }
  async getManualPromotedAlertLink(): Promise<ManualPromotedAlertLink | null> { return null }
  async listManualPromotedAlertLinks(): Promise<ManualPromotedAlertLink[]> { return [] }

  // ── B23 (Noop): reads empty; writes accepted without persistence ──
  async createPromotedAlertOutcomeLink(link: PromotedAlertOutcomeLink): Promise<PromotedAlertOutcomeLink> { warnOnce(); return link }
  async getPromotedAlertOutcomeLinkByAlertId(): Promise<PromotedAlertOutcomeLink | null> { return null }
  async getPromotedAlertOutcomeLinkByOpportunityId(): Promise<PromotedAlertOutcomeLink | null> { return null }
  async updatePromotedAlertOutcomeLink(): Promise<{ count: number }> { return { count: 0 } }
  async upsertAutoOpportunityOutcomeSummary(summary: AutoOpportunityOutcomeSummary): Promise<AutoOpportunityOutcomeSummary> { warnOnce(); return summary }
  async getAutoOpportunityOutcomeSummary(): Promise<AutoOpportunityOutcomeSummary | null> { return null }
  async listAutoOpportunityOutcomeSummaries(): Promise<AutoOpportunityOutcomeSummary[]> { return [] }

  // ── B24 (Noop): reads empty; writes accepted without persistence ──
  async createAutoEngineLearningRun(run: AutoEngineLearningRun): Promise<AutoEngineLearningRun> { warnOnce(); return run }
  async getAutoEngineLearningRun(): Promise<AutoEngineLearningRun | null> { return null }
  async listAutoEngineLearningRuns(): Promise<AutoEngineLearningRun[]> { return [] }
  async upsertAutoEngineLearningProfile(profile: AutoEngineLearningProfile): Promise<AutoEngineLearningProfile> { warnOnce(); return profile }
  async getLatestAutoEngineLearningProfile(): Promise<AutoEngineLearningProfile | null> { return null }
  async getAutoOpportunityTypeProfile(): Promise<AutoOpportunityTypeProfile | null> { return null }
  async listAutoEngineLearningRecommendations(): Promise<AutoEngineLearningRecommendation[]> { return [] }

  // ── B25 (Noop): reads empty; writes accepted without persistence ──
  async createAutoAlertPolicy(policy: AutoAlertPolicy): Promise<AutoAlertPolicy> { warnOnce(); return policy }
  async updateAutoAlertPolicy(): Promise<{ count: number }> { return { count: 0 } }
  async getAutoAlertPolicy(): Promise<AutoAlertPolicy | null> { return null }
  async listAutoAlertPolicies(): Promise<AutoAlertPolicy[]> { return [] }
  async createAutoAlertPolicyEvaluation(evaluation: AutoAlertPolicyEvaluation): Promise<AutoAlertPolicyEvaluation> { warnOnce(); return evaluation }
  async getAutoAlertPolicyEvaluation(): Promise<AutoAlertPolicyEvaluation | null> { return null }
  async listAutoAlertPolicyEvaluations(): Promise<AutoAlertPolicyEvaluation[]> { return [] }
  async listAutoAlertPolicyEvaluationsByOpportunity(): Promise<AutoAlertPolicyEvaluation[]> { return [] }
  async listAutoAlertPolicyEvaluationsByPolicy(): Promise<AutoAlertPolicyEvaluation[]> { return [] }

  // ── B26 (Noop): audit accepted without persistence; reads empty ──
  async createAdminAuditEntry(entry: AdminAuditEntry): Promise<AdminAuditEntry> { return entry }
  async listAdminAuditEntries(): Promise<AdminAuditEntry[]> { return [] }

  // ── B32 (Noop): retention run audit + local-ops metrics not persisted ──
  async createSnapshotRetentionRun(run: SnapshotRetentionRun): Promise<SnapshotRetentionRun> { warnOnce(); return run }
  async updateSnapshotRetentionRun(): Promise<{ count: number }> { return { count: 0 } }
  async getSnapshotRetentionRun(): Promise<SnapshotRetentionRun | null> { return null }
  async listSnapshotRetentionRuns(): Promise<SnapshotRetentionRun[]> { return [] }
  async createLocalOpsMetricsSnapshot(snapshot: LocalOpsMetricsSnapshot): Promise<LocalOpsMetricsSnapshot> { warnOnce(); return snapshot }
  async listLocalOpsMetricsSnapshots(): Promise<LocalOpsMetricsSnapshot[]> { return [] }

  // ── B33 (Noop): evidence lineage not persisted; reads empty ──
  async createEvidenceSnapshotReference(ref: EvidenceSnapshotReference): Promise<EvidenceSnapshotReference> { warnOnce(); return ref }
  async createEvidenceSnapshotReferencesBatch(refs: EvidenceSnapshotReference[]): Promise<{ created: number }> { warnOnce(); return { created: 0 } }
  async getEvidenceSnapshotReference(): Promise<EvidenceSnapshotReference | null> { return null }
  async listEvidenceSnapshotReferences(): Promise<EvidenceSnapshotReference[]> { return [] }
  async listEvidenceSnapshotReferencesBySnapshot(): Promise<EvidenceSnapshotReference[]> { return [] }
  async listEvidenceSnapshotReferencesByFixture(): Promise<EvidenceSnapshotReference[]> { return [] }
  async listEvidenceSnapshotReferencesBySource(): Promise<EvidenceSnapshotReference[]> { return [] }
  async listEvidenceSnapshotReferencesByAlert(): Promise<EvidenceSnapshotReference[]> { return [] }
  async listEvidenceSnapshotReferencesByOpportunity(): Promise<EvidenceSnapshotReference[]> { return [] }

  // ── B36 (Noop): reprocess run audit not persisted; reads empty ──
  async createBacktestReplayEvidenceReprocessRun(run: BacktestReplayEvidenceReprocessRun): Promise<BacktestReplayEvidenceReprocessRun> { warnOnce(); return run }
  async updateBacktestReplayEvidenceReprocessRun(): Promise<{ count: number }> { return { count: 0 } }
  async getBacktestReplayEvidenceReprocessRun(): Promise<BacktestReplayEvidenceReprocessRun | null> { return null }
  async listBacktestReplayEvidenceReprocessRuns(): Promise<BacktestReplayEvidenceReprocessRun[]> { return [] }

  // ── B37 (Noop): live validation sessions not persisted; reads empty ──
  async createLiveValidationSession(s: LiveValidationSession): Promise<LiveValidationSession> { warnOnce(); return s }
  async updateLiveValidationSession(): Promise<{ count: number }> { return { count: 0 } }
  async getLiveValidationSession(): Promise<LiveValidationSession | null> { return null }
  async listLiveValidationSessions(): Promise<LiveValidationSession[]> { return [] }
  async addLiveValidationSessionFixture(f: LiveValidationSessionFixture): Promise<LiveValidationSessionFixture> { warnOnce(); return f }
  async updateLiveValidationSessionFixture(): Promise<{ count: number }> { return { count: 0 } }
  async listLiveValidationSessionFixtures(): Promise<LiveValidationSessionFixture[]> { return [] }
  async createLiveValidationSessionEvent(e: LiveValidationSessionEvent): Promise<LiveValidationSessionEvent> { return e }
  async listLiveValidationSessionEvents(): Promise<LiveValidationSessionEvent[]> { return [] }
  async createLiveValidationSessionReport(r: LiveValidationSessionReport): Promise<LiveValidationSessionReport> { warnOnce(); return r }
  async getLiveValidationSessionReport(): Promise<LiveValidationSessionReport | null> { return null }
  async listLiveValidationSessionReports(): Promise<LiveValidationSessionReport[]> { return [] }

  // ── B39 (Noop): record index + metrics + dynamic attach not persisted ──
  async createLiveValidationRecordLink(l: LiveValidationRecordLink): Promise<LiveValidationRecordLink> { return l }
  async createLiveValidationRecordLinksBatch(): Promise<{ created: number }> { return { created: 0 } }
  async listLiveValidationRecordLinks(): Promise<LiveValidationRecordLink[]> { return [] }
  async listLiveValidationRecordLinksBySession(): Promise<LiveValidationRecordLink[]> { return [] }
  async listLiveValidationRecordLinksByRecord(): Promise<LiveValidationRecordLink[]> { return [] }
  async listLiveValidationRecordLinksByFixture(): Promise<LiveValidationRecordLink[]> { return [] }
  async upsertLiveValidationSessionMetricCounter(c: LiveValidationSessionMetricCounter): Promise<LiveValidationSessionMetricCounter> { return c }
  async getLiveValidationSessionMetricCounter(): Promise<LiveValidationSessionMetricCounter | null> { return null }
  async listLiveValidationSessionMetricCounters(): Promise<LiveValidationSessionMetricCounter[]> { return [] }
  async createDynamicFixtureAttachRun(r: DynamicFixtureAttachRun): Promise<DynamicFixtureAttachRun> { return r }
  async updateDynamicFixtureAttachRun(): Promise<{ count: number }> { return { count: 0 } }
  async listDynamicFixtureAttachRuns(): Promise<DynamicFixtureAttachRun[]> { return [] }
  async getDynamicFixtureAttachRun(): Promise<DynamicFixtureAttachRun | null> { return null }

  // ── B40 (Noop): pre-match acquisition store not persisted ──
  async savePreMatchDomainSnapshot(s: PreMatchDomainSnapshot): Promise<PreMatchDomainSnapshot> { return s }
  async getPreMatchDomainSnapshot(): Promise<PreMatchDomainSnapshot | null> { return null }
  async listPreMatchDomainSnapshots(): Promise<PreMatchDomainSnapshot[]> { return [] }
  async createPreMatchAcquisitionRun(r: PreMatchAcquisitionRun): Promise<PreMatchAcquisitionRun> { return r }
  async updatePreMatchAcquisitionRun(): Promise<{ count: number }> { return { count: 0 } }
  async getPreMatchAcquisitionRun(): Promise<PreMatchAcquisitionRun | null> { return null }
  async listPreMatchAcquisitionRuns(): Promise<PreMatchAcquisitionRun[]> { return [] }

  // ── B41 (Noop): manual intelligence not persisted ──
  async saveManualIntelligenceRecord(r: ManualIntelligenceRecord): Promise<ManualIntelligenceRecord> { return r }
  async getManualIntelligenceRecord(): Promise<ManualIntelligenceRecord | null> { return null }
  async listManualIntelligenceRecords(): Promise<ManualIntelligenceRecord[]> { return [] }
  async updateManualIntelligenceRecord(): Promise<{ count: number }> { return { count: 0 } }
  async deleteManualIntelligenceRecord(): Promise<{ count: number }> { return { count: 0 } }

  // ── B42 (Noop): identity resolution not persisted ──
  async saveProviderEntityMapping(m: ProviderEntityMapping): Promise<ProviderEntityMapping> { return m }
  async getProviderEntityMapping(): Promise<ProviderEntityMapping | null> { return null }
  async listProviderEntityMappings(): Promise<ProviderEntityMapping[]> { return [] }
  async listProviderMappingsForEntity(): Promise<ProviderEntityMapping[]> { return [] }
  async listProviderMappingsByStatus(): Promise<ProviderEntityMapping[]> { return [] }
  async updateProviderEntityMappingStatus(): Promise<{ count: number }> { return { count: 0 } }
  async saveTeamAlias(a: TeamAlias): Promise<TeamAlias> { return a }
  async listTeamAliases(): Promise<TeamAlias[]> { return [] }
  async saveCompetitionAlias(a: CompetitionAlias): Promise<CompetitionAlias> { return a }
  async listCompetitionAliases(): Promise<CompetitionAlias[]> { return [] }
  async createFixtureIdentityResolutionRun(r: FixtureIdentityResolutionRun): Promise<FixtureIdentityResolutionRun> { return r }
  async updateFixtureIdentityResolutionRun(): Promise<{ count: number }> { return { count: 0 } }
  async getFixtureIdentityResolutionRun(): Promise<FixtureIdentityResolutionRun | null> { return null }
  async listFixtureIdentityResolutionRuns(): Promise<FixtureIdentityResolutionRun[]> { return [] }

  // ── B43 (Noop): entity mappings not persisted ──
  async saveProviderTeamMapping(m: ProviderTeamMapping): Promise<ProviderTeamMapping> { return m }
  async getProviderTeamMapping(): Promise<ProviderTeamMapping | null> { return null }
  async listProviderTeamMappings(): Promise<ProviderTeamMapping[]> { return [] }
  async listProviderTeamMappingsByStatus(): Promise<ProviderTeamMapping[]> { return [] }
  async updateProviderTeamMappingStatus(): Promise<{ count: number }> { return { count: 0 } }
  async saveProviderCompetitionMapping(m: ProviderCompetitionMapping): Promise<ProviderCompetitionMapping> { return m }
  async getProviderCompetitionMapping(): Promise<ProviderCompetitionMapping | null> { return null }
  async listProviderCompetitionMappings(): Promise<ProviderCompetitionMapping[]> { return [] }
  async listProviderCompetitionMappingsByStatus(): Promise<ProviderCompetitionMapping[]> { return [] }
  async updateProviderCompetitionMappingStatus(): Promise<{ count: number }> { return { count: 0 } }
  async saveProviderSeasonMapping(m: ProviderSeasonMapping): Promise<ProviderSeasonMapping> { return m }
  async getProviderSeasonMapping(): Promise<ProviderSeasonMapping | null> { return null }
  async listProviderSeasonMappings(): Promise<ProviderSeasonMapping[]> { return [] }
  async createEntityMappingDerivationRun(r: EntityMappingDerivationRun): Promise<EntityMappingDerivationRun> { return r }
  async updateEntityMappingDerivationRun(): Promise<{ count: number }> { return { count: 0 } }
  async getEntityMappingDerivationRun(): Promise<EntityMappingDerivationRun | null> { return null }
  async listEntityMappingDerivationRuns(): Promise<EntityMappingDerivationRun[]> { return [] }

  // ── B45 (Noop): historical memory not persisted; reads empty (→ insufficient_history) ──
  async saveTeamFundamentalMemory(p: TeamFundamentalMemoryProfile): Promise<TeamFundamentalMemoryProfile> { return p }
  async getTeamFundamentalMemory(): Promise<TeamFundamentalMemoryProfile | null> { return null }
  async listTeamFundamentalMemories(): Promise<TeamFundamentalMemoryProfile[]> { return [] }
  async saveMatchupFundamentalMemory(p: MatchupFundamentalMemoryProfile): Promise<MatchupFundamentalMemoryProfile> { return p }
  async getMatchupFundamentalMemory(): Promise<MatchupFundamentalMemoryProfile | null> { return null }
  async listMatchupFundamentalMemories(): Promise<MatchupFundamentalMemoryProfile[]> { return [] }
  async saveCompetitionMemory(p: CompetitionMemoryProfile): Promise<CompetitionMemoryProfile> { return p }
  async getCompetitionMemory(): Promise<CompetitionMemoryProfile | null> { return null }
  async listCompetitionMemories(): Promise<CompetitionMemoryProfile[]> { return [] }
  async saveHistoricalPatternContextProfile(p: HistoricalPatternContextProfile): Promise<HistoricalPatternContextProfile> { return p }
  async getHistoricalPatternContextProfile(): Promise<HistoricalPatternContextProfile | null> { return null }
  async listHistoricalPatternContextProfiles(): Promise<HistoricalPatternContextProfile[]> { return [] }
  async saveTabooCandidate(c: TabooCandidate): Promise<TabooCandidate> { return c }
  async getTabooCandidate(): Promise<TabooCandidate | null> { return null }
  async listTabooCandidates(): Promise<TabooCandidate[]> { return [] }
  async createMemoryBuildRun(r: MemoryBuildRun): Promise<MemoryBuildRun> { return r }
  async updateMemoryBuildRun(): Promise<{ count: number }> { return { count: 0 } }
  async getMemoryBuildRun(): Promise<MemoryBuildRun | null> { return null }
  async listMemoryBuildRuns(): Promise<MemoryBuildRun[]> { return [] }

  // ── B46 (Noop): influence ledger not persisted; reads empty ──
  async saveInfluenceLedgerEntry(e: InfluenceLedgerEntry): Promise<InfluenceLedgerEntry> { return e }
  async getInfluenceLedgerEntry(): Promise<InfluenceLedgerEntry | null> { return null }
  async listInfluenceLedgerEntries(): Promise<InfluenceLedgerEntry[]> { return [] }
  async listInfluenceLedgerEntriesByFixture(): Promise<InfluenceLedgerEntry[]> { return [] }
  async listInfluenceLedgerEntriesByPattern(): Promise<InfluenceLedgerEntry[]> { return [] }
  async createInfluenceBuildRun(r: InfluenceBuildRun): Promise<InfluenceBuildRun> { return r }
  async updateInfluenceBuildRun(): Promise<{ count: number }> { return { count: 0 } }
  async getInfluenceBuildRun(): Promise<InfluenceBuildRun | null> { return null }
  async listInfluenceBuildRuns(): Promise<InfluenceBuildRun[]> { return [] }

  // ── B47 (Noop): governance not persisted; reads empty (shadow still works) ──
  async saveAlertDecisionGovernanceResult(r: AlertDecisionGovernanceResult): Promise<AlertDecisionGovernanceResult> { return r }
  async getAlertDecisionGovernanceResult(): Promise<AlertDecisionGovernanceResult | null> { return null }
  async listAlertDecisionGovernanceResults(): Promise<AlertDecisionGovernanceResult[]> { return [] }
  async listGovernanceResultsByFixture(): Promise<AlertDecisionGovernanceResult[]> { return [] }
  async listGovernanceResultsByPattern(): Promise<AlertDecisionGovernanceResult[]> { return [] }
  async listGovernanceResultsByCandidate(): Promise<AlertDecisionGovernanceResult[]> { return [] }
  async saveAlertGovernanceHold(h: AlertGovernanceHold): Promise<AlertGovernanceHold> { return h }
  async getAlertGovernanceHold(): Promise<AlertGovernanceHold | null> { return null }
  async listAlertGovernanceHolds(): Promise<AlertGovernanceHold[]> { return [] }
  async updateAlertGovernanceHold(): Promise<{ count: number }> { return { count: 0 } }
  async createAlertGovernanceRun(r: AlertGovernanceRun): Promise<AlertGovernanceRun> { return r }
  async updateAlertGovernanceRun(): Promise<{ count: number }> { return { count: 0 } }
  async listAlertGovernanceRuns(): Promise<AlertGovernanceRun[]> { return [] }
  async saveAssumptionInvalidation(i: AssumptionInvalidation): Promise<AssumptionInvalidation> { return i }
  async listAssumptionInvalidationsByFixture(): Promise<AssumptionInvalidation[]> { return [] }

  // ── B48 (Noop): causal learning not persisted; reads empty ──
  async saveCausalLearningCase(c: CausalLearningCase): Promise<CausalLearningCase> { return c }
  async getCausalLearningCase(): Promise<CausalLearningCase | null> { return null }
  async listCausalLearningCases(): Promise<CausalLearningCase[]> { return [] }
  async listCausalLearningCasesByFixture(): Promise<CausalLearningCase[]> { return [] }
  async listCausalLearningCasesByPattern(): Promise<CausalLearningCase[]> { return [] }
  async saveDecisionOutcomeLink(l: DecisionOutcomeLink): Promise<DecisionOutcomeLink> { return l }
  async getDecisionOutcomeLink(): Promise<DecisionOutcomeLink | null> { return null }
  async listDecisionOutcomeLinks(): Promise<DecisionOutcomeLink[]> { return [] }
  async saveCausalLearningInsight(i: CausalLearningInsight): Promise<CausalLearningInsight> { return i }
  async listCausalLearningInsights(): Promise<CausalLearningInsight[]> { return [] }
  async listCausalLearningInsightsByFixture(): Promise<CausalLearningInsight[]> { return [] }
  async saveGovernanceCalibrationSuggestion(s: GovernanceCalibrationSuggestion): Promise<GovernanceCalibrationSuggestion> { return s }
  async getGovernanceCalibrationSuggestion(): Promise<GovernanceCalibrationSuggestion | null> { return null }
  async listGovernanceCalibrationSuggestions(): Promise<GovernanceCalibrationSuggestion[]> { return [] }
  async updateGovernanceCalibrationSuggestion(): Promise<{ count: number }> { return { count: 0 } }
  async saveVariableInfluenceCalibrationSuggestion(s: VariableInfluenceCalibrationSuggestion): Promise<VariableInfluenceCalibrationSuggestion> { return s }
  async getVariableInfluenceCalibrationSuggestion(): Promise<VariableInfluenceCalibrationSuggestion | null> { return null }
  async listVariableInfluenceCalibrationSuggestions(): Promise<VariableInfluenceCalibrationSuggestion[]> { return [] }
  async updateVariableInfluenceCalibrationSuggestion(): Promise<{ count: number }> { return { count: 0 } }
  async createCausalLearningRun(r: CausalLearningRun): Promise<CausalLearningRun> { return r }
  async updateCausalLearningRun(): Promise<{ count: number }> { return { count: 0 } }
  async listCausalLearningRuns(): Promise<CausalLearningRun[]> { return [] }

  // ── B49 (Noop): local validation not persisted; reads empty (→ insufficient_data) ──
  async saveLocalValidationRun(r: LocalValidationRun): Promise<LocalValidationRun> { return r }
  async getLocalValidationRun(): Promise<LocalValidationRun | null> { return null }
  async listLocalValidationRuns(): Promise<LocalValidationRun[]> { return [] }
  async updateLocalValidationRun(): Promise<{ count: number }> { return { count: 0 } }
  async saveLocalValidationFixtureSummary(s: LocalValidationFixtureSummary): Promise<LocalValidationFixtureSummary> { return s }
  async listLocalValidationFixtureSummaries(): Promise<LocalValidationFixtureSummary[]> { return [] }
  async saveLocalValidationReliabilityMetrics(m: LocalValidationReliabilityMetrics): Promise<LocalValidationReliabilityMetrics> { return m }
  async getLocalValidationReliabilityMetrics(): Promise<LocalValidationReliabilityMetrics | null> { return null }
  async saveLocalValidationCoverageMetrics(m: LocalValidationCoverageMetrics): Promise<LocalValidationCoverageMetrics> { return m }
  async getLocalValidationCoverageMetrics(): Promise<LocalValidationCoverageMetrics | null> { return null }
  async saveLocalValidationCostMetrics(m: LocalValidationCostMetrics): Promise<LocalValidationCostMetrics> { return m }
  async getLocalValidationCostMetrics(): Promise<LocalValidationCostMetrics | null> { return null }
  async saveLocalValidationGoNoGoReport(r: LocalValidationGoNoGoReport): Promise<LocalValidationGoNoGoReport> { return r }
  async getLocalValidationGoNoGoReport(): Promise<LocalValidationGoNoGoReport | null> { return null }
  async saveBackendHealthReport(r: BackendHealthReport): Promise<BackendHealthReport> { return r }
  async getBackendHealthReport(): Promise<BackendHealthReport | null> { return null }
}
