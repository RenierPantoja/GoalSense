/**
 * Influence Engine Service — B57 Stub for Live-First
 * ─────────────────────────────────────────────────────────────────────────────
 * Simplified influence assessment for live-first mode.
 */

export async function buildInfluenceAssessment(
  fixtureId: string,
  variables: any,
  mode: string = 'standard'
): Promise<any> {
  try {
    if (!variables || typeof variables !== 'object') {
      return {
        totalVariables: 0,
        influenceScore: 0,
        confidence: 0.1,
        limitations: ['No variables provided for influence assessment']
      }
    }

    const variableCount = Object.keys(variables).length
    const dataCompleteness = variables.dataCompleteness || 0

    // Simple influence score based on available data
    let influenceScore = 0
    if (variables.isLead) influenceScore += 0.2
    if (variables.possessionDominance && variables.possessionDominance !== 'balanced') influenceScore += 0.15
    if (variables.shotsAdvantage && variables.shotsAdvantage !== 'balanced') influenceScore += 0.1
    if (variables.momentumDirection && variables.momentumDirection !== 'neutral') influenceScore += 0.1

    const confidence = Math.min(dataCompleteness * 0.8 + 0.2, 1.0)

    return {
      totalVariables: variableCount,
      influenceScore,
      confidence,
      mode,
      dataCompleteness,
      limitations: mode === 'live_first' ? ['Limited to live ESPN data only'] : []
    }
  } catch (error: any) {
    return {
      totalVariables: 0,
      influenceScore: 0,
      confidence: 0.1,
      limitations: [`Influence assessment failed: ${error?.message}`]
    }
  }
}