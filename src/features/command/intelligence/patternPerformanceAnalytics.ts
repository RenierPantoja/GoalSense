/**
 * patternPerformanceAnalytics — transforms alert history into actionable intelligence.
 * No mocks. No invented performance. Only real alerts and resolutions.
 */
import type { Pattern, TriggeredAlert } from '../types/commandTypes'
import type { CommandCenterAlert } from '@/context/AlertsContext'

// --- Types ----------------------------------------------------------------

export interface PerformanceBucket {
  total: number
  confirmed: number
  partial: number
  failed: number
  unknown: number
  pending: number
  usefulRate: number | null
  confirmedRate: number | null
}

export type ReliabilityLabel = 'insufficient_sample' | 'promising' | 'reliable' | 'noisy' | 'data_limited' | 'underperforming'

export interface PatternPerformanceReport {
  patternId: string
  patternName: string
  templateId?: string
  sampleSize: number
  resolvedCount: number
  confirmedCount: number
  partialCount: number
  failedCount: number
  unknownCount: number
  expiredCount: number
  pendingCount: number
  confirmedRate: number | null
  usefulRate: number | null
  failedRate: number | null
  unknownRate: number | null
  averageConfidence: number | null
  byMomentumSource: Record<string, PerformanceBucket>
  byDataQuality: Record<string, PerformanceBucket>
  byProvider: Record<string, PerformanceBucket>
  warnings: string[]
  recommendations: string[]
  reliability: ReliabilityLabel
}

// --- Constants ------------------------------------------------------------

const MIN_SAMPLE_FOR_RATE = 5

// --- Helpers --------------------------------------------------------------

function buildBucket(alerts: AlertLike[]): PerformanceBucket {
  const total = alerts.length
  const confirmed = alerts.filter(a => a.status === 'confirmed').length
  const partial = alerts.filter(a => a.status === 'confirmed_partial').length
  const failed = alerts.filter(a => a.status === 'failed').length
  const unknown = alerts.filter(a => a.status === 'unknown').length
  const pending = alerts.filter(a => a.status === 'pending').length
  const resolved = confirmed + partial + failed
  return {
    total, confirmed, partial, failed, unknown, pending,
    usefulRate: resolved >= MIN_SAMPLE_FOR_RATE ? (confirmed + partial) / resolved : null,
    confirmedRate: resolved >= MIN_SAMPLE_FOR_RATE ? confirmed / resolved : null,
  }
}

interface AlertLike {
  patternId: string
  status: string
  confidence: number
  temporalEvidence?: { momentumSource?: string }
  triggerSnapshot?: { provider?: string; stats?: any }
}

// --- Main -----------------------------------------------------------------

export function buildPatternPerformanceReport(
  pattern: Pattern,
  commandAlerts: CommandCenterAlert[],
  _triggeredAlerts?: TriggeredAlert[],
): PatternPerformanceReport {
  const alerts: AlertLike[] = commandAlerts
    .filter(a => a.patternId === pattern.id)
    .map(a => ({ patternId: a.patternId, status: a.status, confidence: a.confidence, temporalEvidence: a.temporalEvidence, triggerSnapshot: a.triggerSnapshot }))

  const sampleSize = alerts.length
  const confirmedCount = alerts.filter(a => a.status === 'confirmed').length
  const partialCount = alerts.filter(a => a.status === 'confirmed_partial').length
  const failedCount = alerts.filter(a => a.status === 'failed').length
  const unknownCount = alerts.filter(a => a.status === 'unknown').length
  const expiredCount = alerts.filter(a => a.status === 'expired').length
  const pendingCount = alerts.filter(a => a.status === 'pending').length
  const resolvedCount = confirmedCount + partialCount + failedCount

  // Rates (only with sufficient sample)
  const confirmedRate = resolvedCount >= MIN_SAMPLE_FOR_RATE ? confirmedCount / resolvedCount : null
  const usefulRate = resolvedCount >= MIN_SAMPLE_FOR_RATE ? (confirmedCount + partialCount) / resolvedCount : null
  const failedRate = resolvedCount >= MIN_SAMPLE_FOR_RATE ? failedCount / resolvedCount : null
  const unknownRate = sampleSize >= MIN_SAMPLE_FOR_RATE ? unknownCount / sampleSize : null

  // Average confidence
  const averageConfidence = sampleSize > 0 ? Math.round(alerts.reduce((s, a) => s + a.confidence, 0) / sampleSize) : null

  // Group by momentum source
  const byMomentumSource: Record<string, PerformanceBucket> = {}
  for (const src of ['timed_events', 'mixed', 'stats_proxy', 'insufficient']) {
    const group = alerts.filter(a => a.temporalEvidence?.momentumSource === src)
    if (group.length > 0) byMomentumSource[src] = buildBucket(group)
  }

  // Group by data quality (from triggerSnapshot stats presence)
  const byDataQuality: Record<string, PerformanceBucket> = {}
  const richAlerts = alerts.filter(a => a.triggerSnapshot?.stats?.shotsOnTarget && a.triggerSnapshot?.stats?.possession)
  const partialAlerts = alerts.filter(a => a.triggerSnapshot?.stats && !a.triggerSnapshot?.stats?.shotsOnTarget)
  const poorAlerts = alerts.filter(a => !a.triggerSnapshot?.stats)
  if (richAlerts.length > 0) byDataQuality['rich'] = buildBucket(richAlerts)
  if (partialAlerts.length > 0) byDataQuality['partial'] = buildBucket(partialAlerts)
  if (poorAlerts.length > 0) byDataQuality['poor'] = buildBucket(poorAlerts)

  // Group by provider
  const byProvider: Record<string, PerformanceBucket> = {}
  const providers = new Set(alerts.map(a => a.triggerSnapshot?.provider || 'unknown'))
  for (const p of providers) {
    const group = alerts.filter(a => (a.triggerSnapshot?.provider || 'unknown') === p)
    if (group.length > 0) byProvider[p] = buildBucket(group)
  }

  // Warnings and recommendations
  const warnings: string[] = []
  const recommendations: string[] = []

  if (sampleSize < MIN_SAMPLE_FOR_RATE) {
    warnings.push('Amostra insuficiente para avaliar performance')
  }
  if (unknownRate !== null && unknownRate > 0.4) {
    warnings.push(`${Math.round(unknownRate * 100)}% dos alertas ficaram sem resolução`)
    recommendations.push('Provider não entrega dados suficientes. Use requireRichData ou restrinja ligas.')
  }
  if (failedRate !== null && failedRate > 0.45) {
    warnings.push(`Taxa de falha alta: ${Math.round(failedRate * 100)}%`)
    recommendations.push('Aumente confiança mínima ou exija momentum confirmado.')
  }
  if (usefulRate !== null && usefulRate > 0.6) {
    recommendations.push('Padrão promissor. Manter ativo e coletar mais amostra.')
  }
  if (byMomentumSource['stats_proxy'] && byMomentumSource['timed_events']) {
    const proxyRate = byMomentumSource['stats_proxy'].usefulRate
    const timedRate = byMomentumSource['timed_events'].usefulRate
    if (proxyRate !== null && timedRate !== null && timedRate > proxyRate + 0.15) {
      recommendations.push('Padrão performa melhor com eventos minutados. Exija timed_events quando possível.')
    }
  }

  // Reliability label
  let reliability: ReliabilityLabel = 'insufficient_sample'
  if (sampleSize >= MIN_SAMPLE_FOR_RATE) {
    if (unknownRate !== null && unknownRate > 0.4) reliability = 'data_limited'
    else if (failedRate !== null && failedRate > 0.5) reliability = 'underperforming'
    else if (usefulRate !== null && usefulRate < 0.4 && failedRate !== null && failedRate > 0.35) reliability = 'noisy'
    else if (usefulRate !== null && usefulRate >= 0.55) reliability = 'reliable'
    else if (usefulRate !== null && usefulRate >= 0.4) reliability = 'promising'
  }

  return {
    patternId: pattern.id,
    patternName: pattern.name,
    templateId: pattern.templateId,
    sampleSize, resolvedCount, confirmedCount, partialCount, failedCount, unknownCount, expiredCount, pendingCount,
    confirmedRate, usefulRate, failedRate, unknownRate, averageConfidence,
    byMomentumSource, byDataQuality, byProvider,
    warnings, recommendations, reliability,
  }
}

/**
 * Build reports for all patterns.
 */
export function buildAllPerformanceReports(
  patterns: Pattern[],
  commandAlerts: CommandCenterAlert[],
  triggeredAlerts?: TriggeredAlert[],
): PatternPerformanceReport[] {
  return patterns
    .filter(p => p.status !== 'archived')
    .map(p => buildPatternPerformanceReport(p, commandAlerts, triggeredAlerts))
    .sort((a, b) => b.sampleSize - a.sampleSize)
}

/** Reliability badge tone for UI. */
export const RELIABILITY_TONE: Record<ReliabilityLabel, { text: string; bg: string; border: string }> = {
  insufficient_sample: { text: 'text-white/50', bg: 'bg-white/[0.03]', border: 'border-white/[0.06]' },
  promising: { text: 'text-cyan-300/80', bg: 'bg-cyan-500/[0.06]', border: 'border-cyan-400/15' },
  reliable: { text: 'text-emerald-300/85', bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-400/15' },
  noisy: { text: 'text-amber-300/80', bg: 'bg-amber-500/[0.05]', border: 'border-amber-400/15' },
  data_limited: { text: 'text-amber-300/70', bg: 'bg-amber-500/[0.04]', border: 'border-amber-400/12' },
  underperforming: { text: 'text-rose-300/80', bg: 'bg-rose-500/[0.05]', border: 'border-rose-400/15' },
}

export const RELIABILITY_LABEL: Record<ReliabilityLabel, string> = {
  insufficient_sample: 'Amostra insuficiente',
  promising: 'Promissor',
  reliable: 'Confiável',
  noisy: 'Ruidoso',
  data_limited: 'Limitado por dados',
  underperforming: 'Subperformando',
}
