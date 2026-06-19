/**
 * Auto Engine Calibration (Phase B24) — read-side overview + prudent derivations.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the latest persisted Auto Engine learning profile and exposes an honest,
 * cautious calibration overview. No certainty language, no probability, no
 * auto-application. Empty/honest states when there is not enough data.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import type {
  AutoEngineLearningProfile, AutoEngineCalibrationOverview, AutoOpportunityTypeProfile,
  AutoEngineLearningRecommendation,
} from './autoEngineLearning.types.js'
import type { OpportunityType } from './autoEngine.types.js'

export function isAutoEngineLearningSchedulerEnabled(): boolean {
  return String(env.ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER).toLowerCase() === 'true'
}

export async function getLatestAutoEngineLearningProfile(): Promise<AutoEngineLearningProfile | null> {
  const repos = createRepositories()
  return repos.intelligence.getLatestAutoEngineLearningProfile().catch(() => null)
}

export async function getAutoOpportunityTypeProfile(type: string): Promise<AutoOpportunityTypeProfile | null> {
  const profile = await getLatestAutoEngineLearningProfile()
  if (!profile) return null
  return profile.opportunityTypeProfiles.find(p => p.opportunityType === type) ?? null
}

export async function listAutoEngineLearningRecommendations(limit = 50): Promise<AutoEngineLearningRecommendation[]> {
  const profile = await getLatestAutoEngineLearningProfile()
  if (!profile) return []
  return profile.recommendations.slice(0, limit)
}

const STRENGTH_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

export async function getAutoEngineCalibrationOverview(): Promise<AutoEngineCalibrationOverview> {
  const generatedAt = new Date().toISOString()
  const profile = await getLatestAutoEngineLearningProfile()
  const runs = await createRepositories().intelligence.listAutoEngineLearningRuns(1).catch(() => [])
  const lastRunAt = runs[0]?.finishedAt || runs[0]?.startedAt || null

  if (!profile || profile.sampleSize === 0) {
    return {
      hasData: false, sampleSize: 0, promotedAlertsTotal: profile?.promotedAlertsTotal ?? 0,
      usefulRate: null, failedRate: null, unknownRate: null, sampleQuality: 'insufficient',
      topCalibratedOpportunityType: null, highestUnknownOpportunityType: null,
      scoreCalibration: profile?.scoreCalibration ?? null, topRecommendations: profile?.recommendations.slice(0, 5) ?? [],
      lastRunAt,
      limitations: profile?.limitations ?? ['Ainda não há outcomes suficientes de alertas promovidos para calibrar o Motor Automático.'],
      generatedAt,
    }
  }

  const eligible = profile.opportunityTypeProfiles.filter(p => p.sampleQuality !== 'insufficient')
  const topCalibrated = [...eligible].filter(p => p.usefulRate != null).sort((a, b) => (b.usefulRate ?? -1) - (a.usefulRate ?? -1))[0] || null
  const highestUnknown = [...eligible].filter(p => p.unknownRate != null).sort((a, b) => (b.unknownRate ?? -1) - (a.unknownRate ?? -1))[0] || null

  const topRecommendations = [...profile.recommendations]
    .sort((a, b) => (STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength]) || (b.evidence.sampleSize - a.evidence.sampleSize))
    .slice(0, 5)

  return {
    hasData: true, sampleSize: profile.sampleSize, promotedAlertsTotal: profile.promotedAlertsTotal,
    usefulRate: profile.usefulRate, failedRate: profile.failedRate, unknownRate: profile.unknownRate,
    sampleQuality: profile.sampleQuality,
    topCalibratedOpportunityType: topCalibrated ? { opportunityType: topCalibrated.opportunityType as OpportunityType, usefulRate: topCalibrated.usefulRate, sampleSize: topCalibrated.sampleSize } : null,
    highestUnknownOpportunityType: highestUnknown ? { opportunityType: highestUnknown.opportunityType as OpportunityType, unknownRate: highestUnknown.unknownRate, sampleSize: highestUnknown.sampleSize } : null,
    scoreCalibration: profile.scoreCalibration,
    topRecommendations,
    lastRunAt,
    limitations: profile.limitations,
    generatedAt,
  }
}
