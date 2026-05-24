/**
 * Pattern Resolution Engine — resolves triggered alerts by comparing
 * the fixture state at trigger time vs current state.
 * No mocks. Uses real score/stats changes.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { TriggeredAlert, TriggeredAlertStatus } from '../types/commandTypes'

export interface ResolutionResult {
  status: TriggeredAlertStatus
  scoreAtResolution?: { home: number; away: number }
  resolutionReason: string
}

/**
 * Resolve a single triggered alert based on current fixture data.
 * Returns null if no resolution can be determined yet.
 */
export function resolveTriggeredAlert(
  alert: TriggeredAlert,
  currentFixture: LiveFixture | undefined
): ResolutionResult | null {
  // Only resolve pending alerts
  if (alert.status !== 'pending') return null

  // If fixture not found, check if alert is old enough to expire
  if (!currentFixture) {
    const age = Date.now() - new Date(alert.timestamp).getTime()
    if (age > 3 * 60 * 60 * 1000) { // 3 hours
      return { status: 'expired', resolutionReason: 'Partida não encontrada após 3h' }
    }
    return null
  }

  const isFinished = currentFixture.status.short === 'FT' || currentFixture.raw === 'STATUS_FULL_TIME' || (currentFixture as any)._state === 'post'
  const currentHome = currentFixture.score.home ?? 0
  const currentAway = currentFixture.score.away ?? 0
  const triggerHome = alert.scoreAtTrigger.home
  const triggerAway = alert.scoreAtTrigger.away
  const goalsSinceTrigger = (currentHome + currentAway) - (triggerHome + triggerAway)
  const currentElapsed = currentFixture.status.elapsed || 0
  const triggerMinute = alert.minute || 0

  // Time-based expiry: if alert is > 2h old and match not finished
  const alertAge = Date.now() - new Date(alert.timestamp).getTime()
  if (alertAge > 2 * 60 * 60 * 1000 && !isFinished) {
    return { status: 'expired', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Alerta expirou (>2h sem resolução)' }
  }

  // Pattern-specific resolution
  const patternName = alert.patternName.toLowerCase()

  // ─── Goal-based patterns ───────────────────────────────────────────────
  if (patternName.includes('pressão por gol') || patternName.includes('gol tardio') || patternName.includes('over tendência')) {
    if (goalsSinceTrigger > 0) {
      return { status: 'confirmed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Gol confirmado: ${triggerHome}-${triggerAway} → ${currentHome}-${currentAway}` }
    }
    if (isFinished) {
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Jogo terminou sem novo gol' }
    }
    return null
  }

  // ─── Reta final / Segundo tempo quente / Jogo travado ──────────────────
  if (patternName.includes('reta final') || patternName.includes('segundo tempo') || patternName.includes('jogo travado') || patternName.includes('ruptura')) {
    if (goalsSinceTrigger > 0) {
      return { status: 'confirmed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Evento confirmado: gol após disparo (${currentHome}-${currentAway})` }
    }
    if (isFinished) {
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Jogo terminou sem evento relevante' }
    }
    // If 15+ minutes passed since trigger without event
    if (currentElapsed - triggerMinute >= 15 && !isFinished) {
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: '15 min sem evento relevante' }
    }
    return null
  }

  // ─── Escanteios em crescimento ─────────────────────────────────────────
  if (patternName.includes('escanteio')) {
    // Can't track corners without stats refresh — resolve on game end or time
    if (isFinished) {
      return { status: 'unknown', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Dados de escanteios indisponíveis para confirmação' }
    }
    if (alertAge > 30 * 60 * 1000) {
      return { status: 'expired', resolutionReason: 'Janela de observação expirou (30min)' }
    }
    return null
  }

  // ─── Cartões em aquecimento ────────────────────────────────────────────
  if (patternName.includes('cartão') || patternName.includes('cartões')) {
    // Without card tracking, resolve on game end
    if (isFinished) {
      return { status: 'unknown', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Dados de cartões indisponíveis para confirmação automática' }
    }
    if (alertAge > 30 * 60 * 1000) {
      return { status: 'expired', resolutionReason: 'Janela expirou' }
    }
    return null
  }

  // ─── Favorito em risco ─────────────────────────────────────────────────
  if (patternName.includes('favorito')) {
    if (isFinished) {
      const scoreDiff = currentHome - currentAway
      // If score is tied or the team that was behind/tied is still not winning
      if (scoreDiff === 0 || (triggerHome <= triggerAway && currentHome <= currentAway) || (triggerAway <= triggerHome && currentAway <= currentHome)) {
        return { status: 'confirmed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Favorito não venceu: ${currentHome}-${currentAway}` }
      }
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Favorito se recuperou: ${currentHome}-${currentAway}` }
    }
    return null
  }

  // ─── Domínio sem resultado / Pressionando sem converter ────────────────
  if (patternName.includes('domínio') || patternName.includes('pressionando')) {
    if (goalsSinceTrigger > 0) {
      return { status: 'confirmed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Gol após pressão: ${currentHome}-${currentAway}` }
    }
    if (isFinished) {
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Pressão não convertida até o fim' }
    }
    if (currentElapsed - triggerMinute >= 20) {
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: '20 min de pressão sem conversão' }
    }
    return null
  }

  // ─── Zebra em formação ─────────────────────────────────────────────────
  if (patternName.includes('zebra')) {
    if (isFinished) {
      // Zebra confirmed if underdog maintained or improved
      const triggerDiff = triggerHome - triggerAway
      const currentDiff = currentHome - currentAway
      if (Math.abs(currentDiff) <= Math.abs(triggerDiff)) {
        return { status: 'confirmed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Zebra sustentada: ${currentHome}-${currentAway}` }
      }
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Favorito virou: ${currentHome}-${currentAway}` }
    }
    return null
  }

  // ─── Visitante perigoso ────────────────────────────────────────────────
  if (patternName.includes('visitante')) {
    if (currentAway > triggerAway) {
      return { status: 'confirmed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Visitante marcou: ${currentHome}-${currentAway}` }
    }
    if (isFinished) {
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Visitante não marcou' }
    }
    return null
  }

  // ─── Jogo aberto ───────────────────────────────────────────────────────
  if (patternName.includes('jogo aberto') || patternName.includes('open')) {
    if (goalsSinceTrigger > 0) {
      return { status: 'confirmed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Novo gol em jogo aberto: ${currentHome}-${currentAway}` }
    }
    if (isFinished) {
      return { status: 'failed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Jogo esfriou sem novo gol' }
    }
    return null
  }

  // ─── Generic fallback ──────────────────────────────────────────────────
  if (isFinished) {
    if (goalsSinceTrigger > 0) {
      return { status: 'confirmed', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: `Evento após disparo: ${currentHome}-${currentAway}` }
    }
    return { status: 'unknown', scoreAtResolution: { home: currentHome, away: currentAway }, resolutionReason: 'Sem dados suficientes para confirmar' }
  }

  return null
}

/**
 * Batch resolve all pending alerts against current fixtures.
 */
export function resolveAllPending(
  alerts: TriggeredAlert[],
  fixtures: LiveFixture[]
): Map<string, ResolutionResult> {
  const results = new Map<string, ResolutionResult>()
  const fixtureMap = new Map(fixtures.map(f => [f.id, f]))

  for (const alert of alerts) {
    if (alert.status !== 'pending') continue
    const fx = fixtureMap.get(alert.fixtureId)
    const result = resolveTriggeredAlert(alert, fx)
    if (result) results.set(alert.id, result)
  }

  return results
}
