/**
 * Manual Intelligence — frontend types (B41).
 * ─────────────────────────────────────────────────────────────────────────────
 * Operator-entered data, always tagged with source + reliability. Never a provider.
 */
export type ManualIntelligenceSource =
  | 'manual_operator' | 'official_club' | 'official_competition' | 'journalist_report' | 'broadcast' | 'other'
export type ManualReliability = 'high' | 'medium' | 'low' | 'unknown'
export type ManualDomain = 'lineup' | 'injury' | 'suspension' | 'squad' | 'context' | 'referee' | 'venue' | 'competition_stage' | 'note'

export interface ManualIntelligenceRecordDto {
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
  payload: Record<string, unknown>
  note: string
  limitations: string[]
}

export interface CreateManualRecordPayload {
  teamId?: string | null
  side?: 'home' | 'away' | 'both' | 'unknown'
  domain: ManualDomain
  sourceType: ManualIntelligenceSource
  sourceLabel: string
  sourceUrl?: string | null
  reliability?: ManualReliability
  payload?: Record<string, unknown>
  note?: string
}

export const MANUAL_DOMAIN_LABEL: Record<ManualDomain, string> = {
  lineup: 'Escalação', injury: 'Lesão', suspension: 'Suspensão', squad: 'Elenco',
  context: 'Contexto', referee: 'Árbitro', venue: 'Estádio', competition_stage: 'Fase', note: 'Nota',
}
export const MANUAL_SOURCE_LABEL: Record<ManualIntelligenceSource, string> = {
  manual_operator: 'Operador', official_club: 'Clube oficial', official_competition: 'Competição oficial',
  journalist_report: 'Jornalista', broadcast: 'Transmissão', other: 'Outro',
}
