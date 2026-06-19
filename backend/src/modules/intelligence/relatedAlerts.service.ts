/**
 * Related Alerts Service (Phase B17) — explainable relations between signals.
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds alerts related to an alert / pattern / learning event by SHARED, real
 * dimensions (pattern, league, team, minute window, failure reason, outcome,
 * data quality, competition type). Never invents a relation; every relation is
 * explained; small samples are flagged `weak`. Read-only.
 */
import { createRepositories } from '../../repositories/index.js'
import { loadJoinedAlerts, type JoinedAlert } from './alertIntelligence.service.js'

export type RelationStrength = 'weak' | 'moderate' | 'strong'

export interface RelatedAlertItem {
  alertId: string
  patternId: string
  radarName: string
  fixtureLabel: string
  league: string
  minute: number | null
  result: string
  confidence: number | null
  dataQuality: string
  createdAt: string
  relationReasons: string[]
  score: number
  strength: RelationStrength
}

function summaryReasons(anchor: JoinedAlert, r: JoinedAlert): { reasons: string[]; score: number } {
  const reasons: string[] = []
  let score = 0
  if (anchor.patternId === r.patternId) { reasons.push('mesmo radar'); score += 2 }
  if (anchor.league !== 'unknown' && anchor.league === r.league) { reasons.push('mesma liga'); score += 2 }
  if ((anchor.home !== 'unknown' && (anchor.home === r.home || anchor.home === r.away)) || (anchor.away !== 'unknown' && (anchor.away === r.home || anchor.away === r.away))) { reasons.push('time em comum'); score += 1 }
  if (anchor.window !== 'unknown' && anchor.window === r.window) { reasons.push('mesma janela de minuto'); score += 1 }
  if (anchor.failureReason && anchor.failureReason === r.failureReason) { reasons.push('mesmo motivo de falha'); score += 1 }
  if (anchor.result !== 'pending' && anchor.result === r.result) { reasons.push('mesmo resultado'); score += 1 }
  if (anchor.signalQuality === r.signalQuality) { reasons.push('mesma qualidade de dados'); score += 1 }
  if (anchor.competitionType && anchor.competitionType === r.competitionType) { reasons.push('mesmo tipo de competição'); score += 1 }
  return { reasons, score }
}

function strengthOf(score: number, totalRelated: number): RelationStrength {
  if (totalRelated < 3) return 'weak'
  if (score >= 5) return 'strong'
  if (score >= 3) return 'moderate'
  return 'weak'
}

function toItem(r: JoinedAlert, reasons: string[], score: number, strength: RelationStrength): RelatedAlertItem {
  return {
    alertId: r.alertId, patternId: r.patternId, radarName: r.radarName,
    fixtureLabel: `${r.home} vs ${r.away}`, league: r.league, minute: r.minute,
    result: r.result, confidence: r.confidence, dataQuality: r.signalQuality, createdAt: r.createdAt,
    relationReasons: reasons, score, strength,
  }
}

export async function relatedForAlert(alertId: string, limit = 20) {
  const rows = await loadJoinedAlerts()
  const anchor = rows.find(r => r.alertId === alertId)
  if (!anchor) return { anchorAlertId: alertId, found: false, appliedFilters: [], total: 0, relatedAlerts: [] as RelatedAlertItem[] }

  const scored = rows
    .filter(r => r.alertId !== alertId)
    .map(r => ({ r, ...summaryReasons(anchor, r) }))
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score || (b.r.createdAt || '').localeCompare(a.r.createdAt || ''))
  const total = scored.length
  const related = scored.slice(0, limit).map(x => toItem(x.r, x.reasons, x.score, strengthOf(x.score, total)))

  const appliedFilters: string[] = []
  appliedFilters.push(`radar:${anchor.radarName}`)
  if (anchor.league !== 'unknown') appliedFilters.push(`liga:${anchor.league}`)
  if (anchor.window !== 'unknown') appliedFilters.push(`janela:${anchor.windowLabel}`)
  if (anchor.failureReason) appliedFilters.push(`falha:${anchor.failureReason}`)

  return { anchorAlertId: alertId, found: true, appliedFilters, total, relatedAlerts: related }
}

export async function relatedForPattern(patternId: string, limit = 30) {
  const rows = await loadJoinedAlerts()
  const matched = rows.filter(r => r.patternId === patternId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const total = matched.length
  return {
    patternId, total, appliedFilters: [`radar:${patternId}`],
    relatedAlerts: matched.slice(0, limit).map(r => toItem(r, ['mesmo radar'], 2, strengthOf(2, total))),
  }
}

export async function relatedForLearningEvent(eventId: string, limit = 20) {
  const repos = createRepositories()
  const event = await repos.intelligence.getLearningEventById(eventId)
  if (!event) return { eventId, found: false, total: 0, relatedAlerts: [] as RelatedAlertItem[], appliedFilters: [] }
  if (event.alertId) {
    const byAlert = await relatedForAlert(event.alertId, limit)
    return { eventId, found: true, basis: 'alert', anchorAlertId: event.alertId, total: byAlert.total, appliedFilters: byAlert.appliedFilters, relatedAlerts: byAlert.relatedAlerts }
  }
  if (event.patternId) {
    const byPattern = await relatedForPattern(event.patternId, limit)
    return { eventId, found: true, basis: 'pattern', patternId: event.patternId, total: byPattern.total, appliedFilters: byPattern.appliedFilters, relatedAlerts: byPattern.relatedAlerts }
  }
  return { eventId, found: true, basis: 'none', total: 0, appliedFilters: [], relatedAlerts: [] }
}

export async function learningEventDetail(eventId: string) {
  const repos = createRepositories()
  const event = await repos.intelligence.getLearningEventById(eventId)
  if (!event) return { found: false, event: null, relatedPattern: null, relatedRecommendations: [], relatedAlertsSummary: null, relatedAlertsLinkParams: null }

  const patternId = event.patternId || null
  const [profile, allRecs] = await Promise.all([
    patternId ? repos.intelligence.getPatternLearningProfile(patternId).catch(() => null) : Promise.resolve(null),
    repos.intelligence.listLearningRecommendations(200).catch(() => []),
  ])
  const relatedRecommendations = patternId ? (allRecs as any[]).filter(r => r.patternId === patternId).slice(0, 10) : []

  let relatedAlertsSummary: { total: number; confirmed: number; failed: number; unknown: number } | null = null
  if (patternId) {
    const rows = await loadJoinedAlerts()
    const m = rows.filter(r => r.patternId === patternId)
    relatedAlertsSummary = {
      total: m.length,
      confirmed: m.filter(r => r.result === 'confirmed' || r.result === 'confirmed_partial').length,
      failed: m.filter(r => r.result === 'failed').length,
      unknown: m.filter(r => r.result === 'unknown' || r.result === 'expired').length,
    }
  }

  return {
    found: true,
    event,
    relatedPattern: profile,
    relatedRecommendations,
    relatedAlertsSummary,
    relatedAlertsLinkParams: patternId ? { patternId } : (event.alertId ? { alertId: event.alertId } : null),
  }
}
