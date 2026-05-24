export interface MetricResult {
  available: boolean
  value: number
  label: string
  explanation: string
  inputs: string[]
}

export interface IntelligenceResult {
  attention: MetricResult
  pressure: MetricResult
  tempo: MetricResult
  confidence: MetricResult
}

interface StatInput {
  possession?: { home: number; away: number }
  shots?: { home: number; away: number }
  shotsOnTarget?: { home: number; away: number }
  corners?: { home: number; away: number }
  fouls?: { home: number; away: number }
}

function getLabel(value: number): string {
  if (value >= 75) return 'Muito alto'
  if (value >= 50) return 'Alto'
  if (value >= 30) return 'Moderado'
  return 'Baixo'
}

export function calculateMatchIntelligence(
  stats: StatInput | null,
  elapsed: number | null,
  scoreHome: number,
  scoreAway: number,
  hasEvents: boolean,
  hasNarration: boolean,
  hasLineups: boolean,
): IntelligenceResult {
  const totalGoals = scoreHome + scoreAway
  const min = elapsed || 0

  // --- Attention ---
  let attValue = 0
  const attInputs: string[] = []
  if (min > 0) { attValue += Math.min(30, min * 0.4); attInputs.push(`Minuto ${min}`) }
  if (min >= 75) { attValue += 20; attInputs.push('Fase final') }
  if (totalGoals >= 3) { attValue += 15; attInputs.push(`${totalGoals} gols`) }
  if (Math.abs(scoreHome - scoreAway) <= 1 && totalGoals > 0) { attValue += 12; attInputs.push('Placar apertado') }
  if (min >= 70 && scoreHome === scoreAway && totalGoals > 0) { attValue += 10; attInputs.push('Empate tardio') }
  if (stats?.shots) { const t = stats.shots.home + stats.shots.away; if (t >= 15) { attValue += 10; attInputs.push(`${t} finalizações`) } }
  attValue = Math.min(100, Math.round(attValue))

  const attention: MetricResult = {
    available: min > 0,
    value: attValue,
    label: getLabel(attValue),
    explanation: attValue >= 60 ? 'Jogo com alto potencial de desfecho importante.' : attValue >= 35 ? 'Partida com dinamismo moderado.' : 'Jogo em fase inicial ou com pouca ação.',
    inputs: attInputs,
  }

  // --- Pressure ---
  let presValue = 0
  const presInputs: string[] = []
  if (stats?.shots) { const t = stats.shots.home + stats.shots.away; presValue += Math.min(30, t * 2); presInputs.push(`${t} finalizações`) }
  if (stats?.shotsOnTarget) { const t = stats.shotsOnTarget.home + stats.shotsOnTarget.away; presValue += Math.min(25, t * 5); presInputs.push(`${t} no alvo`) }
  if (stats?.corners) { const t = stats.corners.home + stats.corners.away; presValue += Math.min(20, t * 3); presInputs.push(`${t} escanteios`) }
  if (stats?.possession) { const diff = Math.abs(stats.possession.home - stats.possession.away); presValue += Math.min(15, diff / 2); if (diff > 10) presInputs.push(`Domínio territorial`) }
  presValue = Math.min(100, Math.round(presValue))

  const pressure: MetricResult = {
    available: stats !== null && (stats.shots !== undefined || stats.corners !== undefined),
    value: presValue,
    label: getLabel(presValue),
    explanation: presValue >= 60 ? 'Volume ofensivo elevado com pressão constante.' : presValue >= 35 ? 'Pressão moderada com ações intermitentes.' : 'Baixo volume ofensivo até o momento.',
    inputs: presInputs,
  }

  // --- Tempo ---
  let tempoValue = 0
  const tempoInputs: string[] = []
  if (min > 0 && stats) {
    const totalEvents = (stats.shots?.home || 0) + (stats.shots?.away || 0) + (stats.corners?.home || 0) + (stats.corners?.away || 0) + (stats.fouls?.home || 0) + (stats.fouls?.away || 0)
    const perMin = totalEvents / min
    tempoValue = Math.min(100, Math.round(perMin * 50))
    tempoInputs.push(`${totalEvents} ações em ${min} minutos`)
  }

  const tempo: MetricResult = {
    available: min > 0 && stats !== null,
    value: tempoValue,
    label: getLabel(tempoValue),
    explanation: tempoValue >= 60 ? 'Ritmo acelerado com sequência de ações.' : tempoValue >= 35 ? 'Ritmo normal para o estágio da partida.' : 'Jogo com poucas ações por minuto.',
    inputs: tempoInputs,
  }

  // --- Confidence ---
  let confValue = 20
  const confInputs: string[] = []
  if (stats?.possession) { confValue += 20; confInputs.push('Posse') }
  if (stats?.shots) { confValue += 15; confInputs.push('Finalizações') }
  if (stats?.shotsOnTarget) { confValue += 10; confInputs.push('No alvo') }
  if (stats?.corners) { confValue += 10; confInputs.push('Escanteios') }
  if (hasEvents) { confValue += 10; confInputs.push('Eventos') }
  if (hasNarration) { confValue += 10; confInputs.push('Narração') }
  if (hasLineups) { confValue += 5; confInputs.push('Escalações') }
  confValue = Math.min(100, Math.round(confValue))

  const confidence: MetricResult = {
    available: true,
    value: confValue,
    label: getLabel(confValue),
    explanation: confValue >= 75 ? 'Dados completos para leitura confiável.' : confValue >= 50 ? 'Dados suficientes para interpretação.' : 'Dados limitados, leitura parcial.',
    inputs: confInputs,
  }

  return { attention, pressure, tempo, confidence }
}
