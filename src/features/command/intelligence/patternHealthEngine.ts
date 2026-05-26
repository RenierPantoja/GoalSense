/**
 * Pattern Health Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Derives an honest, transparent health label for a configured radar from the
 * triggered alerts already stored in PatternContext (and optionally the
 * Command Center alerts that flow through AlertsContext).
 *
 * Hard rules:
 * - No fabricated rates. `hitRate` is null until we have at least
 *   MIN_RESOLVED_FOR_RATE resolutions (confirmed + failed only — partial,
 *   unknown and expired do not feed the rate).
 * - All thresholds are constants below so the heuristic stays auditable.
 * - "stale" requires real elapsed time evidence; if a radar has never fired
 *   we mark it as `no_data`, never `stale`.
 * - Recommendations are only added when a clear signal supports them.
 */
import type { Pattern, TriggeredAlert } from '../types/commandTypes'

export type PatternHealthStatus =
  | 'no_data'
  | 'warming_up'
  | 'healthy'
  | 'noisy'
  | 'underperforming'
  | 'stale'
  | 'needs_review'

export interface PatternHealth {
  status: PatternHealthStatus
  /** Short human label for badges. */
  label: string
  /** One-line plain-Portuguese reason — safe to render in any size. */
  reason: string
  sampleSize: number
  resolvedCount: number
  pendingCount: number
  confirmedCount: number
  failedCount: number
  partialCount: number
  unknownCount: number
  expiredCount: number
  /** Confirmed / (confirmed + failed). null if resolvedCount < MIN_RESOLVED_FOR_RATE. */
  hitRate: number | null
  /** Average confidence of every triggered alert. null if no alerts. */
  avgConfidence: number | null
  /** ISO timestamp of the most recent trigger (null if never). */
  lastTriggeredAt: string | null
  /** Hours since last trigger. null if never. */
  hoursSinceLastTrigger: number | null
  recommendations: string[]
}

// ─── Tunable thresholds ──────────────────────────────────────────────────────
const MIN_RESOLVED_FOR_RATE = 5
const HEALTHY_HIT_RATE = 0.55
const UNDERPERFORMING_HIT_RATE = 0.45
const NOISY_HIT_RATE = 0.4
const STALE_HOURS = 7 * 24 // 7 days
const UNKNOWN_DOMINATES_RATIO = 0.4 // 40% of resolved-ish are unknown
const NOISY_VOLUME_LAST_24H = 6 // > 6 triggers in 24h with low confirmation

interface AlertLike {
  patternId: string
  status: 'pending' | 'confirmed' | 'confirmed_partial' | 'failed' | 'expired' | 'unknown'
  confidence: number
  timestamp: string
}

function isWithinLastMs(iso: string, ms: number): boolean {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return false
  return Date.now() - t <= ms
}

/** Build a health snapshot for a single pattern. */
export function buildPatternHealth(
  pattern: Pattern,
  triggeredAlerts: TriggeredAlert[],
  commandAlerts?: AlertLike[],
): PatternHealth {
  const own = triggeredAlerts.filter(a => a.patternId === pattern.id)
  // CommandCenterAlert and TriggeredAlert share the union of statuses we care
  // about (pending/confirmed/confirmed_partial/failed/expired/unknown). We
  // include them so radars whose alerts only flow through AlertsContext are
  // still evaluated honestly.
  const ownCmd = (commandAlerts || []).filter(a => a.patternId === pattern.id)
  const all: AlertLike[] = [
    ...own.map(a => ({ patternId: a.patternId, status: a.status, confidence: a.confidence, timestamp: a.timestamp })),
    ...ownCmd,
  ]

  const sampleSize = all.length
  const pendingCount = all.filter(a => a.status === 'pending').length
  const confirmedCount = all.filter(a => a.status === 'confirmed').length
  const partialCount = all.filter(a => a.status === 'confirmed_partial').length
  const failedCount = all.filter(a => a.status === 'failed').length
  const unknownCount = all.filter(a => a.status === 'unknown').length
  const expiredCount = all.filter(a => a.status === 'expired').length
  const resolvedCount = confirmedCount + failedCount

  const hitRate = resolvedCount >= MIN_RESOLVED_FOR_RATE
    ? confirmedCount / resolvedCount
    : null
  const avgConfidence = sampleSize > 0
    ? Math.round(all.reduce((s, x) => s + (x.confidence || 0), 0) / sampleSize)
    : null

  const sortedByTimeDesc = [...all].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const lastTriggeredAt = sortedByTimeDesc[0]?.timestamp ?? null
  const hoursSinceLastTrigger = lastTriggeredAt
    ? Math.max(0, Math.round((Date.now() - new Date(lastTriggeredAt).getTime()) / 3_600_000))
    : null

  const recentTriggers24h = all.filter(a => isWithinLastMs(a.timestamp, 24 * 3_600_000)).length
  const noisySample = (resolvedCount + partialCount + unknownCount) || 0
  const unknownRatio = noisySample > 0 ? unknownCount / noisySample : 0

  // ── Status decision tree ──────────────────────────────────────────────────
  let status: PatternHealthStatus = 'no_data'
  let label = 'Sem dados'
  let reason = 'Este radar ainda não disparou.'
  const recommendations: string[] = []

  if (sampleSize === 0) {
    status = 'no_data'
    label = 'Sem dados'
    reason = 'Nenhum disparo registrado ainda.'
    if (pattern.status === 'active') {
      // Light hint, but no harsh judgment with zero data.
      if ((pattern.scope === 'specific_leagues' || pattern.scope === 'specific_teams' || pattern.scope === 'specific_matches') && (pattern.scopeFilter?.length || 0) === 0 && (pattern.matches?.length || 0) === 0) {
        recommendations.push('Escopo específico sem itens selecionados — o radar nunca pode bater.')
      }
    }
    return finalize({ status, label, reason, recommendations })
  }

  // Domain: many "unknown" alerts means the provider rarely confirms. Mark
  // for review before we trust hitRate, since unknown does not feed the rate.
  if (unknownCount >= 3 && unknownRatio >= UNKNOWN_DOMINATES_RATIO) {
    status = 'needs_review'
    label = 'Revisar'
    reason = `${unknownCount} alertas sem dados suficientes para confirmar.`
    recommendations.push('Ative "apenas dados ricos" no escopo para reduzir alertas indeterminados.')
    recommendations.push('Evite gatilhos cuja cobertura varia por provider (escanteios, cartões).')
    return finalize({ status, label, reason, recommendations })
  }

  // Stale: active but silent for a long time
  if (pattern.status === 'active' && lastTriggeredAt && hoursSinceLastTrigger !== null && hoursSinceLastTrigger >= STALE_HOURS) {
    status = 'stale'
    label = 'Sem atividade'
    reason = `Sem disparo há ${Math.round(hoursSinceLastTrigger / 24)} dias.`
    recommendations.push('Amplie o escopo ou reduza a confiança mínima para ver se o radar volta a bater.')
    if ((pattern.scope === 'specific_leagues' || pattern.scope === 'specific_teams' || pattern.scope === 'specific_matches')) {
      recommendations.push('Verifique se as ligas/times/partidas selecionadas seguem em atividade.')
    }
    return finalize({ status, label, reason, recommendations })
  }

  // Warming up: tem sinal, mas amostra ainda pequena para julgar
  if (resolvedCount < MIN_RESOLVED_FOR_RATE) {
    status = 'warming_up'
    label = 'Aquecendo'
    reason = `${sampleSize} ${sampleSize === 1 ? 'disparo' : 'disparos'} · amostra ainda pequena.`
    return finalize({ status, label, reason, recommendations })
  }

  // Now we have enough resolved alerts to talk about hit rate.
  const rate = hitRate as number

  // Noisy: many triggers in last 24h with weak confirmation
  if (recentTriggers24h > NOISY_VOLUME_LAST_24H && rate < NOISY_HIT_RATE) {
    status = 'noisy'
    label = 'Ruidoso'
    reason = `${recentTriggers24h} disparos em 24h e ${Math.round(rate * 100)}% de confirmação.`
    recommendations.push('Aumente a confiança mínima do radar.')
    recommendations.push('Adicione uma condição de minuto ou de placar curto para reduzir ruído.')
    if (avgConfidence !== null && avgConfidence < 60) {
      recommendations.push('A confiança média dos disparos é baixa — exija mais sinais ofensivos.')
    }
    return finalize({ status, label, reason, recommendations })
  }

  // Underperforming: maioria das resoluções falhou
  if (failedCount > confirmedCount && rate < UNDERPERFORMING_HIT_RATE) {
    status = 'underperforming'
    label = 'Baixo desempenho'
    reason = `${failedCount} falhas vs ${confirmedCount} confirmações (${Math.round(rate * 100)}%).`
    recommendations.push('Revise as condições do Trigger Lab.')
    recommendations.push('Reduza a sensibilidade aumentando a confiança mínima.')
    recommendations.push('Verifique se o escopo está amplo demais.')
    return finalize({ status, label, reason, recommendations })
  }

  // Healthy
  if (rate >= HEALTHY_HIT_RATE) {
    status = 'healthy'
    label = 'Saudável'
    reason = `${resolvedCount} resoluções · ${Math.round(rate * 100)}% confirmadas.`
    return finalize({ status, label, reason, recommendations })
  }

  // Default zone: working, but worth keeping an eye
  status = 'warming_up'
  label = 'Em observação'
  reason = `${resolvedCount} resoluções · ${Math.round(rate * 100)}% confirmadas.`
  return finalize({ status, label, reason, recommendations })

  // ─── helpers ──────────────────────────────────────────────────────────────
  function finalize(partial: { status: PatternHealthStatus; label: string; reason: string; recommendations: string[] }): PatternHealth {
    return {
      status: partial.status,
      label: partial.label,
      reason: partial.reason,
      recommendations: partial.recommendations,
      sampleSize,
      resolvedCount,
      pendingCount,
      confirmedCount,
      partialCount,
      failedCount,
      unknownCount,
      expiredCount,
      hitRate,
      avgConfidence,
      lastTriggeredAt,
      hoursSinceLastTrigger,
    }
  }
}

/** True for statuses the user is encouraged to look at. */
export function isReviewableHealth(status: PatternHealthStatus): boolean {
  return status === 'noisy' || status === 'underperforming' || status === 'needs_review' || status === 'stale'
}

/** Tone tokens for badges in the UI. Kept here so every consumer renders the
 * same color for each status. */
export const HEALTH_TONE: Record<PatternHealthStatus, { dot: string; text: string; bg: string; border: string }> = {
  no_data: { dot: 'bg-white/30', text: 'text-white/55', bg: 'bg-white/[0.04]', border: 'border-white/[0.07]' },
  warming_up: { dot: 'bg-cyan-300/75', text: 'text-cyan-200/80', bg: 'bg-cyan-500/[0.05]', border: 'border-cyan-400/15' },
  healthy: { dot: 'bg-emerald-400/85', text: 'text-emerald-200/85', bg: 'bg-emerald-500/[0.05]', border: 'border-emerald-400/15' },
  noisy: { dot: 'bg-amber-300/85', text: 'text-amber-200/85', bg: 'bg-amber-500/[0.05]', border: 'border-amber-400/15' },
  underperforming: { dot: 'bg-rose-300/85', text: 'text-rose-200/85', bg: 'bg-rose-500/[0.05]', border: 'border-rose-400/15' },
  stale: { dot: 'bg-white/35', text: 'text-white/55', bg: 'bg-white/[0.04]', border: 'border-white/[0.07]' },
  needs_review: { dot: 'bg-amber-300/85', text: 'text-amber-200/90', bg: 'bg-amber-500/[0.06]', border: 'border-amber-400/20' },
}
