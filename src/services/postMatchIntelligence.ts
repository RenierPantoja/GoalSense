/**
 * Post-Match Intelligence — generates analysis for finished matches.
 * Uses only real data from stats, events, and lineups.
 */

import { normalizeEvents, type NormalizedEvent } from '@/features/matches/normalizeMatchEvents'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PostMatchSummary {
  title: string
  description: string
  resultType: 'home_win' | 'away_win' | 'draw' | 'goalless_draw' | 'unknown'
}

export interface PostMatchMoment {
  minute?: number
  type: 'goal' | 'red_card' | 'penalty' | 'substitution' | 'turning_point'
  title: string
  description: string
  teamName?: string
  playerName?: string
}

export interface PerformanceComparison {
  possessionLeader?: string
  shotsLeader?: string
  shotsOnTargetLeader?: string
  cornersLeader?: string
  efficiencyLeader?: string
  summary: string
}

export interface DecisivePlayer {
  name: string
  teamName?: string
  reason: string
  score: number
  events: string[]
}

export interface PostMatchIntelligenceResult {
  available: boolean
  confidence: 'high' | 'medium' | 'low'
  resultSummary: PostMatchSummary
  keyMoments: PostMatchMoment[]
  performanceComparison: PerformanceComparison
  decisivePlayers: DecisivePlayer[]
  tacticalReading: string | null
  dataLimitations: string[]
}

// ─── Input ───────────────────────────────────────────────────────────────────

interface PostMatchInput {
  homeName: string
  awayName: string
  homeScore: number
  awayScore: number
  stats: { label: string; home: string; away: string }[]
  events: { clock: string; text: string; type: string; team: string }[]
  hasLineups: boolean
  hasNarration: boolean
}

// ─── Main function ───────────────────────────────────────────────────────────

export function buildPostMatchIntelligence(input: PostMatchInput): PostMatchIntelligenceResult {
  const { homeName, awayName, homeScore, awayScore, stats, events, hasLineups, hasNarration } = input
  const totalGoals = homeScore + awayScore
  const normalized = events.length > 0 ? normalizeEvents(events) : []
  const dataLimitations: string[] = []

  // Confidence
  let confScore = 0
  if (stats.length > 0) confScore += 30
  if (events.length > 0) confScore += 30
  if (hasLineups) confScore += 15
  if (hasNarration) confScore += 15
  if (totalGoals > 0) confScore += 10
  const confidence = confScore >= 70 ? 'high' : confScore >= 40 ? 'medium' : 'low'

  if (stats.length === 0) dataLimitations.push('Estatísticas detalhadas indisponíveis')
  if (events.length === 0) dataLimitations.push('Eventos da partida indisponíveis')

  // Result summary
  const resultSummary = buildResultSummary(homeName, awayName, homeScore, awayScore)

  // Key moments
  const keyMoments = buildKeyMoments(normalized, homeName, awayName)

  // Performance comparison
  const performanceComparison = buildPerformanceComparison(stats, homeName, awayName, homeScore, awayScore)

  // Decisive players
  const decisivePlayers = buildDecisivePlayers(normalized, homeScore, awayScore, homeName, awayName)

  // Tactical reading
  const tacticalReading = buildTacticalReading(stats, homeName, awayName, homeScore, awayScore)

  return { available: true, confidence, resultSummary, keyMoments, performanceComparison, decisivePlayers, tacticalReading, dataLimitations }
}

// ─── Result Summary ──────────────────────────────────────────────────────────

function buildResultSummary(home: string, away: string, hScore: number, aScore: number): PostMatchSummary {
  if (hScore > aScore) {
    return { title: `${home} vence ${away} por ${hScore} a ${aScore}`, description: `Vitória do mandante com ${hScore - aScore} ${hScore - aScore === 1 ? 'gol' : 'gols'} de diferença.`, resultType: 'home_win' }
  }
  if (aScore > hScore) {
    return { title: `${away} vence ${home} fora de casa por ${aScore} a ${hScore}`, description: `Vitória do visitante com ${aScore - hScore} ${aScore - hScore === 1 ? 'gol' : 'gols'} de diferença.`, resultType: 'away_win' }
  }
  if (hScore === 0) {
    return { title: 'Partida encerrada sem gols', description: `${home} e ${away} não conseguiram balançar as redes.`, resultType: 'goalless_draw' }
  }
  return { title: `${home} e ${away} empatam em ${hScore} a ${aScore}`, description: 'Empate com gols.', resultType: 'draw' }
}

// ─── Key Moments ─────────────────────────────────────────────────────────────

function buildKeyMoments(events: NormalizedEvent[], homeName: string, awayName: string): PostMatchMoment[] {
  const moments: PostMatchMoment[] = []

  const goals = events.filter(e => e.type === 'goal')
  const redCards = events.filter(e => e.type === 'red_card')

  // Goals
  for (const g of goals.slice(0, 3)) {
    moments.push({
      minute: g.minute,
      type: 'goal',
      title: g.playerName ? `Gol de ${g.playerName}` : `Gol aos ${g.minute}'`,
      description: g.assistName ? `Assistência de ${g.assistName}.` : '',
      teamName: g.teamName,
      playerName: g.playerName,
    })
  }

  // Red cards
  for (const r of redCards.slice(0, 1)) {
    moments.push({
      minute: r.minute,
      type: 'red_card',
      title: r.playerName ? `Vermelho para ${r.playerName}` : `Cartão vermelho aos ${r.minute}'`,
      description: 'Alterou o equilíbrio da partida.',
      teamName: r.teamName,
      playerName: r.playerName,
    })
  }

  // Late goal (after 80')
  const lateGoals = goals.filter(g => g.minute >= 80)
  if (lateGoals.length > 0 && !moments.some(m => m.minute === lateGoals[0].minute && m.type === 'goal')) {
    moments.push({
      minute: lateGoals[0].minute,
      type: 'turning_point',
      title: `Gol nos minutos finais (${lateGoals[0].minute}')`,
      description: 'Decisão na reta final da partida.',
      playerName: lateGoals[0].playerName,
    })
  }

  return moments.slice(0, 5)
}

// ─── Performance Comparison ──────────────────────────────────────────────────

function buildPerformanceComparison(stats: { label: string; home: string; away: string }[], homeName: string, awayName: string, hScore: number, aScore: number): PerformanceComparison {
  if (stats.length === 0) {
    return { summary: 'Estatísticas detalhadas indisponíveis para comparação de desempenho.' }
  }

  const getStat = (name: string) => {
    const s = stats.find(x => x.label.toLowerCase().includes(name.toLowerCase()))
    return s ? { home: parseFloat(s.home) || 0, away: parseFloat(s.away) || 0 } : null
  }

  const possession = getStat('possession') || getStat('POSSESSION')
  const shots = getStat('shots') || getStat('SHOTS') || getStat('totalShots')
  const onTarget = getStat('on goal') || getStat('ON GOAL') || getStat('shotsOnTarget')
  const corners = getStat('corner') || getStat('Corner')

  const possLeader = possession && possession.home > possession.away ? homeName : possession && possession.away > possession.home ? awayName : undefined
  const shotsLeader = shots && shots.home > shots.away ? homeName : shots && shots.away > shots.home ? awayName : undefined
  const onTargetLeader = onTarget && onTarget.home > onTarget.away ? homeName : onTarget && onTarget.away > onTarget.home ? awayName : undefined
  const cornersLeader = corners && corners.home > corners.away ? homeName : corners && corners.away > corners.home ? awayName : undefined

  // Efficiency
  let efficiencyLeader: string | undefined
  if (onTarget && (hScore + aScore) > 0) {
    const hEff = onTarget.home > 0 ? hScore / onTarget.home : 0
    const aEff = onTarget.away > 0 ? aScore / onTarget.away : 0
    if (hEff > aEff && hScore > 0) efficiencyLeader = homeName
    else if (aEff > hEff && aScore > 0) efficiencyLeader = awayName
  }

  // Summary
  const parts: string[] = []
  if (possLeader && shotsLeader && possLeader === shotsLeader) {
    parts.push(`${possLeader} dominou posse e volume ofensivo.`)
  } else if (possLeader && shotsLeader && possLeader !== shotsLeader) {
    parts.push(`${possLeader} teve mais posse, mas ${shotsLeader} finalizou mais.`)
  }
  if (efficiencyLeader && efficiencyLeader !== shotsLeader) {
    parts.push(`${efficiencyLeader} foi mais eficiente nas finalizações.`)
  }
  if (parts.length === 0 && shots) {
    const total = shots.home + shots.away
    parts.push(total >= 20 ? 'Jogo aberto com alto volume ofensivo.' : 'Partida com poucas chances claras.')
  }

  return { possessionLeader: possLeader, shotsLeader, shotsOnTargetLeader: onTargetLeader, cornersLeader, efficiencyLeader, summary: parts.join(' ') || 'Dados insuficientes para comparação.' }
}

// ─── Decisive Players ────────────────────────────────────────────────────────

function buildDecisivePlayers(events: NormalizedEvent[], hScore: number, aScore: number, homeName: string, awayName: string): DecisivePlayer[] {
  const playerMap = new Map<string, { name: string; team: string; score: number; events: string[] }>()

  for (const ev of events) {
    if (!ev.playerName || ev.playerName.length < 2) continue

    const key = ev.playerName.toLowerCase()
    if (!playerMap.has(key)) playerMap.set(key, { name: ev.playerName, team: ev.teamName, score: 0, events: [] })
    const p = playerMap.get(key)!

    switch (ev.type) {
      case 'goal':
        p.score += 40
        p.events.push(`Gol ${ev.minute}'`)
        if (ev.minute >= 80) p.score += 15 // late goal bonus
        break
      case 'red_card':
        p.score += 20
        p.events.push(`Vermelho ${ev.minute}'`)
        break
      case 'yellow_card':
        p.score += 5
        p.events.push(`Amarelo ${ev.minute}'`)
        break
      case 'substitution':
        if (ev.playerIn === ev.playerName) p.score += 3
        break
    }

    // Assist
    if (ev.assistName && ev.assistName.length > 2) {
      const aKey = ev.assistName.toLowerCase()
      if (!playerMap.has(aKey)) playerMap.set(aKey, { name: ev.assistName, team: ev.teamName, score: 0, events: [] })
      const a = playerMap.get(aKey)!
      a.score += 25
      a.events.push(`Assistência ${ev.minute}'`)
    }
  }

  const sorted = Array.from(playerMap.values()).filter(p => p.score >= 20).sort((a, b) => b.score - a.score).slice(0, 5)

  return sorted.map(p => {
    const goals = p.events.filter(e => e.startsWith('Gol')).length
    const assists = p.events.filter(e => e.startsWith('Assist')).length
    let reason = ''
    if (goals >= 2) reason = `Participou diretamente de ${goals} gols.`
    else if (goals === 1 && assists >= 1) reason = 'Gol e assistência na partida.'
    else if (goals === 1) reason = 'Marcou nesta partida.'
    else if (assists >= 1) reason = 'Criou chance de gol.'
    else if (p.events.some(e => e.includes('Vermelho'))) reason = 'Expulso em momento decisivo.'
    else reason = 'Participação relevante.'

    return { name: p.name, teamName: p.team, reason, score: p.score, events: p.events }
  })
}

// ─── Tactical Reading ────────────────────────────────────────────────────────

function buildTacticalReading(stats: { label: string; home: string; away: string }[], homeName: string, awayName: string, hScore: number, aScore: number): string | null {
  if (stats.length < 3) return null

  const getStat = (name: string) => {
    const s = stats.find(x => x.label.toLowerCase().includes(name.toLowerCase()))
    return s ? { home: parseFloat(s.home) || 0, away: parseFloat(s.away) || 0 } : null
  }

  const possession = getStat('possession')
  const shots = getStat('shots') || getStat('totalShots')

  if (!possession || !shots) return null

  const winner = hScore > aScore ? homeName : aScore > hScore ? awayName : null
  const possLeader = possession.home > possession.away ? homeName : awayName

  if (winner && winner !== possLeader) {
    return `${winner} venceu mesmo com menos posse de bola, mostrando eficiência nos contra-ataques.`
  }
  if (winner && winner === possLeader) {
    return `${winner} controlou o jogo com posse e converteu em resultado.`
  }
  if (!winner && (shots.home + shots.away) >= 20) {
    return 'Jogo equilibrado com alto volume ofensivo de ambos os lados.'
  }

  return null
}
