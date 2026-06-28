/**
 * Alert Decision Governance Service — B57 Live-First Integration
 * ─────────────────────────────────────────────────────────────────────────────
 * Governance evaluation for live-first monitoring. Always in observe mode.
 */
import { createRepositories } from '../../../repositories/index.js'

export async function evaluateAlertDecisionGovernance(params: {
  fixtureId: string
  source: string
  momentum?: any
  influence?: any
  readiness?: any
  precheck?: any
  mode?: string
  triggeredBy?: string
}): Promise<any> {
  try {
    const { fixtureId, source, momentum, influence, readiness, precheck, mode, triggeredBy } = params

    // Live-first governance is always observe-only
    const isLiveFirst = mode === 'observe' || source.includes('live_first')

    let decision = 'observe'
    let shouldTriggerAlert = false
    let confidence = 0.3

    const factors: string[] = []
    const limitations: string[] = []

    if (isLiveFirst) {
      limitations.push('Live-first mode: observe only, no alert enforcement')
      decision = 'observe'
      shouldTriggerAlert = false
    }

    // Evaluate components if available
    if (momentum && momentum.confidence > 0.5) {
      factors.push(`Momentum ${momentum.direction} (${momentum.confidence.toFixed(2)})`)
      confidence += 0.1
    }

    if (influence && influence.confidence > 0.4) {
      factors.push(`Influence score ${influence.influenceScore.toFixed(2)}`)
      confidence += 0.1
    }

    if (readiness && readiness.overallReadiness > 0.5) {
      factors.push(`Readiness ${readiness.overallReadiness.toFixed(2)}`)
      confidence += 0.1
    }

    if (precheck && !precheck.shouldProceed) {
      factors.push(`Precheck blocked: ${precheck.blockers.join(', ')}`)
      decision = 'blocked'
    }

    // Trigger evaluation based on source
    if (triggeredBy === 'live_recheck') {
      factors.push('Triggered by live event change')
      confidence += 0.05
    }

    if (factors.length === 0) {
      factors.push('No significant governance factors')
      limitations.push('Insufficient data for strong governance evaluation')
    }

    const result = {
      fixtureId,
      decision,
      shouldTriggerAlert,
      confidence: Math.min(confidence, 1.0),
      source,
      triggeredBy,
      factors,
      limitations,
      isObserveMode: isLiveFirst,
      evaluatedAt: new Date().toISOString()
    }

    // Save governance result (non-blocking)
    const repos = createRepositories()
    try {
      // This would save to the governance results collection
      // For now, just log that we evaluated
      console.log(`[Governance] ${fixtureId}: ${decision} (confidence: ${confidence.toFixed(2)})`)
    } catch (saveError) {
      // Non-fatal
    }

    return result

  } catch (error: any) {
    return {
      fixtureId: params.fixtureId,
      decision: 'error',
      shouldTriggerAlert: false,
      confidence: 0.1,
      source: params.source,
      factors: [],
      limitations: [`Governance evaluation failed: ${error?.message}`],
      isObserveMode: true,
      evaluatedAt: new Date().toISOString()
    }
  }
}