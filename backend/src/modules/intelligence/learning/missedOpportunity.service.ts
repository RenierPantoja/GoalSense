/**
 * Missed Opportunity builder (Phase B12) — conservative foundation.
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture-ready, but deliberately conservative: it ONLY produces a record
 * when a concrete near-miss is supplied (an almost-matched radar with a known
 * missing condition). With no near-miss scanner yet, the orchestration never
 * feeds it positive data, so NO false missed-opportunities are created.
 * Better to record nothing than to invent an opportunity.
 */
import type { MissedOpportunityRecord, DataAvailabilityMap } from '../contracts/intelligence.types.js'
import { missedOpportunityId } from '../utils/intelligenceId.util.js'

export interface MissedOpportunityInput {
  fixtureId: string
  patternId: string | null
  eventType: string
  eventMinute: number | null
  almostMatchedConditions: string[]
  missingConditions: string[]
  dataAvailability: DataAvailabilityMap
  suggestedReview?: string | null
}

/**
 * Returns a record only when the near-miss is real and safe to log: there must
 * be at least one almost-matched condition AND exactly the missing conditions
 * that prevented the alert. Otherwise returns null (record nothing).
 */
export function maybeBuildMissedOpportunity(i: MissedOpportunityInput): MissedOpportunityRecord | null {
  if (!i.fixtureId || !i.eventType) return null
  if (i.almostMatchedConditions.length === 0) return null
  if (i.missingConditions.length === 0) return null

  return {
    id: missedOpportunityId({ fixtureId: i.fixtureId, patternId: i.patternId, eventType: i.eventType, eventMinute: i.eventMinute }),
    fixtureId: i.fixtureId,
    patternId: i.patternId,
    eventType: i.eventType,
    eventMinute: i.eventMinute,
    almostMatchedConditions: i.almostMatchedConditions,
    missingConditions: i.missingConditions,
    suggestedReview: i.suggestedReview ?? null,
    dataAvailability: i.dataAvailability,
    createdAt: new Date().toISOString(),
  }
}
