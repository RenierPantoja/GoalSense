/**
 * Pattern Resolution Engine V2 — resolves triggered alerts with
 * strong/partial confirmation, failure, expiry, and unknown states.
 * No mocks. Uses real score/stats changes only.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { CommandAlertStatus, ResolutionStrength } from '@/context/AlertsContext'

export interface ResolutionInput {
  id: string
  patternName: string
  fixtureId: number
  minuteAtTrigger: number | null
  scoreAtTrigger: { home: number; away: number }
  confidence: number
  createdAt: string
  status: CommandAlertStatus
}

export interface ResolutionResult {
  status: CommandAlertStatus
  strength: ResolutionStrength
  scoreAtResolution: { home: number; away: number }
  reason: string
  evidence: string[]
  confidence: number
}

export function resolveAlert(
  alert: ResolutionInput,
  currentFixture: LiveFixture | undefined
): ResolutionResult | null {
  if (alert.status !== 'pending') return null
  if (!currentFixture) {
    const age = Date.now() - new Date(alert.createdAt).getTime()
    if (age > 3 * 60 * 60 * 1000) {
      return { status: 'expired', strength: 'expired', scoreAtResolution: alert.scoreAtTrigger, reason: 'Partida não encontrada após 3h', evidence: [], confidence: 0 }
    }
    return null
  }

  const isFinished = currentFixture.status.short === 'FT' || currentFixture.raw === 'STATUS_FULL_TIME' || (currentFixture as any)._state === 'post'
  const cH = currentFixture.score.home ?? 0
  const cA = currentFixture.score.away ?? 0
  const tH = alert.scoreAtTrigger.home
  const tA = alert.scoreAtTrigger.away
  const goalsSince = (cH + cA) - (tH + tA)
  const elapsed = currentFixture.status.elapsed || 0
  const trigMin = alert.minuteAtTrigger || 0
  const alertAge = Date.now() - new Date(alert.createdAt).getTime()
  const score = { home: cH, away: cA }
  const pn = alert.patternName.toLowerCase()

  // ─── Time-based expiry ─────────────────────────────────────────────────
  if (alertAge > 2.5 * 60 * 60 * 1000 && !isFinished) {
    return { status: 'expired', strength: 'expired', scoreAtResolution: score, reason: 'Alerta expirou (>2.5h)', evidence: [], confidence: 0 }
  }

  // ─── GOAL-BASED PATTERNS ───────────────────────────────────────────────
  if (pn.includes('pressão por gol') || pn.includes('gol tardio') || pn.includes('over tendência')) {
    if (goalsSince > 0) {
      return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Gol confirmado: ${tH}-${tA} → ${cH}-${cA}`, evidence: [`Gol após disparo`, `Placar mudou de ${tH}-${tA} para ${cH}-${cA}`], confidence: 95 }
    }
    if (isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: 'Jogo terminou sem novo gol', evidence: ['Nenhum gol após o disparo'], confidence: 90 }
    }
    // Window: 20 min for pressure patterns
    if (elapsed - trigMin >= 20 && !isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: '20 min sem gol após disparo', evidence: ['Janela de pressão expirou'], confidence: 70 }
    }
    return null
  }

  // ─── RETA FINAL / 2º TEMPO / TRAVADO / RUPTURA ─────────────────────────
  if (pn.includes('reta final') || pn.includes('segundo tempo') || pn.includes('travado') || pn.includes('ruptura')) {
    if (goalsSince > 0) {
      return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Evento confirmado: gol (${cH}-${cA})`, evidence: [`Gol após disparo`, `${elapsed}'`], confidence: 92 }
    }
    if (isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: 'Jogo terminou sem evento relevante', evidence: ['Sem gol após disparo'], confidence: 85 }
    }
    if (elapsed - trigMin >= 15 && !isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: '15 min sem evento', evidence: ['Janela expirou'], confidence: 65 }
    }
    return null
  }

  // ─── ESCANTEIOS ────────────────────────────────────────────────────────
  if (pn.includes('escanteio')) {
    // Without real-time corner tracking, we can't confirm strongly
    if (goalsSince > 0) {
      return { status: 'confirmed', strength: 'partial_confirmation', scoreAtResolution: score, reason: 'Pressão territorial resultou em gol', evidence: ['Gol após pressão de escanteios'], confidence: 60 }
    }
    if (isFinished) {
      return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Dados de escanteios indisponíveis para confirmação', evidence: ['Provider não fornece escanteios em tempo real'], confidence: 0 }
    }
    if (alertAge > 30 * 60 * 1000) {
      return { status: 'expired', strength: 'expired', scoreAtResolution: score, reason: 'Janela de 30min expirou', evidence: [], confidence: 0 }
    }
    return null
  }

  // ─── CARTÕES ───────────────────────────────────────────────────────────
  if (pn.includes('cartão') || pn.includes('cartões')) {
    // Without real-time card tracking
    if (isFinished) {
      return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Dados de cartões indisponíveis para confirmação automática', evidence: ['Sem tracking de cartões em tempo real'], confidence: 0 }
    }
    if (alertAge > 30 * 60 * 1000) {
      return { status: 'expired', strength: 'expired', scoreAtResolution: score, reason: 'Janela expirou', evidence: [], confidence: 0 }
    }
    return null
  }

  // ─── FAVORITO EM RISCO ─────────────────────────────────────────────────
  if (pn.includes('favorito')) {
    if (isFinished) {
      // At trigger, score was tied or fav was behind. Check final.
      if (cH === cA || (tH <= tA && cH <= cA) || (tA <= tH && cA <= cH)) {
        return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Favorito não venceu: ${cH}-${cA}`, evidence: ['Resultado final confirma risco'], confidence: 90 }
      }
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: `Favorito se recuperou: ${cH}-${cA}`, evidence: ['Favorito virou/venceu'], confidence: 85 }
    }
    return null
  }

  // ─── DOMÍNIO / PRESSIONANDO SEM CONVERTER ──────────────────────────────
  if (pn.includes('domínio') || pn.includes('pressionando')) {
    if (goalsSince > 0) {
      return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Pressão convertida: ${cH}-${cA}`, evidence: ['Gol após domínio'], confidence: 90 }
    }
    if (isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: 'Pressão não convertida até o fim', evidence: ['Sem gol do time dominante'], confidence: 80 }
    }
    if (elapsed - trigMin >= 20) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: '20 min sem conversão', evidence: ['Janela de pressão expirou'], confidence: 65 }
    }
    return null
  }

  // ─── ZEBRA ─────────────────────────────────────────────────────────────
  if (pn.includes('zebra')) {
    if (isFinished) {
      const trigDiff = tH - tA
      const curDiff = cH - cA
      if (Math.abs(curDiff) <= Math.abs(trigDiff) || curDiff * trigDiff >= 0) {
        return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Zebra sustentada: ${cH}-${cA}`, evidence: ['Azarão manteve resultado'], confidence: 88 }
      }
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: `Favorito virou: ${cH}-${cA}`, evidence: ['Resultado revertido'], confidence: 85 }
    }
    return null
  }

  // ─── VISITANTE PERIGOSO ────────────────────────────────────────────────
  if (pn.includes('visitante')) {
    if (cA > tA) {
      return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Visitante marcou: ${cH}-${cA}`, evidence: ['Gol do visitante'], confidence: 92 }
    }
    if (isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: 'Visitante não marcou', evidence: ['Sem gol visitante'], confidence: 80 }
    }
    return null
  }

  // ─── JOGO ABERTO ───────────────────────────────────────────────────────
  if (pn.includes('jogo aberto') || pn.includes('open')) {
    if (goalsSince > 0) {
      return { status: 'confirmed', strength: 'strong_confirmation', scoreAtResolution: score, reason: `Novo gol: ${cH}-${cA}`, evidence: ['Jogo aberto confirmado com gol'], confidence: 88 }
    }
    if (isFinished) {
      return { status: 'failed', strength: 'failed', scoreAtResolution: score, reason: 'Jogo esfriou', evidence: ['Sem novo gol'], confidence: 75 }
    }
    return null
  }

  // ─── GENERIC FALLBACK ──────────────────────────────────────────────────
  if (isFinished) {
    if (goalsSince > 0) {
      return { status: 'confirmed', strength: 'partial_confirmation', scoreAtResolution: score, reason: `Evento após disparo: ${cH}-${cA}`, evidence: ['Gol detectado'], confidence: 60 }
    }
    return { status: 'unknown', strength: 'unknown_data', scoreAtResolution: score, reason: 'Sem dados suficientes para confirmar', evidence: [], confidence: 0 }
  }

  return null
}
