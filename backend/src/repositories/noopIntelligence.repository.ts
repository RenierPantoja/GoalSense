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
  async createMissedOpportunity(record: MissedOpportunityRecord): Promise<MissedOpportunityRecord> { warnOnce(); return record }

  async createLearningEvent(event: LearningEvent): Promise<LearningEvent> { warnOnce(); return event }
  async listLearningEventsByPattern(): Promise<LearningEvent[]> { return [] }

  async getOverview(): Promise<IntelligenceOverview> {
    const outcomeBreakdown: Record<AlertResult, number> = { pending: 0, confirmed: 0, confirmed_partial: 0, failed: 0, unknown: 0, expired: 0 }
    return { ledgerEntries: 0, outcomes: 0, outcomeBreakdown, failureAnalyses: 0, learningEvents: 0, missedOpportunities: 0, generatedAt: new Date().toISOString() }
  }
}
