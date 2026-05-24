/**
 * Command Center signals — intelligent notifications based on real data.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { AlertRule } from '@/context/AlertsContext'

export interface CommandSignal {
  id: string
  type: string
  title: string
  description: string
  severity: 'info' | 'attention' | 'critical'
  relatedMatchId?: number
  actionLabel?: string
  actionTarget?: string
}

interface SignalInput {
  liveMatches: LiveFixture[]
  mainMatches: LiveFixture[]
  favoriteMatches: LiveFixture[]
  activeAlerts: AlertRule[]
  soonMatches: LiveFixture[]
  isFavoriteTeam: (name: string) => boolean
}

export function buildCommandSignals(input: SignalInput): CommandSignal[] {
  const { liveMatches, mainMatches, favoriteMatches, activeAlerts, soonMatches, isFavoriteTeam } = input
  const signals: CommandSignal[] = []

  // Favorite live
  const favLive = liveMatches.filter(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name))
  if (favLive.length > 0) {
    signals.push({
      id: 'favorite_live',
      type: 'favorite_live',
      title: 'Favorito ao vivo',
      description: `${favLive[0].homeTeam.name} x ${favLive[0].awayTeam.name} está acontecendo agora`,
      severity: 'critical',
      relatedMatchId: favLive[0].id,
      actionLabel: 'Abrir análise',
      actionTarget: `/app/matches/${favLive[0].id}`,
    })
  }

  // Favorite soon
  const favSoon = soonMatches.filter(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name))
  if (favSoon.length > 0) {
    signals.push({
      id: 'favorite_soon',
      type: 'favorite_soon',
      title: 'Favorito começa em breve',
      description: `${favSoon[0].homeTeam.name} x ${favSoon[0].awayTeam.name} inicia nos próximos minutos`,
      severity: 'attention',
      relatedMatchId: favSoon[0].id,
    })
  }

  // Alerts active
  if (activeAlerts.length > 0) {
    signals.push({
      id: 'alert_active',
      type: 'alert_active',
      title: 'Alertas monitorando',
      description: `${activeAlerts.length} ${activeAlerts.length === 1 ? 'regra ativa' : 'regras ativas'} de monitoramento`,
      severity: 'info',
      actionLabel: 'Gerenciar',
      actionTarget: '/app/alerts',
    })
  }

  // High priority live
  if (liveMatches.length > 0 && favLive.length === 0) {
    signals.push({
      id: 'high_priority_live',
      type: 'high_priority_live',
      title: 'Jogo relevante ao vivo',
      description: `${liveMatches[0].homeTeam.name} x ${liveMatches[0].awayTeam.name} em andamento`,
      severity: 'attention',
      relatedMatchId: liveMatches[0].id,
    })
  }

  // Many live
  if (liveMatches.length >= 4) {
    signals.push({
      id: 'many_live',
      type: 'many_live',
      title: 'Rodada movimentada',
      description: `${liveMatches.length} partidas acontecendo simultaneamente`,
      severity: 'info',
      actionLabel: 'Ver ao vivo',
      actionTarget: '/app/live',
    })
  }

  // Starting soon
  if (soonMatches.length > 0 && favSoon.length === 0) {
    signals.push({
      id: 'starting_soon',
      type: 'starting_soon',
      title: 'Partida relevante em breve',
      description: `${soonMatches[0].homeTeam.name} x ${soonMatches[0].awayTeam.name} começa nos próximos 60 minutos`,
      severity: 'info',
    })
  }

  // Brazil focus
  const brazilLive = liveMatches.filter(fx => fx.league.name.toLowerCase().includes('brasil') || fx.league.country === 'Brazil')
  if (brazilLive.length > 0) {
    signals.push({
      id: 'brazil_focus',
      type: 'brazil_focus',
      title: 'Destaque brasileiro',
      description: `${brazilLive.length} ${brazilLive.length === 1 ? 'jogo brasileiro' : 'jogos brasileiros'} ao vivo`,
      severity: 'info',
    })
  }

  return signals.slice(0, 6)
}
