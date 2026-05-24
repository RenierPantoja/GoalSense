/**
 * Pre-Match Pattern Connector — maps active patterns to pre-match readiness.
 * Does NOT trigger alerts. Only informs what will be monitored when match starts.
 */
import type { Pattern } from '@/features/command/types/commandTypes'
import type { PreMatchIntelligenceResult } from '../preMatchIntelligence'
import type { PreMatchScore } from './preMatchScoreEngine'

export interface PreMatchPatternReadiness {
  patternId: string
  patternName: string
  severity: 'critical' | 'attention' | 'info'
  readiness: 'ready' | 'needs_live_data' | 'needs_more_data' | 'not_applicable'
  confidencePreview: number
  reason: string
  watchPoint: string
  triggerWindow?: string
  requiredData: string[]
}

interface ConnectorInput {
  homeName: string
  awayName: string
  activePatterns: Pattern[]
  preMatchData?: PreMatchIntelligenceResult | null
  score?: PreMatchScore | null
  isFavoriteTeam: (name: string) => boolean
}

export function getPreMatchPatternReadiness(input: ConnectorInput): PreMatchPatternReadiness[] {
  const { homeName, awayName, activePatterns, preMatchData, score, isFavoriteTeam } = input
  const results: PreMatchPatternReadiness[] = []

  const isFav = isFavoriteTeam(homeName) || isFavoriteTeam(awayName)
  const goalsHigh = score ? score.goalsTrend.score >= 65 : false
  const disciplineHigh = score ? score.disciplineRisk.score >= 60 : false
  const balanced = score ? score.balance.score >= 65 : false
  const awayStrong = score ? score.awayStrength.score >= 65 : false

  for (const pattern of activePatterns) {
    // Scope check
    if (pattern.scope === 'favorites_only' && !isFav) continue
    if (pattern.scope === 'specific_leagues' && pattern.scopeFilter?.length) {
      const leagueName = preMatchData?.homeForm?.matches[0]?.competition || ''
      if (!pattern.scopeFilter.some(f => leagueName.toLowerCase().includes(f.toLowerCase()))) continue
    }
    if (pattern.scope === 'specific_teams' && pattern.scopeFilter?.length) {
      const hLow = homeName.toLowerCase(); const aLow = awayName.toLowerCase()
      if (!pattern.scopeFilter.some(f => { const fl = f.toLowerCase(); return hLow.includes(fl) || aLow.includes(fl) })) continue
    }

    const pn = pattern.name.toLowerCase()
    const condTypes = pattern.conditions.map(c => c.type)
    const needsLiveStats = condTypes.some(t => ['shots_on_target_gte', 'shots_recent_gte', 'possession_gte', 'corners_gte', 'cards_gte'].includes(t))
    const needsMinute = condTypes.some(t => ['minute_between', 'is_final_phase'].includes(t))

    let readiness: PreMatchPatternReadiness['readiness'] = 'needs_live_data'
    let reason = 'Requer estatísticas ao vivo'
    let watchPoint = 'Monitorar quando a partida começar'
    let triggerWindow: string | undefined
    let confidencePreview = 30
    const requiredData: string[] = []

    if (needsLiveStats) requiredData.push('Estatísticas ao vivo')
    if (needsMinute) requiredData.push('Minuto da partida')
    if (condTypes.includes('favorite_involved')) requiredData.push('Favoritos configurados')

    // Pattern-specific readiness
    if (pn.includes('pressão por gol') || pn.includes('gol tardio')) {
      readiness = 'needs_live_data'
      reason = 'Depende de pressão ofensiva ao vivo'
      watchPoint = 'Monitorar quando houver pressão ofensiva e placar curto'
      triggerWindow = '55\'–90\''
      if (goalsHigh) { confidencePreview = 55; reason = 'Perfil de gols favorável, mas precisa de confirmação ao vivo' }
    } else if (pn.includes('reta final')) {
      readiness = 'needs_live_data'
      reason = 'Ativa apenas na reta final'
      watchPoint = 'Se o jogo chegar equilibrado aos 70\', monitorar Reta final perigosa'
      triggerWindow = '70\'–90\''
      if (balanced) { confidencePreview = 50; reason = 'Confronto equilibrado favorece reta final decisiva' }
    } else if (pn.includes('favorito')) {
      if (isFav) { readiness = 'ready'; confidencePreview = 60; reason = 'Favorito envolvido nesta partida'; watchPoint = 'Observar se o favorito não confirmar domínio no primeiro tempo' }
      else { readiness = 'not_applicable'; reason = 'Nenhum favorito envolvido'; watchPoint = '' }
    } else if (pn.includes('domínio')) {
      readiness = 'needs_live_data'
      reason = 'Depende de posse e finalizações ao vivo'
      watchPoint = 'Se um time dominar sem vantagem no placar, este padrão ganha força'
    } else if (pn.includes('escanteio')) {
      readiness = 'needs_live_data'
      reason = 'Depende de sequência de escanteios ao vivo'
      watchPoint = 'Monitorar pressão lateral e escanteios acumulados'
    } else if (pn.includes('jogo aberto') || pn.includes('open')) {
      if (goalsHigh) { readiness = 'ready'; confidencePreview = 55; reason = 'Perfil de gols sugere jogo aberto'; watchPoint = 'Observar se os dois times finalizam cedo' }
      else { readiness = 'needs_live_data'; watchPoint = 'Depende do volume ofensivo inicial' }
    } else if (pn.includes('segundo tempo')) {
      readiness = 'needs_live_data'
      reason = 'Ativa no segundo tempo'
      watchPoint = 'Se o primeiro tempo for morno, observar reação após o intervalo'
      triggerWindow = '50\'–75\''
      if (goalsHigh) { confidencePreview = 45; reason = 'Perfil de gols pode favorecer segundo tempo quente' }
    } else if (pn.includes('zebra')) {
      if (balanced) { readiness = 'ready'; confidencePreview = 45; reason = 'Confronto equilibrado pode gerar surpresa'; watchPoint = 'Se o favorito não dominar cedo, monitorar risco de zebra' }
      else { readiness = 'needs_live_data'; watchPoint = 'Depende do andamento do jogo' }
    } else if (pn.includes('cartão') || pn.includes('cartões')) {
      if (disciplineHigh) { readiness = 'ready'; confidencePreview = 55; reason = 'Tendência alta de cartões nos jogos recentes'; watchPoint = 'Cartão cedo aumenta relevância deste padrão' }
      else { readiness = 'needs_live_data'; reason = 'Depende de eventos de cartões ao vivo'; watchPoint = 'Monitorar faltas e cartões' }
    } else if (pn.includes('visitante')) {
      if (awayStrong) { readiness = 'ready'; confidencePreview = 50; reason = 'Visitante chega em boa forma'; watchPoint = 'Atenção às finalizações do visitante nos primeiros 30 minutos' }
      else { readiness = 'needs_live_data'; watchPoint = 'Depende do desempenho ofensivo do visitante' }
    } else if (pn.includes('over')) {
      if (goalsHigh) { readiness = 'ready'; confidencePreview = 60; reason = 'Perfil de gols compatível com over'; watchPoint = 'Monitorar volume ofensivo desde o início' }
      else { readiness = 'needs_more_data'; reason = 'Perfil de gols não é forte o suficiente'; watchPoint = 'Depende de gols reais' }
    } else if (pn.includes('travado') || pn.includes('ruptura')) {
      if (balanced && !goalsHigh) { readiness = 'ready'; confidencePreview = 45; reason = 'Confronto equilibrado com tendência baixa de gols'; watchPoint = 'Se o jogo seguir travado após 55\', monitorar ruptura' }
      else { readiness = 'needs_live_data'; watchPoint = 'Depende do andamento' }
      triggerWindow = '55\'–85\''
    } else if (pn.includes('pressionando')) {
      readiness = 'needs_live_data'
      reason = 'Depende de pressão sem conversão ao vivo'
      watchPoint = 'Monitorar se um time pressiona sem marcar'
    }

    if (readiness === 'not_applicable' && !watchPoint) continue

    results.push({ patternId: pattern.id, patternName: pattern.name, severity: pattern.severity, readiness, confidencePreview, reason, watchPoint, triggerWindow, requiredData })
  }

  return results.sort((a, b) => {
    const order = { ready: 0, needs_live_data: 1, needs_more_data: 2, not_applicable: 3 }
    return order[a.readiness] - order[b.readiness] || b.confidencePreview - a.confidencePreview
  })
}
