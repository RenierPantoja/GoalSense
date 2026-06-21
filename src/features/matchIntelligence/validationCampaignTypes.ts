/**
 * Validation Campaign DTOs (B50) — frontend mirror. A campaign summary is NOT a promise.
 */
export interface ValidationCampaignDto {
  id: string
  title: string
  startedAt: string
  endedAt: string | null
  status: string
  targetDays: number
  actualDays: number
  dailyReportIds: string[]
  aggregateMetrics: {
    fixturesAnalyzed: number; fixturesWithData: number; governanceEvaluations: number
    causalEvaluable: number; causalNotEvaluable: number; providerLimitedFixtures: number
  }
  blockers: string[]
  warnings: string[]
  finalRecommendation: string
  limitations: string[]
}
