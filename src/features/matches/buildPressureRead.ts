/**
 * Generates analytical reading from pressure timeline data.
 * Current moment, strongest period, last peak — all from real events only.
 */

import type { PressureTimeline } from './buildPressureTimeline'

export interface PressureRead {
  currentMoment: string
  strongestPeriod: string
  lastPeak: string
  tacticalReading: string
  confidence: 'baixa' | 'média' | 'alta'
}

export function buildPressureRead(
  timeline: PressureTimeline,
  homeName: string,
  awayName: string
): PressureRead {
  const { blocks, hasEnoughData, currentMinute } = timeline

  if (!hasEnoughData || blocks.length === 0) {
    return {
      currentMoment: 'Dados insuficientes para leitura recente.',
      strongestPeriod: 'Leitura limitada pelos eventos disponíveis.',
      lastPeak: 'Aguardando mais eventos.',
      tacticalReading: '',
      confidence: 'baixa',
    }
  }

  // 1. Current moment: last 2 blocks (~10 min)
  const recentBlocks = blocks.slice(-2)
  const recentHome = recentBlocks.reduce((sum, b) => sum + b.homePressure, 0)
  const recentAway = recentBlocks.reduce((sum, b) => sum + b.awayPressure, 0)

  let currentMoment: string
  if (recentHome === 0 && recentAway === 0) {
    currentMoment = 'Sem pressão significativa nos últimos minutos.'
  } else if (recentHome > recentAway * 1.6) {
    currentMoment = `${homeName} pressiona nos últimos minutos.`
  } else if (recentAway > recentHome * 1.6) {
    currentMoment = `${awayName} pressiona nos últimos minutos.`
  } else {
    currentMoment = 'Pressão equilibrada.'
  }

  // 2. Strongest period: block with highest total pressure
  let strongestBlock = blocks[0]
  let strongestTotal = 0
  for (const b of blocks) {
    const total = Math.max(b.homePressure, b.awayPressure)
    if (total > strongestTotal) {
      strongestTotal = total
      strongestBlock = b
    }
  }

  const strongTeam = strongestBlock.homePressure > strongestBlock.awayPressure ? homeName : awayName
  const strongestPeriod = strongestTotal > 0
    ? `${strongTeam} teve seu pico entre ${strongestBlock.startMinute}' e ${strongestBlock.endMinute}'.`
    : 'Sem períodos de pressão destacada.'

  // 3. Last peak: last block with significant pressure (> 3 weight)
  let lastPeakText = 'Sem pico recente detectado.'
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.homePressure > 3 || b.awayPressure > 3) {
      const peakTeam = b.homePressure > b.awayPressure ? homeName : awayName
      lastPeakText = `Último pico: ${peakTeam} aos ${b.startMinute}'.`
      break
    }
  }

  // Confidence based on event count and coverage
  const totalEvents = blocks.reduce((s, b) => s + b.homePressure + b.awayPressure, 0)
  const blocksWithData = blocks.filter(b => b.homePressure > 0 || b.awayPressure > 0).length
  const coverage = blocksWithData / Math.max(blocks.length, 1)

  let confidence: PressureRead['confidence'] = 'baixa'
  if (totalEvents > 20 && coverage > 0.5) confidence = 'alta'
  else if (totalEvents > 8 && coverage > 0.3) confidence = 'média'

  // Tactical reading — deeper interpretation
  let tacticalReading = ''
  const totalHome = blocks.reduce((s, b) => s + b.homePressure, 0)
  const totalAway = blocks.reduce((s, b) => s + b.awayPressure, 0)
  const dominantTeam = totalHome > totalAway * 1.3 ? homeName : totalAway > totalHome * 1.3 ? awayName : null

  if (dominantTeam && hasEnoughData) {
    const otherTeam = dominantTeam === homeName ? awayName : homeName
    // Check if the non-dominant team scored (goal against flow)
    if (recentHome > recentAway * 1.3 && dominantTeam === homeName) {
      tacticalReading = `${homeName} pressiona e controla o ritmo do jogo.`
    } else if (recentAway > recentHome * 1.3 && dominantTeam === awayName) {
      tacticalReading = `${awayName} cresce no jogo e empurra o adversário.`
    } else if (dominantTeam) {
      tacticalReading = `${dominantTeam} domina a pressão, mas ${otherTeam} resiste.`
    }
  } else if (hasEnoughData) {
    tacticalReading = 'Pressão equilibrada entre as equipes.'
  }

  return { currentMoment, strongestPeriod, lastPeak: lastPeakText, tacticalReading, confidence }
}
