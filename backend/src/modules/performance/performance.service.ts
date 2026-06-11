/**
 * Performance Service — calculates pattern performance from real alerts/resolutions.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase E6: Repository-backed (Prisma or Firebase). No direct Prisma import.
 * On-demand aggregation in memory (no denormalized counters yet — see E6.1).
 *
 * Rules (unchanged):
 * - Unknown does NOT count as failed
 * - Rates only with resolvedCount >= 5
 * - No invented metrics
 * - Honest recommendations based on evidence
 */
import { createRepositories } from '../../repositories/index.js'
import {
  normalizeAlertForPerformance, normalizeResolutionForPerformance,
  type NormalizedPerformanceAlert,
} from './performanceInputAdapter.js'

const DEFAULT_USER = 'default'
const MIN_SAMPLE_FOR_RATE = 5

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PerformanceBucket {
  total: number
  confirmed: number
  confirmedPartial: number
  failed: number
  unknown: number
  pending: number
  usefulRate: number | null
  confirmedRate: number | null
}

export type ReliabilityLabel =
  | 'insufficient_sample'
  | 'preliminary'
  | 'promising'
  | 'reliable'
  | 'noisy'
  | 'data_limited'
  | 'underperforming'

export interface PatternPerformanceReport {
  patternId: string
  patternName: string
  sampleSize: number
  resolvedCount: number
  pendingCount: number
  confirmedCount: number
  confirmedPartialCount: number
  failedCount: number
  unknownCount: number
  expiredCount: number
  confirmedRate: number | null
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  averageConfidence: number | null
  reliability: ReliabilityLabel
  warnings: string[]
  recommendations: string[]
  breakdowns: {
    byResolutionType: Record<string, number>
    byDataQuality: Record<string, number>
    byMomentumSource: Record<string, number>
    byProvider: Record<string, number>
  }
  /** Where the numbers came from: incremental counter or on-demand scan. */
  source?: 'incremental' | 'on_demand'
}

export interface PerformanceSummary {
  totalAlerts: number
  resolvedCount: number
  pendingCount: number
  confirmedCount: number
  confirmedPartialCount: number
  failedCount: number
  unknownCount: number
  expiredCount: number
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  reliablePatterns: number
  promisingPatterns: number
  noisyPatterns: number
  insufficientSamplePatterns: number
  underperformingPatterns: number
  dataLimitedPatterns: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calculateRates(confirmed: number, partial: number, failed: number, unknown: number, total: number) {
  const resolved = confirmed + partial + failed
  return {
    resolvedCount: resolved,
    confirmedRate: resolved >= MIN_SAMPLE_FOR_RATE ? confirmed / resolved : null,
    usefulRate: resolved >= MIN_SAMPLE_FOR_RATE ? (confirmed + partial) / resolved : null,
    failedRate: resolved >= MIN_SAMPLE_FOR_RATE ? failed / resolved : null,
    unknownRate: total >= MIN_SAMPLE_FOR_RATE ? unknown / total : null,
  }
}

function calculateReliability(
  sampleSize: number,
  resolvedCount: number,
  usefulRate: number | null,
  failedRate: number | null,
  unknownRate: number | null,
): ReliabilityLabel {
  if (sampleSize < MIN_SAMPLE_FOR_RATE) return 'insufficient_sample'
  if (resolvedCount < MIN_SAMPLE_FOR_RATE) return 'preliminary'
  if (unknownRate !== null && unknownRate > 0.4) return 'data_limited'
  if (failedRate !== null && failedRate > 0.5) return 'underperforming'
  if (usefulRate !== null && usefulRate < 0.4 && failedRate !== null && failedRate > 0.35) return 'noisy'
  if (usefulRate !== null && usefulRate >= 0.55) return 'reliable'
  if (usefulRate !== null && usefulRate >= 0.4) return 'promising'
  if (sampleSize < 30) return 'preliminary'
  return 'promising'
}

function buildWarningsAndRecommendations(
  sampleSize: number,
  resolvedCount: number,
  usefulRate: number | null,
  failedRate: number | null,
  unknownRate: number | null,
  byMomentumSource: Record<string, number>,
): { warnings: string[]; recommendations: string[] } {
  const warnings: string[] = []
  const recommendations: string[] = []

  if (sampleSize < MIN_SAMPLE_FOR_RATE) {
    warnings.push('Amostra insuficiente para conclusão.')
  } else if (resolvedCount < MIN_SAMPLE_FOR_RATE) {
    warnings.push(`Apenas ${resolvedCount} de ${sampleSize} alertas foram resolvidos. Taxas requerem ${MIN_SAMPLE_FOR_RATE} resoluções.`)
  }
  if (unknownRate !== null && unknownRate > 0.4) {
    warnings.push(`${Math.round(unknownRate * 100)}% dos alertas ficaram sem resolução.`)
    recommendations.push('Provider não entrega dados suficientes. Use requireRichData ou restrinja ligas.')
  }
  if (failedRate !== null && failedRate > 0.45) {
    warnings.push(`Taxa de falha alta: ${Math.round(failedRate * 100)}%.`)
    recommendations.push('Aumente confiança mínima ou exija momentum confirmado.')
  }
  if (usefulRate !== null && usefulRate > 0.6 && sampleSize >= 30) {
    recommendations.push('Padrão confiável com amostra significativa.')
  } else if (usefulRate !== null && usefulRate > 0.6) {
    recommendations.push('Padrão promissor. Manter ativo e coletar mais amostra.')
  }
  if ((byMomentumSource['stats_proxy'] || 0) > 5 && (byMomentumSource['timed_events'] || 0) > 5) {
    recommendations.push('Considere exigir eventos minutados para melhor precisão.')
  }

  return { warnings, recommendations }
}

// ─── Report Assembly (shared by on-demand + counter paths) ───────────────────

interface AssemblyCounts {
  sampleSize: number
  pendingCount: number
  confirmedCount: number
  confirmedPartialCount: number
  failedCount: number
  unknownCount: number
  expiredCount: number
  averageConfidence: number | null
}

function assembleReport(
  patternId: string,
  patternName: string,
  counts: AssemblyCounts,
  breakdowns: PatternPerformanceReport['breakdowns'],
  source: 'incremental' | 'on_demand',
  extraWarnings: string[] = [],
): PatternPerformanceReport {
  const rates = calculateRates(counts.confirmedCount, counts.confirmedPartialCount, counts.failedCount, counts.unknownCount, counts.sampleSize)
  const reliability = calculateReliability(counts.sampleSize, rates.resolvedCount, rates.usefulRate, rates.failedRate, rates.unknownRate)
  const { warnings, recommendations } = buildWarningsAndRecommendations(
    counts.sampleSize, rates.resolvedCount, rates.usefulRate, rates.failedRate, rates.unknownRate, breakdowns.byMomentumSource,
  )
  for (const w of extraWarnings) warnings.push(w)

  return {
    patternId,
    patternName,
    sampleSize: counts.sampleSize,
    resolvedCount: rates.resolvedCount,
    pendingCount: counts.pendingCount,
    confirmedCount: counts.confirmedCount,
    confirmedPartialCount: counts.confirmedPartialCount,
    failedCount: counts.failedCount,
    unknownCount: counts.unknownCount,
    expiredCount: counts.expiredCount,
    confirmedRate: rates.confirmedRate,
    usefulRate: rates.usefulRate,
    failedRate: rates.failedRate,
    unknownRate: rates.unknownRate,
    averageConfidence: counts.averageConfidence,
    reliability,
    warnings,
    recommendations,
    breakdowns,
    source,
  }
}

// ─── Main Functions ──────────────────────────────────────────────────────────

/**
 * Per-pattern performance. Prefers the incremental counter (E6.2) when present;
 * falls back to the on-demand scan otherwise. The on-demand path remains the
 * reconciliation source of truth (see rebuildPatternPerformance).
 */
export async function buildPatternPerformance(patternId: string): Promise<PatternPerformanceReport | null> {
  const repos = createRepositories()
  const pattern = await repos.patterns.findById(patternId, DEFAULT_USER)
  if (!pattern) return null

  // Try incremental counter first.
  let counter: any = null
  try { counter = await repos.performance.getPatternCounter(patternId, DEFAULT_USER) } catch { counter = null }

  if (counter && (counter.totalAlerts || 0) > 0) {
    const terminal = (counter.confirmed || 0) + (counter.confirmedPartial || 0) + (counter.failed || 0) + (counter.unknown || 0) + (counter.expired || 0)
    const counts: AssemblyCounts = {
      sampleSize: counter.totalAlerts || 0,
      pendingCount: Math.max(0, (counter.totalAlerts || 0) - terminal),
      confirmedCount: counter.confirmed || 0,
      confirmedPartialCount: counter.confirmedPartial || 0,
      failedCount: counter.failed || 0,
      unknownCount: counter.unknown || 0,
      expiredCount: counter.expired || 0,
      averageConfidence: (counter.totalAlerts || 0) > 0 ? Math.round((counter.sumConfidence || 0) / counter.totalAlerts) : null,
    }
    const breakdowns = {
      byResolutionType: counter.byResolutionType || {},
      byDataQuality: counter.byDataQuality || {},
      byMomentumSource: counter.byMomentumSource || {},
      byProvider: counter.byProvider || {},
    }
    return assembleReport(patternId, pattern.name, counts, breakdowns, 'incremental')
  }

  // Fallback: on-demand scan.
  return buildPatternPerformanceOnDemand(patternId, pattern.name)
}

async function buildPatternPerformanceOnDemand(patternId: string, patternName: string): Promise<PatternPerformanceReport> {
  const repos = createRepositories()
  const rawAlerts = await repos.alerts.listByPatternId(patternId, DEFAULT_USER)
  const alerts: NormalizedPerformanceAlert[] = rawAlerts.map(normalizeAlertForPerformance)

  const sampleSize = alerts.length
  if (sampleSize === 0) {
    return {
      patternId, patternName,
      sampleSize: 0, resolvedCount: 0, pendingCount: 0,
      confirmedCount: 0, confirmedPartialCount: 0, failedCount: 0, unknownCount: 0, expiredCount: 0,
      confirmedRate: null, usefulRate: null, failedRate: null, unknownRate: null, averageConfidence: null,
      reliability: 'insufficient_sample',
      warnings: ['Nenhum alerta registrado para este padrão.'],
      recommendations: [],
      breakdowns: { byResolutionType: {}, byDataQuality: {}, byMomentumSource: {}, byProvider: {} },
      source: 'on_demand',
    }
  }

  const confirmedCount = alerts.filter(a => a.status === 'confirmed').length
  const confirmedPartialCount = alerts.filter(a => a.status === 'confirmed_partial').length
  const failedCount = alerts.filter(a => a.status === 'failed').length
  const unknownCount = alerts.filter(a => a.status === 'unknown').length
  const expiredCount = alerts.filter(a => a.status === 'expired').length
  const pendingCount = alerts.filter(a => a.status === 'pending').length
  const averageConfidence = Math.round(alerts.reduce((s, a) => s + a.confidence, 0) / sampleSize)

  const knownStatuses = new Set(['confirmed', 'confirmed_partial', 'failed', 'unknown', 'expired', 'pending'])
  const unrecognizedCount = alerts.filter(a => !knownStatuses.has(a.status)).length

  const byResolutionType: Record<string, number> = {}
  const byDataQuality: Record<string, number> = {}
  const byMomentumSource: Record<string, number> = {}
  const byProvider: Record<string, number> = {}

  for (const alert of alerts) {
    const evidence = alert.evidence
    const temporal = alert.temporal
    const momentum = temporal?.momentumSource || 'unknown'
    byMomentumSource[momentum] = (byMomentumSource[momentum] || 0) + 1
    const snapshot = evidence?.triggerSnapshot
    if (snapshot?.stats?.shotsOnTarget && snapshot?.stats?.possession) {
      byDataQuality['rich'] = (byDataQuality['rich'] || 0) + 1
    } else if (snapshot?.stats) {
      byDataQuality['partial'] = (byDataQuality['partial'] || 0) + 1
    } else {
      byDataQuality['poor'] = (byDataQuality['poor'] || 0) + 1
    }
    const provider = snapshot?.provider || evidence?.provider || 'unknown'
    byProvider[provider] = (byProvider[provider] || 0) + 1
  }

  const resolutions = await repos.alertResolutions.findByAlertIds(alerts.map(a => a.id))
  for (const raw of resolutions) {
    const r = normalizeResolutionForPerformance(raw)
    const type = r.resolutionType || r.resolutionStatus || 'unknown'
    byResolutionType[type] = (byResolutionType[type] || 0) + 1
  }

  const extraWarnings = unrecognizedCount > 0 ? [`${unrecognizedCount} alerta(s) com status não reconhecido.`] : []
  return assembleReport(
    patternId, patternName,
    { sampleSize, pendingCount, confirmedCount, confirmedPartialCount, failedCount, unknownCount, expiredCount, averageConfidence },
    { byResolutionType, byDataQuality, byMomentumSource, byProvider },
    'on_demand',
    extraWarnings,
  )
}

/** Force a counter rebuild from raw, then return the reconciled report (source incremental). */
export async function rebuildPatternPerformance(patternId: string): Promise<PatternPerformanceReport | null> {
  const repos = createRepositories()
  const pattern = await repos.patterns.findById(patternId, DEFAULT_USER)
  if (!pattern) return null
  await repos.performance.rebuildPatternCounters(patternId, DEFAULT_USER)
  return buildPatternPerformance(patternId)
}

export async function buildAllPatternPerformance(): Promise<PatternPerformanceReport[]> {
  const repos = createRepositories()
  // listAll returns every pattern (incl. archived), newest-updated first.
  const allPatterns = await repos.patterns.listAll(DEFAULT_USER)
  const patterns = allPatterns.filter((p: any) => p.status !== 'archived')

  const reports: PatternPerformanceReport[] = []
  for (const pattern of patterns) {
    const report = await buildPatternPerformance(pattern.id)
    if (report) reports.push(report)
  }

  return reports.sort((a, b) => b.sampleSize - a.sampleSize)
}

export async function buildPerformanceSummary(): Promise<PerformanceSummary> {
  const repos = createRepositories()
  const rawAlerts = await repos.alerts.listAllForUser(DEFAULT_USER)
  const alerts = rawAlerts.map(normalizeAlertForPerformance)

  const totalAlerts = alerts.length
  const confirmedCount = alerts.filter(a => a.status === 'confirmed').length
  const confirmedPartialCount = alerts.filter(a => a.status === 'confirmed_partial').length
  const failedCount = alerts.filter(a => a.status === 'failed').length
  const unknownCount = alerts.filter(a => a.status === 'unknown').length
  const expiredCount = alerts.filter(a => a.status === 'expired').length
  const pendingCount = alerts.filter(a => a.status === 'pending').length

  const rates = calculateRates(confirmedCount, confirmedPartialCount, failedCount, unknownCount, totalAlerts)

  // Get pattern-level reliability counts
  const reports = await buildAllPatternPerformance()
  const reliablePatterns = reports.filter(r => r.reliability === 'reliable').length
  const promisingPatterns = reports.filter(r => r.reliability === 'promising' || r.reliability === 'preliminary').length
  const noisyPatterns = reports.filter(r => r.reliability === 'noisy').length
  const insufficientSamplePatterns = reports.filter(r => r.reliability === 'insufficient_sample').length
  const underperformingPatterns = reports.filter(r => r.reliability === 'underperforming').length
  const dataLimitedPatterns = reports.filter(r => r.reliability === 'data_limited').length

  return {
    totalAlerts,
    resolvedCount: rates.resolvedCount,
    pendingCount,
    confirmedCount,
    confirmedPartialCount,
    failedCount,
    unknownCount,
    expiredCount,
    usefulRate: rates.usefulRate,
    failedRate: rates.failedRate,
    unknownRate: rates.unknownRate,
    reliablePatterns,
    promisingPatterns,
    noisyPatterns,
    insufficientSamplePatterns,
    underperformingPatterns,
    dataLimitedPatterns,
  }
}
