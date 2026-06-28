/**
 * Live-First Intelligence Loop Service — B57 Real-Time Analysis
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes the full intelligence pipeline for each live snapshot:
 * normalize → momentum → variables → influence → readiness → precheck → governance
 */
import { createRepositories } from '../../../repositories/index.js'
import { buildMatchIntelligencePackageV5 } from '../matchIntelligencePackageV5.service.js'
import { interpretLiveMomentum } from '../../../modules/intelligence/autoEngine/liveMomentumInterpreter.service.js'
import { extractLiveFirstVariables } from '../influence/liveFirstVariableExtraction.service.js'
import { buildInfluenceAssessment } from '../influence/influenceEngine.service.js'
import { buildReadinessV8 } from '../fundamentalReadinessEngine.service.js'
import { runAlertDecisionPrecheck } from '../alertDecisionPrecheck.service.js'
import { evaluateAlertDecisionGovernance } from '../governance/alertDecisionGovernance.service.js'
import type { LiveSnapshotDiff } from './liveMonitoringSession.types.js'

interface LiveFirstAnalysisResult {
  fixtureId: string
  snapshotId: string
  momentum: any
  variables: any
  influence: any
  readiness: any
  precheck: any
  governance: any
  analysisQuality: 'rich' | 'partial' | 'poor'
  limitations: string[]
  processingTime: number
}

/**
 * Analyze live snapshot with full intelligence loop
 */
export async function analyzeLiveSnapshot(
  snapshotId: string,
  fixtureId: string,
  diff?: LiveSnapshotDiff
): Promise<LiveFirstAnalysisResult> {
  const start = Date.now()
  const repos = createRepositories()
  const limitations: string[] = []

  try {
    // Get snapshot data
    const snapshot = await repos.liveSnapshots.findLatestByFixture(fixtureId)
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`)
    }

    // Parse enriched data
    const stats = snapshot.statsJson ? JSON.parse(snapshot.statsJson) : null
    const events = snapshot.eventsJson ? JSON.parse(snapshot.eventsJson) : null

    // 1. Normalize snapshot (ESPN → canonical format)
    const normalizedSnapshot = normalizeEspnSnapshot(snapshot, stats, events)

    // 2. Interpret live momentum
    const momentum = await interpretLiveMomentum(normalizedSnapshot, diff)
    if (!momentum || momentum.confidence < 0.3) {
      limitations.push('Low momentum confidence due to limited live data')
    }

    // 3. Extract live-first variables
    const variables = await extractLiveFirstVariables(normalizedSnapshot, stats, events)
    if (!variables || Object.keys(variables).length < 5) {
      limitations.push('Limited variable extraction from live data')
    }

    // 4. Build influence assessment (best effort with available data)
    const influence = await buildInfluenceAssessment(fixtureId, variables, 'live_first')
    if (!influence || influence.totalVariables < 3) {
      limitations.push('Minimal influence assessment due to missing pre-match data')
    }

    // 5. Build readiness V8 (live-first mode)
    const readiness = await buildReadinessV8(fixtureId, 'live_first')
    if (readiness.overallReadiness < 0.4) {
      limitations.push('Low readiness due to missing pre-match context')
    }

    // 6. Run precheck V8 (live-first validation)
    const precheck = await runAlertDecisionPrecheck(fixtureId)
    const shouldProceed = precheck.decision === 'allow_alert'
    if (!shouldProceed) {
      limitations.push(`Precheck blocked: ${precheck.reasons.join(', ')}`)
    }

    // 7. Evaluate governance (observe mode for live rechecks)
    const governance = await evaluateAlertDecisionGovernance({
      fixtureId,
      source: 'live_first_analysis',
      momentum,
      influence,
      readiness,
      precheck,
      mode: 'observe', // Never enforce on live-first
      triggeredBy: diff ? 'live_recheck' : 'live_analysis'
    })

    // Determine analysis quality
    const analysisQuality = determineAnalysisQuality(
      momentum, variables, influence, readiness, stats, events
    )

    const processingTime = Date.now() - start

    return {
      fixtureId,
      snapshotId,
      momentum,
      variables,
      influence,
      readiness,
      precheck,
      governance,
      analysisQuality,
      limitations,
      processingTime
    }

  } catch (error: any) {
    const processingTime = Date.now() - start

    return {
      fixtureId,
      snapshotId,
      momentum: null,
      variables: null,
      influence: null,
      readiness: null,
      precheck: null,
      governance: null,
      analysisQuality: 'poor',
      limitations: [`Analysis failed: ${error?.message || 'unknown'}`],
      processingTime
    }
  }
}

/**
 * Build live-first intelligence for a fixture (current state)
 */
export async function buildLiveFirstIntelligenceForFixture(fixtureId: string): Promise<any> {
  const repos = createRepositories()

  try {
    // Get latest snapshot
    const snapshot = await repos.liveSnapshots.findLatestByFixture(fixtureId)
    if (!snapshot) {
      return { error: 'No snapshots available', limitations: ['No live data captured yet'] }
    }

    const snapshotId = String(snapshot.id)
    return await analyzeLiveSnapshot(snapshotId, fixtureId)

  } catch (error: any) {
    return {
      error: error?.message || 'Failed to build intelligence',
      limitations: ['Intelligence loop failed']
    }
  }
}

/**
 * Build governance assessment for a specific snapshot
 */
export async function buildLiveFirstGovernanceForSnapshot(
  snapshotId: string,
  previousSnapshotId?: string
): Promise<any> {
  const repos = createRepositories()

  try {
    // Get snapshots for diff
    const [current, previous] = await Promise.all([
      (repos.liveSnapshots as any).findById ? (repos.liveSnapshots as any).findById(snapshotId) : null,
      previousSnapshotId && (repos.liveSnapshots as any).findById ? (repos.liveSnapshots as any).findById(previousSnapshotId) : null
    ])

    if (!current) {
      return { error: 'Current snapshot not found' }
    }

    // Create diff if we have previous snapshot
    let diff = null
    if (previous) {
      // Import and use the diff service
      const { detectSnapshotChanges } = await import('./liveSnapshotDiff.service.js')
      diff = detectSnapshotChanges(
        {
          id: snapshotId,
          minute: current.minute,
          status: current.status,
          scoreHome: current.scoreHome,
          scoreAway: current.scoreAway,
          statsJson: current.statsJson,
          eventsJson: current.eventsJson,
          createdAt: current.createdAt || new Date().toISOString()
        },
        {
          id: previousSnapshotId!,
          minute: previous.minute,
          status: previous.status,
          scoreHome: previous.scoreHome,
          scoreAway: previous.scoreAway,
          statsJson: previous.statsJson,
          eventsJson: previous.eventsJson,
          createdAt: previous.createdAt || new Date().toISOString()
        },
        current.fixtureId
      ) as LiveSnapshotDiff
    }

    return await analyzeLiveSnapshot(snapshotId, current.fixtureId, diff || undefined)

  } catch (error: any) {
    return {
      error: error?.message || 'Failed to build governance assessment',
      limitations: ['Governance assessment failed']
    }
  }
}

/**
 * Explain the live-first analysis for a fixture
 */
export async function explainLiveFirstAnalysis(fixtureId: string): Promise<{
  hasData: boolean
  lastAnalysis: any
  explanation: string[]
  recommendations: string[]
}> {
  const repos = createRepositories()

  try {
    const fixture = await repos.fixtures.findById(fixtureId)
    if (!fixture) {
      return {
        hasData: false,
        lastAnalysis: null,
        explanation: ['Fixture not found'],
        recommendations: ['Check fixture ID']
      }
    }

    const intelligence = await buildLiveFirstIntelligenceForFixture(fixtureId)

    const explanation: string[] = []
    const recommendations: string[] = []

    if (intelligence.error) {
      explanation.push(`Analysis failed: ${intelligence.error}`)
      recommendations.push('Ensure ESPN live worker is running')
      recommendations.push('Check if fixture has live snapshots')

      return { hasData: false, lastAnalysis: null, explanation, recommendations }
    }

    // Explain analysis components
    explanation.push(`Analysis quality: ${intelligence.analysisQuality}`)
    explanation.push(`Processing time: ${intelligence.processingTime}ms`)

    if (intelligence.momentum) {
      explanation.push(`Momentum confidence: ${intelligence.momentum.confidence}`)
      explanation.push(`Momentum direction: ${intelligence.momentum.direction || 'neutral'}`)
    } else {
      explanation.push('No momentum data available')
    }

    if (intelligence.readiness) {
      explanation.push(`Overall readiness: ${intelligence.readiness.overallReadiness}`)
    }

    if (intelligence.governance) {
      explanation.push(`Governance result: ${intelligence.governance.decision}`)
      explanation.push(`Should trigger alert: ${intelligence.governance.shouldTriggerAlert}`)
    }

    // Limitations
    if (intelligence.limitations.length > 0) {
      explanation.push('Limitations:')
      intelligence.limitations.forEach((limit: string) => explanation.push(`  • ${limit}`))
    }

    // Recommendations
    if (intelligence.analysisQuality === 'poor') {
      recommendations.push('Enable ESPN summary enrichment for better data')
      recommendations.push('Wait for more live events to improve analysis')
    }

    if (intelligence.readiness && intelligence.readiness.overallReadiness < 0.5) {
      recommendations.push('Consider pre-match data acquisition for better context')
    }

    return {
      hasData: true,
      lastAnalysis: intelligence,
      explanation,
      recommendations
    }

  } catch (error: any) {
    return {
      hasData: false,
      lastAnalysis: null,
      explanation: [`Failed to explain analysis: ${error?.message}`],
      recommendations: ['Check system logs', 'Verify fixture data integrity']
    }
  }
}

// Helper functions

function normalizeEspnSnapshot(snapshot: any, stats: any, events: any) {
  return {
    id: snapshot.id,
    fixtureId: snapshot.fixtureId,
    minute: snapshot.minute,
    status: snapshot.status,
    score: {
      home: snapshot.scoreHome,
      away: snapshot.scoreAway
    },
    penalty: {
      home: snapshot.penaltyHome,
      away: snapshot.penaltyAway
    },
    stats: stats || {},
    events: events || [],
    dataQuality: snapshot.dataQuality,
    provider: snapshot.provider,
    timestamp: snapshot.createdAt,
    freshness: determineFreshness(snapshot.createdAt)
  }
}

function determineFreshness(timestamp: string): 'fresh' | 'stale' | 'unknown' {
  try {
    const age = Date.now() - new Date(timestamp).getTime()
    if (age < 2 * 60 * 1000) return 'fresh' // < 2 minutes
    if (age < 5 * 60 * 1000) return 'stale' // < 5 minutes
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function determineAnalysisQuality(
  momentum: any,
  variables: any,
  influence: any,
  readiness: any,
  stats: any,
  events: any
): 'rich' | 'partial' | 'poor' {
  let score = 0

  // Momentum quality
  if (momentum && momentum.confidence > 0.7) score += 3
  else if (momentum && momentum.confidence > 0.4) score += 2
  else if (momentum) score += 1

  // Variable completeness
  if (variables && Object.keys(variables).length > 8) score += 3
  else if (variables && Object.keys(variables).length > 4) score += 2
  else if (variables) score += 1

  // Influence assessment
  if (influence && influence.totalVariables > 5) score += 2
  else if (influence && influence.totalVariables > 2) score += 1

  // Readiness
  if (readiness && readiness.overallReadiness > 0.6) score += 2
  else if (readiness && readiness.overallReadiness > 0.3) score += 1

  // Data richness
  if (stats && events && Array.isArray(events) && events.length > 0) score += 2
  else if (stats || (events && Array.isArray(events) && events.length > 0)) score += 1

  if (score >= 10) return 'rich'
  if (score >= 6) return 'partial'
  return 'poor'
}