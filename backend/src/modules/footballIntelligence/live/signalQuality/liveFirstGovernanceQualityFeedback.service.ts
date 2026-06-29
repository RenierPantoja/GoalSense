/**
 * Live-First Governance Quality Feedback — B68 (Observe Only)
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates the QUALITY of governance decisions without changing runtime, policy,
 * or thresholds. Produces recommendations for human review only.
 */
import type {
  GovernanceQualityFeedback,
  GovernanceQualityFeedbackKind,
  LiveFirstSignalEvidenceStrength,
  LiveFirstSignalOutcomeAlignment,
} from './liveFirstSignalQuality.types.js'

export interface GovernanceDecisionInput {
  fixtureId: string
  governanceAction?: string | null // e.g. observe / monitor / out / alert_candidate
  evidenceStrength: LiveFirstSignalEvidenceStrength
  outcomeAlignment: LiveFirstSignalOutcomeAlignment
  hadMissingContext: boolean
}

export function evaluateGovernanceQuality(input: GovernanceDecisionInput): GovernanceQualityFeedback {
  const reasons: string[] = []
  const limitations: string[] = []
  let feedback: GovernanceQualityFeedbackKind = 'appropriate'

  const action = (input.governanceAction || 'observe').toLowerCase()

  // Data-limited cases are flagged distinctly (not a failure).
  if (input.hadMissingContext && input.evidenceStrength === 'insufficient') {
    feedback = 'data_limited'
    reasons.push('Decision was constrained by missing pre-match/live context.')
    limitations.push('ESPN does not provide lineup/injury/suspension pre-match.')
  } else if (input.outcomeAlignment === 'pending' || input.outcomeAlignment === 'not_evaluable') {
    feedback = 'pending_more_sample'
    reasons.push('Outcome not yet resolvable; defer judgement.')
  } else if (action.includes('alert') && (input.evidenceStrength === 'weak' || input.evidenceStrength === 'insufficient')) {
    feedback = 'too_aggressive'
    reasons.push('Alert-candidate posture with weak/insufficient evidence.')
  } else if ((action.includes('out') || action.includes('block')) && input.evidenceStrength === 'strong' && input.outcomeAlignment === 'aligned') {
    feedback = 'too_conservative'
    reasons.push('Strong, outcome-aligned evidence was held out.')
  } else if (input.evidenceStrength === 'insufficient') {
    feedback = 'insufficient_evidence'
    reasons.push('Evidence insufficient to justify any directional posture.')
  } else {
    reasons.push('Decision posture consistent with evidence and outcome.')
  }

  const recommendation = feedback === 'appropriate'
    ? 'No action; keep in observe.'
    : `Human review suggested (${feedback}); do NOT auto-calibrate.`

  return {
    fixtureId: input.fixtureId,
    feedback,
    reasons,
    recommendation,
    limitations: [
      ...limitations,
      'Observe only: no policy, threshold, or score change is applied.',
    ],
  }
}
