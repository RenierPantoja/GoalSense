/**
 * Opportunity action helpers (Phase B21) — PURE, env-free, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Folds an append-only action log into a summary + user-state. No persistence,
 * no learning, no side effects. Last write wins for toggle states.
 */
import type {
  AutoOpportunityAction, AutoOpportunityActionType, AutoOpportunityFeedbackType,
  AutoOpportunityActionSummary, AutoOpportunityUserState,
} from '../autoEngine.types.js'

function toDate(v: any): number { return (v instanceof Date ? v : new Date(v)).getTime() }

export const FEEDBACK_TO_ACTION: Record<AutoOpportunityFeedbackType, AutoOpportunityActionType> = {
  useful: 'marked_useful', strong_signal: 'marked_useful', interesting_but_weak: 'feedback_recorded',
  not_useful: 'marked_not_useful', irrelevant: 'marked_not_useful', too_early: 'feedback_recorded',
  too_late: 'feedback_recorded', data_poor: 'feedback_recorded', context_wrong: 'feedback_recorded',
  already_seen: 'feedback_recorded', unknown: 'feedback_recorded',
}

/** PURE — fold an append-only action log into a summary (sorted oldest→newest). */
export function summarizeActions(opportunityId: string, actions: AutoOpportunityAction[]): AutoOpportunityActionSummary {
  const sorted = [...actions].sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt))
  let saved = false, dismissed = false, hasPromotionPlan = false
  let lastFeedback: AutoOpportunityFeedbackType | null = null
  let promotedAlertId: string | null = null
  let promotedAlertOutcome: AutoOpportunityActionSummary['promotedAlertOutcome'] = null
  let promotedAlertResolvedAt: string | null = null
  const feedbackCounts: Record<string, number> = {}
  const notes: { note: string; createdAt: string }[] = []

  for (const a of sorted) {
    switch (a.actionType) {
      case 'saved': saved = true; break
      case 'unsaved': saved = false; break
      case 'dismissed': case 'ignored_for_now': dismissed = true; break
      case 'restored': dismissed = false; break
      case 'radar_proposal_created': hasPromotionPlan = true; break
      case 'manual_alert_promoted': { const id = a.metadata && typeof a.metadata.alertId === 'string' ? a.metadata.alertId : null; if (id) promotedAlertId = id; break }
      case 'promoted_alert_resolved': {
        const r = a.metadata && typeof a.metadata.result === 'string' ? a.metadata.result : null
        if (r) promotedAlertOutcome = r as AutoOpportunityActionSummary['promotedAlertOutcome']
        promotedAlertResolvedAt = (a.metadata && typeof a.metadata.resolvedAt === 'string' ? a.metadata.resolvedAt : null) || a.createdAt
        const aid = a.metadata && typeof a.metadata.alertId === 'string' ? a.metadata.alertId : null
        if (aid) promotedAlertId = aid
        break
      }
      case 'note_added': if (a.note) notes.push({ note: a.note, createdAt: a.createdAt }); break
      case 'note_removed': if (a.note) { const i = notes.findIndex(n => n.note === a.note); if (i >= 0) notes.splice(i, 1) } break
      default: break
    }
    if (a.feedbackType) { feedbackCounts[a.feedbackType] = (feedbackCounts[a.feedbackType] || 0) + 1; lastFeedback = a.feedbackType }
  }

  return {
    opportunityId,
    totalActions: sorted.length,
    saved, dismissed, lastFeedback, feedbackCounts,
    noteCount: notes.length, notes: notes.slice(-20),
    hasPromotionPlan,
    promotedAlertId,
    promotedAlertOutcome,
    promotedAlertResolvedAt,
    lastActionAt: sorted.length > 0 ? sorted[sorted.length - 1].createdAt : null,
  }
}

export function userStateFromSummary(opportunityId: string, fixtureId: string, s: AutoOpportunityActionSummary): AutoOpportunityUserState {
  return {
    id: `aus_${opportunityId}`, opportunityId, fixtureId,
    saved: s.saved, dismissed: s.dismissed, lastFeedback: s.lastFeedback,
    noteCount: s.noteCount, hasPromotionPlan: s.hasPromotionPlan, promotedAlertId: s.promotedAlertId,
    promotedAlertOutcome: s.promotedAlertOutcome, promotedAlertResolvedAt: s.promotedAlertResolvedAt,
    updatedAt: new Date().toISOString(),
  }
}
