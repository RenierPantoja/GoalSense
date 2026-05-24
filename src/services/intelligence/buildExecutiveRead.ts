interface ReadInput {
  homeName: string
  awayName: string
  homeScore: number
  awayScore: number
  elapsed: number | null
  isLive: boolean
  possession?: { home: number; away: number }
  shots?: { home: number; away: number }
  shotsOnTarget?: { home: number; away: number }
  corners?: { home: number; away: number }
  hasStats: boolean
  hasEvents: boolean
  hasLineups: boolean
  hasNarration: boolean
}

export interface ExecutiveReadResult {
  title: string
  summary: string
  bullets: string[]
  confidence: string
}

export function buildExecutiveRead(input: ReadInput): ExecutiveReadResult {
  const { homeName, awayName, homeScore, awayScore, elapsed, isLive, possession, shots, shotsOnTarget, corners, hasStats, hasEvents, hasLineups, hasNarration } = input
  const totalGoals = homeScore + awayScore
  const bullets: string[] = []

  // Title — contextual and specific
  let title = ''
  if (!isLive && !hasStats && !hasEvents && totalGoals === 0) {
    title = 'Aguardando dados da partida'
  } else if (!isLive && totalGoals === 0) {
    title = 'Partida encerrada sem gols'
  } else if (!isLive) {
    const winner = homeScore > awayScore ? homeName : awayScore > homeScore ? awayName : ''
    title = winner ? `${winner} vence por ${Math.max(homeScore, awayScore)} a ${Math.min(homeScore, awayScore)}` : `Empate em ${homeScore} a ${awayScore}`
  } else if (elapsed && elapsed >= 80) {
    title = totalGoals >= 4 ? 'Jogo de muitos gols na reta final' : homeScore === awayScore ? 'Empate na fase decisiva' : 'Reta final com vantagem mínima'
  } else if (elapsed && elapsed > 45) {
    title = totalGoals >= 3 ? 'Segundo tempo aberto com muitos gols' : 'Segundo tempo em progresso'
  } else if (elapsed && elapsed > 15) {
    title = totalGoals > 0 ? 'Primeiro tempo com gol' : 'Primeiro tempo em andamento'
  } else {
    title = 'Fase inicial da partida'
  }

  // Summary — analytical, not generic
  const parts: string[] = []

  if (isLive && elapsed) {
    if (homeScore === awayScore) {
      if (totalGoals === 0) {
        parts.push(`Empate sem gols aos ${elapsed}'.`)
      } else {
        parts.push(`Empate em ${homeScore}x${awayScore} aos ${elapsed}'.`)
      }
    } else {
      const leader = homeScore > awayScore ? homeName : awayName
      const trailer = homeScore > awayScore ? awayName : homeName
      const diff = Math.abs(homeScore - awayScore)
      if (diff >= 3) {
        parts.push(`${leader} domina com ${Math.max(homeScore, awayScore)}x${Math.min(homeScore, awayScore)} aos ${elapsed}'.`)
      } else {
        parts.push(`${leader} na frente por ${Math.max(homeScore, awayScore)}x${Math.min(homeScore, awayScore)} aos ${elapsed}'.`)
      }
    }
  } else if (!isLive && totalGoals > 0) {
    const winner = homeScore > awayScore ? homeName : awayScore > homeScore ? awayName : null
    if (winner) {
      parts.push(`Vitória do ${winner} por ${homeScore > awayScore ? homeScore : awayScore} a ${homeScore > awayScore ? awayScore : homeScore}.`)
    } else {
      parts.push(`Empate em ${homeScore} a ${awayScore}.`)
    }
  }

  // Stats-based analysis
  if (hasStats && possession && shots) {
    const possLeader = possession.home > possession.away ? homeName : awayName
    const possVal = Math.max(possession.home, possession.away)
    const shotsLeader = shots.home > shots.away ? homeName : awayName
    const totalShots = shots.home + shots.away

    if (possLeader === shotsLeader && possVal > 55) {
      parts.push(`${possLeader} controla o jogo com ${possVal.toFixed(0)}% de posse e ${Math.max(shots.home, shots.away)} finalizações.`)
    } else if (possLeader !== shotsLeader) {
      parts.push(`${possLeader} tem mais posse (${possVal.toFixed(0)}%), mas ${shotsLeader} finaliza mais (${Math.max(shots.home, shots.away)}).`)
    } else if (totalShots >= 20) {
      parts.push(`Jogo aberto com ${totalShots} finalizações e alto volume ofensivo.`)
    }

    // Efficiency insight
    if (shotsOnTarget && totalGoals > 0) {
      const totalOnTarget = shotsOnTarget.home + shotsOnTarget.away
      if (totalOnTarget > 0 && totalGoals >= 3) {
        const efficiency = ((totalGoals / totalOnTarget) * 100).toFixed(0)
        parts.push(`Eficiência ofensiva alta: ${totalGoals} gols em ${totalOnTarget} finalizações ao alvo (${efficiency}%).`)
      }
    }

    bullets.push(`Posse: ${possession.home.toFixed(0)}% — ${possession.away.toFixed(0)}%`)
    bullets.push(`Finalizações: ${shots.home} — ${shots.away}`)
    if (shotsOnTarget) bullets.push(`No alvo: ${shotsOnTarget.home} — ${shotsOnTarget.away}`)
    if (corners && (corners.home + corners.away) > 0) bullets.push(`Escanteios: ${corners.home} — ${corners.away}`)
  } else if (!hasStats && !hasEvents) {
    parts.push('Placar disponível, mas estatísticas detalhadas ainda não chegaram para esta partida.')
  } else if (!hasStats && hasEvents) {
    parts.push('Eventos registrados, mas estatísticas numéricas indisponíveis.')
  }

  // Confidence
  let confScore = 0
  if (hasStats) confScore += 25
  if (hasEvents) confScore += 20
  if (hasLineups) confScore += 10
  if (hasNarration) confScore += 15
  if (totalGoals > 0) confScore += 10
  if (elapsed) confScore += 10
  if (possession && possession.home > 0) confScore += 5
  if (shots && shots.home > 0) confScore += 5

  let confidence = 'Baixa'
  if (confScore >= 80) confidence = 'Alta'
  else if (confScore >= 60) confidence = 'Boa'
  else if (confScore >= 40) confidence = 'Moderada'

  return { title, summary: parts.join(' '), bullets, confidence }
}
