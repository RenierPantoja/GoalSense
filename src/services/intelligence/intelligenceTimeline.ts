/**
 * Intelligence Timeline — builds a chronological view of GoalSense intelligence
 * for a specific match: pre-match → live alerts → resolution → knowledge base.
 * Only uses existing cached/stored data. No API calls.
 */
import { getCache } from '../cache/goalsenseCache'
import { cacheKeys } from '../cache/cacheKeys'
import type { CommandCenterAlert } from '@/context/AlertsContext'

export interface IntelligenceTimelineItem {
  id: string
  phase: 'prematch' | 'live' | 'postmatch'
  timestamp?: string
  minute?: number
  title: string
  description: string
  status: 'info' | 'pending' | 'confirmed' | 'partial' | 'failed' | 'unknown'
  evidence: string[]
  source: string
}

interface TimelineInput {
  homeName: string
  awayName: string
  fixtureId?: number
  commandAlerts: CommandCenterAlert[]
  finalScore?: { home: number; away: number }
}

export function buildIntelligenceTimeline(input: TimelineInput): IntelligenceTimelineItem[] {
  const { homeName, awayName, fixtureId, commandAlerts, finalScore } = input
  const items: IntelligenceTimelineItem[] = []

  // 1. Pre-match score from cache
  const preCache = getCache<any>(cacheKeys.prematchBasic(homeName, awayName))
  if (preCache?.value) {
    const pre = preCache.value
    const score = pre.goalsProfile ? `Média ${pre.goalsProfile.avgGoalsPerMatch} gols/jogo` : ''
    const confidence = pre.confidence || 'baixa'
    items.push({
      id: 'prematch-score',
      phase: 'prematch',
      title: 'Análise pré-jogo realizada',
      description: `Confiança ${confidence}${score ? ` · ${score}` : ''}`,
      status: 'info',
      evidence: pre.dataSources || [],
      source: 'Score GoalSense',
    })

    if (pre.homeForm || pre.awayForm) {
      const hForm = pre.homeForm?.formString?.replace(/W/g, 'V').replace(/L/g, 'D').replace(/D/g, 'E') || ''
      const aForm = pre.awayForm?.formString?.replace(/W/g, 'V').replace(/L/g, 'D').replace(/D/g, 'E') || ''
      items.push({
        id: 'prematch-form',
        phase: 'prematch',
        title: 'Forma recente analisada',
        description: `${homeName}: ${hForm} · ${awayName}: ${aForm}`,
        status: 'info',
        evidence: [],
        source: 'Pré-jogo',
      })
    }
  }

  // 2. Alerts triggered during live
  const matchAlerts = commandAlerts.filter(a => a.fixtureId === fixtureId || (a.homeTeam === homeName && a.awayTeam === awayName))

  for (const alert of matchAlerts) {
    items.push({
      id: `alert-${alert.id}`,
      phase: 'live',
      timestamp: alert.createdAt,
      minute: alert.minuteAtTrigger || undefined,
      title: `Alerta: ${alert.patternName}`,
      description: `Confiança ${alert.confidence}% · ${alert.scoreAtTrigger.home}-${alert.scoreAtTrigger.away}`,
      status: 'pending',
      evidence: alert.evidences.slice(0, 3),
      source: 'Command Center',
    })

    // Resolution
    if (alert.status !== 'pending') {
      const statusMap: Record<string, IntelligenceTimelineItem['status']> = { confirmed: 'confirmed', confirmed_partial: 'partial', failed: 'failed', expired: 'unknown', unknown: 'unknown' }
      items.push({
        id: `resolution-${alert.id}`,
        phase: 'postmatch',
        timestamp: alert.resolvedAt,
        title: `Resolução: ${alert.status === 'confirmed' ? 'Confirmado' : alert.status === 'confirmed_partial' ? 'Parcial' : alert.status === 'failed' ? 'Falhou' : 'Expirado'}`,
        description: alert.resolutionReason || '',
        status: statusMap[alert.status] || 'unknown',
        evidence: alert.scoreAtResolution ? [`Placar final: ${alert.scoreAtResolution.home}-${alert.scoreAtResolution.away}`] : [],
        source: 'Resolution Engine',
      })
    }
  }

  // 3. Knowledge Base record
  if (finalScore) {
    items.push({
      id: 'kb-record',
      phase: 'postmatch',
      title: 'Registrado na Base GoalSense',
      description: `Resultado ${finalScore.home}-${finalScore.away} · Perfis dos times atualizados`,
      status: 'info',
      evidence: [],
      source: 'Knowledge Base',
    })
  }

  return items
}
