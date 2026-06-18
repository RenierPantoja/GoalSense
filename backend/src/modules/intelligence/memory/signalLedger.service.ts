/**
 * Signal Ledger builder (Phase B12).
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure constructor for a SignalLedgerEntry. Persistence is the repository's job;
 * orchestration is intelligenceMemory.service's job.
 */
import type { SignalLedgerEntry, SignalStatus, SignalEvidenceSnapshot, DataAvailabilityMap } from '../contracts/intelligence.types.js'
import { ledgerId } from '../utils/intelligenceId.util.js'

export interface LedgerBuildInput {
  alertId: string | null
  patternId: string | null
  userId: string
  radarName: string
  fixtureId: string
  fixtureLabel: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  score: { home: number; away: number }
  signalStatus: SignalStatus
  signalType: string
  confidence: number | null
  severity: string
  evidence: SignalEvidenceSnapshot | null
  scopeReason: string | null
  matchContext: SignalLedgerEntry['matchContext']
  dataAvailability: DataAvailabilityMap
}

export function buildLedgerEntry(i: LedgerBuildInput): SignalLedgerEntry {
  const now = new Date().toISOString()
  return {
    id: ledgerId({ alertId: i.alertId, fixtureId: i.fixtureId, patternId: i.patternId, minute: i.minute }),
    alertId: i.alertId,
    patternId: i.patternId,
    userId: i.userId,
    radarName: i.radarName,
    fixtureId: i.fixtureId,
    fixtureLabel: i.fixtureLabel,
    leagueName: i.leagueName,
    homeTeam: i.homeTeam,
    awayTeam: i.awayTeam,
    minute: i.minute,
    scoreState: i.score,
    signalStatus: i.signalStatus,
    signalType: i.signalType,
    confidenceAtSignal: i.confidence,
    severity: i.severity,
    evidence: i.evidence,
    scopeDecision: i.scopeReason ? { reason: i.scopeReason } : null,
    matchContext: i.matchContext,
    dataAvailability: i.dataAvailability,
    createdAt: now,
    updatedAt: now,
  }
}
