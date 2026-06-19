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
  BacktestRun, ReplayRun, PersistedBacktestSignalResult,
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
}
