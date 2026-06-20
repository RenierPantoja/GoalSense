/**
 * Manual Intelligence Intake — contracts (B41).
 * ─────────────────────────────────────────────────────────────────────────────
 * Operator-entered real data (lineups/injuries/suspensions/context) used while
 * external providers are not configured. Manual data is ALWAYS tagged with its
 * sourceType + reliability + audit, and NEVER masquerades as a provider. It is not
 * mock — it is operational data the operator obtained from a trusted external source.
 */

export type ManualIntelligenceSource =
  | 'manual_operator' | 'official_club' | 'official_competition' | 'journalist_report' | 'broadcast' | 'other'

export type ManualReliability = 'high' | 'medium' | 'low' | 'unknown'

export type ManualDomain = 'lineup' | 'injury' | 'suspension' | 'squad' | 'context' | 'referee' | 'venue' | 'competition_stage' | 'note'

export interface ManualIntelligenceAudit {
  enteredBy: string | null
  enteredAt: string
  updatedBy?: string | null
  updatedAt?: string | null
  action: 'created' | 'updated' | 'deleted'
}

export interface ManualIntelligenceRecord {
  id: string
  fixtureId: string
  teamId: string | null
  side: 'home' | 'away' | 'both' | 'unknown'
  domain: ManualDomain
  sourceType: ManualIntelligenceSource
  sourceLabel: string
  sourceUrl: string | null
  reliability: ManualReliability
  enteredBy: string | null
  enteredAt: string
  updatedAt: string | null
  expiresAt: string | null
  /** Structured operator payload (e.g. { players: [...] }, { playerName, reason }). */
  payload: Record<string, unknown>
  note: string
  limitations: string[]
  audit: ManualIntelligenceAudit[]
  deleted?: boolean
}

export interface CreateManualRecordInput {
  fixtureId: string
  teamId?: string | null
  side?: 'home' | 'away' | 'both' | 'unknown'
  domain: ManualDomain
  sourceType: ManualIntelligenceSource
  sourceLabel: string
  sourceUrl?: string | null
  reliability?: ManualReliability
  payload?: Record<string, unknown>
  note?: string
  expiresAt?: string | null
  enteredBy?: string | null
}
