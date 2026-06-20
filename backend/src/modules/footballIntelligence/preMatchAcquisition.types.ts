/**
 * Pre-Match Acquisition — contracts (B40).
 * ─────────────────────────────────────────────────────────────────────────────
 * Temporal acquisition tasks/runs, persisted domain snapshots, lineup-window and
 * player-importance shapes. Every snapshot carries fetchedAt/freshness/availability
 * and an expiresAt. Absent ≠ zero; provider_not_supported/unavailable are explicit.
 */
import type { AcquisitionDomain, FetchAvailability, Freshness } from './providers/provider.types.js'

export type AcquisitionWindow = 'T-24h' | 'T-6h' | 'T-90min' | 'T-60min' | 'T-15min' | 'live' | 'post'

export type AcquisitionTaskStatus =
  | 'scheduled' | 'ran' | 'skipped_not_due' | 'skipped_budget' | 'skipped_unsupported'
  | 'not_available_yet' | 'failed_non_fatal'

export interface PreMatchAcquisitionTask {
  fixtureId: string
  domain: AcquisitionDomain
  window: AcquisitionWindow
  scheduledFor: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  providerCandidates: string[]
  status: AcquisitionTaskStatus
  lastRunAt: string | null
  resultAvailability: FetchAvailability | null
  limitations: string[]
}

export interface PreMatchDomainSnapshot {
  id: string
  fixtureId: string
  domain: AcquisitionDomain
  provider: string | null
  fetchedAt: string
  freshness: Freshness
  availability: FetchAvailability
  dataQuality: 'rich' | 'partial' | 'poor' | 'unavailable' | 'unknown'
  payloadSummary: string
  canonicalData: unknown | null
  limitations: string[]
  expiresAt: string | null
  // ── B44: critical domain snapshot store V2 (all optional, additive) ──
  providerEntityMappingsUsed?: string[]
  providerEndpointKey?: string | null
  domainUnlockStatus?: string
  idsResolved?: Record<string, string | null>
  idsMissing?: string[]
  sourceBreakdown?: { provider: boolean; manual: boolean }
  manualFallbackAvailable?: boolean
  providerResponseStatus?: string
  confirmedEmpty?: boolean
  reliability?: 'high' | 'medium' | 'low' | 'unknown'
  refreshReason?: string
}

export type AcquisitionRunStatus = 'completed' | 'completed_with_limitations' | 'failed_non_fatal' | 'disabled'

export interface PreMatchAcquisitionRun {
  id: string
  scope: 'today' | 'fixture'
  fixtureId: string | null
  startedAt: string
  completedAt: string | null
  mode: 'manual' | 'scheduled'
  tasksPlanned: number
  tasksRan: number
  tasksSkipped: number
  domainsAvailable: number
  domainsUnavailable: number
  domainsUnsupported: number
  providerCallsBlocked: number
  status: AcquisitionRunStatus
  limitations: string[]
}

export type LineupWindowStatus =
  | 'too_early' | 'probable_expected' | 'confirmed_expected_soon' | 'confirmed_available'
  | 'confirmed_unavailable' | 'provider_not_supported' | 'stale' | 'unknown'

export interface LineupWindowState {
  fixtureId: string
  status: LineupWindowStatus
  minutesToKickoff: number | null
  lineupSnapshotAt: string | null
  shouldWait: boolean
  shouldRefreshNow: boolean
  nextRecommendedCheckAt: string | null
  limitations: string[]
}

export interface LineupImpact {
  keyPlayerMissing: boolean | 'unknown'
  keyPlayerReturned: boolean | 'unknown'
  tacticalShapeChanged: boolean | 'unknown'
  goalkeeperChanged: boolean | 'unknown'
  defenseWeakened: boolean | 'unknown'
  attackWeakened: boolean | 'unknown'
  rotationDetected: boolean | 'unknown'
  analysisImpact: 'positive' | 'negative' | 'neutral' | 'uncertain' | 'blocking'
  shouldReevaluatePrecheck: boolean
  shouldWait: boolean
  limitations: string[]
}

export type PlayerImportanceLevel = 'key' | 'regular_starter' | 'rotation' | 'bench' | 'unknown'

export interface PlayerImportanceProfile {
  playerId: string | null
  playerName: string
  teamId: string | null
  position: string | null
  importanceLevel: PlayerImportanceLevel
  evidence: string[]
  dataQuality: 'rich' | 'partial' | 'poor' | 'unavailable' | 'unknown'
  limitations: string[]
}
